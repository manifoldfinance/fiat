
import { promisify } from 'util';
import { readFile } from 'fs';
import { config } from 'dotenv';

import { parseBankFile, parseBankReceipt, BankAccount, Movement, splitBankAccounts, mergeBankAccounts, ExpectedPayment, matchPayment } from './receipt';
import { initTemporaryStorage } from '../storage/storage';
import { checkFirestoreConnection, retrieveExpectedPayments, retrieveMoviesQuorumInfoFromInvoice, setInvoiceStatusToPaid, persistUnmatchedPayment } from '../firestore/firestore';
import { checkEbicsProcess, downloadReceiptsFromEbics } from '../ebics/ebics';
import { sendPaymentToQuorum } from '../quorum/quorum';

const asyncRead = promisify(readFile);

async function main() {

  // -------------------------------
  //        INITIALIZATION
  // -------------------------------

  // populate `process.env` from the .env file (used for google firebase admin credentials)
  config();

  // ensure needed temporary download folder exists
  console.log('storage initialization');
  await initTemporaryStorage();
  console.log('storage ok');

  // ensure ebics is ready to be used
  console.log('process checking');
  await checkEbicsProcess();
  console.log('process ok');

  // ensure firestore connection is available and we can read & write
  console.log('firestore connection checking');
  await checkFirestoreConnection();
  console.log('firestore connection ok');


  // -------------------------------
  //       EXPECTED PAYMENTS
  // -------------------------------

  // get every expected payments from the invoices collection
  console.log('retrieving expected payments from firestore');
  const expectedPayments = await retrieveExpectedPayments();
  if (expectedPayments.length > 0) {
    console.log(`got ${expectedPayments.length} expected payments`);
    expectedPayments.forEach(expectedPayment => console.log(expectedPayment));
  }


  // -------------------------------
  //        INCOMING PAYMENTS
  // -------------------------------

  // check our bank accounts for received payments (through the ebics protocol)
  // 1) download receipt file
  console.log('downloading receipt from ebics')

  // const fileName = await downloadReceiptsFromEbics(); // ! PROD uncomment for prod as prod receipt can only been downloaded once per day
  const fileName = `receipts-${Date.now()}.cfonb120`;
  
  console.log(fileName, 'downloaded');

  // 2) parsing receipt file into objects
  console.log('parsing receipts');
  // this line is only for test as prod receipt can only been downloaded once per day
  const data = await asyncRead('./example/receipt/1_test_fdl', 'utf8');
  // const data = await asyncRead(fileName, 'utf8'); // ! PROD use this line in prod

  // one file can contain receipts about several bank accounts
  // a receipt is about ONE account, it start with a '01' record and ends with a '07' record
  // a receipt can have [0-N] '04' record(s) (a.k.a movement record),
  // each '04' record can be followed by [0-N] '05' record(s) (a.k.a complementary info)
  const receipts = parseBankFile(data);

  // a bank account object is just a balance with (optionally) some movements
  const bankAccounts: BankAccount[] = [];
  receipts.forEach(receipt => {
    bankAccounts.push(parseBankReceipt(receipt));
  });

  // previous step returned an array of many bank accounts possibly from different accounts
  // we want to sort them by account number (see `splitBankAccounts()` doc )
  const splitedAccounts = splitBankAccounts(bankAccounts);

  // now that accounts are sorted we will merge them to get only one object by account containing the whole history
  const retrievedAccounts = Object.keys(splitedAccounts)
    .map(key => splitedAccounts[key])
    .map(bankAccount => mergeBankAccounts(bankAccount))
  ;


  // -------------------------------
  //            MATCHING
  // -------------------------------
  
  // record of received payments not matched by any expected payments
  const unknownPayments: Record<string, {account: string, movement: Movement}> = {};

  // for each bank account we will check if we received an expected payment
  const processing = retrievedAccounts.map(async account => {
    console.log(`Bank account ${account.account} :`);

    // to check for expected payment we only need incoming movements (a.k.a payments, a.k.a credits)
    const incomingPayments = account.movements.filter(movement => movement.isCredit);

    // then we will try to match every incoming payments with every expected payment one by one
    // we start to iterate on incoming payments so that we can catch unexpected payment even if the second loop doesn't run at all
    for (let incomingIndex = 0 ; incomingIndex < incomingPayments.length ; incomingIndex++) {
      
      // saving current incoming payments in case we fail to match it
      unknownPayments[incomingIndex] = {account: account.account , movement: incomingPayments[incomingIndex]};

      for (let expectedIndex = 0; expectedIndex < expectedPayments.length ; expectedIndex++) {

        // perform the actual matching test
        if (matchPayment(expectedPayments[expectedIndex], incomingPayments[incomingIndex])) {

          // we have a match so we need to delete the current payment from the unknown list
          delete unknownPayments[incomingIndex];

          const {
            invoiceId,
            fromParty,
            amount,
            ref,
          } = expectedPayments[expectedIndex];

          console.log('payment match !');
          console.log(`# ${ref} : $${amount} from ${fromParty} of invoice ${invoiceId}`);

          console.log('retrieving corresponding movies info from Firestore');
          const moviesQuorumInfo = await retrieveMoviesQuorumInfoFromInvoice(invoiceId);

          const txResponsesPromises = moviesQuorumInfo.map(async info => {
            console.log(`sending transaction for $${info.amount} to the movie @ ${info.ethContractAddress} `);
            // ! Quorum (solidity) can only handle integers, so we multiply amount by 1000 to preserve decimals
            // ! DO NOT FORGET to divide by 1000 on the other side
            const txResponse = await sendPaymentToQuorum(info.ethContractAddress, info.stakeholdersPrivateFor, `${fromParty}-${ref}`, Math.floor(info.amount * 1000));
            return txResponse;
          });

          const txResponses = await Promise.all(txResponsesPromises);
          const txHashs = txResponses.map(response => response.hash);

          console.log(`Updating invoice ${invoiceId} to 'paid' status`);
          setInvoiceStatusToPaid(invoiceId, txHashs);

          // the current incoming payment has been matched and handled,
          // we don't need to test it against other expected payments
          break;
        }
      }
    }

    // catching unexpected payments and saving them to firestore
    Object.keys(unknownPayments).forEach(index => {
      const payment = unknownPayments[index];
      console.log(`Unmatched Payment : on account ${payment.account} from ${payment.movement.otherPartyName} of ${payment.movement.amount}`);
      persistUnmatchedPayment(payment);
    });

  });
  await Promise.all(processing);
  
  // TODO decide archiving policy of receipt files and accounts data
  // console.log('cleaning storage');
  // clearTemporaryStorage();
  // console.log('cleaning ok');

  console.log('end of process');
}

main();