
import { promisify } from 'util';
import { writeFile } from 'fs';

import { quorumProvider, getEventFilter } from '../quorum/quorum';
import { quorum } from '../environment/env';
import { Log } from '@ethersproject/providers';
import { AbiCoder } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber'
import { initTemporaryStorage, paymentFolder } from '../storage/storage';
import { checkEbicsProcess, uploadPaymentToEbics } from '../ebics/ebics';
import { PaymentParty, createPaymentXML } from './payment';
import { retrieveBankAccountFromEthAddress } from '../firestore/firestore';

const asyncWrite = promisify(writeFile);

async function main() {

  console.log('storage initialization');
  await initTemporaryStorage();
  console.log('storage ok');

  console.log('process checking');
  await checkEbicsProcess();
  console.log('process ok');

  const provider = quorumProvider(quorum.bankNode, quorum.password);
  const eventFilter = getEventFilter();
  const abiCoder = new AbiCoder();
  console.log('Ready! Awaiting payment events...');
  provider.on(eventFilter, async (event: Log) => {
    const movieContract = event.address;
    const [buyer] = abiCoder.decode(['string'], event.data);
    const [_, rawShareOwner, rawPercentage, rawAmount] = event.topics;
    const [shareOwner] = abiCoder.decode(['address'], rawShareOwner);
    const percentage = BigNumber.from(rawPercentage).toNumber() / 1000; // ! divide by 1000 to get back the original number (solidity doesn't handle float)
    const amount = BigNumber.from(rawAmount).toNumber() / 1000;

    const amountToSend = amount / 100 * percentage;

    console.log(`${shareOwner} received a payment from ${buyer} for the movie ${movieContract} : ${percentage}% of $${amount} = ${amountToSend}`);
    
    // Archipel Account
    const from: PaymentParty = { // TODO get from config
      companyName: 'Cascade8',
      bic: 'NSMBFRPPXXX',
      iban: 'FR7630788001000889066000366'
    }

    const to = await retrieveBankAccountFromEthAddress(shareOwner);

    const xml = createPaymentXML(from, to, `${amountToSend}`, buyer);
    const filePath = `${paymentFolder}/${buyer}-${amountToSend}-${to.companyName}-${Date.now()}.xml`;
    await asyncWrite(filePath, xml);
    console.log('file written !');

    console.log('sending sepa payment order to the bank');
    // await uploadPaymentToEbics(filePath); // ! UNCOMMENT FOR PROD
    console.log('payment sent !');

    // TODO FIRESTORE mark payment has sent ?

  });
}

main();