import { getRIB, parseInterBankOperationCode } from "../utils/utils"; // TODO why is this in utils ? is it use elsewhere ? if not move it to this file

interface Balance {
  account: string;
  amount: number;
  date: Date;
}

export interface Movement {
  // otherPartyRIB: string;
  otherPartyName: string;
  amount: number;
  isCredit: boolean;
  date: Date;
  type: string;
  refs: string[];
}

export interface BankAccount {
  account: string
  balance: number;
  lastUpdate: Date;
  movements: Movement[];
}

export interface ExpectedPayment {
  invoiceId: string;
  fromParty: string, // name
  // toAccount: string, // bank account number
  amount: number, // the amount
  ref: string, // some reference string
  // contractAddress: string, // movie smart-contract
  // stakeholdersPrivateFor: string[], // privateFor list
}

/**
 * Parse a string date in the DDMMYY format into a Date object
 * This function will also **assert** that the given string is a **valid date** and will **throw** if not.
 * @param dateDDMMYY : a string representing a date in the DDMMYY format, ex: `'270120'`
 * @example const date = parseDate('270120'); // Date 2020-01-27T00:00:00.000Z
 */
function parseDate(dateDDMMYY: string) {

  // assert parameter length
  if (dateDDMMYY.length !== 6) {
    throw new Error('Invalid date : date must be in the format DDMMYY and composed only of 6 numbers!');
  }

  // split string into date parts
  const decade = dateDDMMYY.substr(4); // ! the CFONB format only support the current decade
  const month = dateDDMMYY.substr(2, 2);
  const day = dateDDMMYY.substr(0, 2);

  // ! Because the CFONB format doesn't support the full year, we will assume that the date is from the current century,
  // ! i.e. if the value is '19' we will assume it means '2019'
  // ! This could result in an error on the first day of every new century
  // ! (I hope for the devs of the year 2100 that this format will not be used anymore)
  const now = new Date();
  const century = now.getFullYear().toString().substr(0, 2); // 2019 -> '20'

  // construct final date string
  const timestamp = Date.parse(`${century}${decade}-${month}-${day}`);

  // assert that the date is valid
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid date : ${century}${decade}-${month}-${day} cannot be converted into a valid date!`);
  }

  // build an return date object
  return new Date(`20${decade}-${month}-${day}`);
}

/**
 * Parse a string representing an amount in the CFONB format into a number.
 * This function will also **assert** that the string is correctly formated and will **throw** if not.
 * @param rawAmount : a string representing an amount in the CFONB format, ex: `'1234Q'`
 * @param numberOfDecimalDigits : a string representing the number of decimal digits of the `rawAmount` parameter
 * @example const amount = parseAmount('1234Q', '2'); // -123.48
 */
function parseAmount(rawAmount: string, numberOfDecimalDigits:string) {

  // assert numberOfDecimalDigits parameter
  const decimals = Number.parseInt(numberOfDecimalDigits);
  if (Number.isNaN(decimals)) {
    throw new Error(`Invalid number of decimals : ${numberOfDecimalDigits} cannot be parsed into a number!`);
  }

  // split rawAmount between integer part and decimal part
  const integerPartLength = 14 - decimals; // 14 is the amount's length as defined in the CFONB specification
  const integerPart = rawAmount.substr(0, integerPartLength);
  const decimalPart = rawAmount.substr(integerPartLength);

  // assert integer part
  const integerCheck = Number.parseInt(integerPart);
  if (Number.isNaN(integerCheck)) {
    throw new Error(`Invalid Amount : Integer part of the amount (${integerPart}) cannot be parsed into a number!`);
  }

  // split decimal part between digits and decimal code
  const decimalNumbers = decimalPart.substr(0, decimalPart.length - 1);
  const decimalCode = decimalPart.substr(decimalPart.length - 1);

  // assert decimal digits
  const decimalNumbersCheck = Number.parseInt(decimalNumbers);
  if (Number.isNaN(decimalNumbersCheck)) {
    throw new Error(`Invalid Amount : Decimals part of the amount (${decimalPart}) cannot be parsed into a number!`);
  }

  // parse decimal code as defined in the spec
  let lastDecimal = 0;
  let isPositive = true;
  switch (decimalCode) {
    case '{': isPositive = true; lastDecimal = 0; break;
    case 'A': isPositive = true; lastDecimal = 1; break;
    case 'B': isPositive = true; lastDecimal = 2; break;
    case 'C': isPositive = true; lastDecimal = 3; break;
    case 'D': isPositive = true; lastDecimal = 4; break;
    case 'E': isPositive = true; lastDecimal = 5; break;
    case 'F': isPositive = true; lastDecimal = 6; break;
    case 'G': isPositive = true; lastDecimal = 7; break;
    case 'H': isPositive = true; lastDecimal = 8; break;
    case 'I': isPositive = true; lastDecimal = 9; break;

    case '}': isPositive = false; lastDecimal = 0; break;
    case 'J': isPositive = false; lastDecimal = 1; break;
    case 'K': isPositive = false; lastDecimal = 2; break;
    case 'L': isPositive = false; lastDecimal = 3; break;
    case 'M': isPositive = false; lastDecimal = 4; break;
    case 'N': isPositive = false; lastDecimal = 5; break;
    case 'O': isPositive = false; lastDecimal = 6; break;
    case 'P': isPositive = false; lastDecimal = 7; break;
    case 'Q': isPositive = false; lastDecimal = 8; break;
    case 'R': isPositive = false; lastDecimal = 9; break;

    default:
      throw new Error(`Invalid Decimal Code : ${decimalCode} is not a known decimal code, it must be in the range "A"-"R", or "{" or "}"!`);
  }

  // construct the final amount as a string
  const amount = `${isPositive ? '' : '-'}${integerPart}.${decimalNumbers}${lastDecimal}`;
  const numberAmount = Number.parseFloat(amount); // parse the string into a float

  // final assert
  if(Number.isNaN(numberAmount)) {
    throw new Error(`Invalid Amount : ${amount} could not be parsed into a number!`);
  }

  return numberAmount;
}

/**
 * Parse an "Old Balance" (01) or a "New Balance" (07) CFONB 120 record into a Balance object.
 * This function **doesn't perform any check** on the input line and on the result.
 * @param line a string of 120 chars in the CFONB 120 format
 */
function parseBalanceRecord(line: string): Balance {

  // get record's field according to the spec
  const bankCode = line.substr(2, 5);
  const reservedArea0 = line.substr(7, 4);
  const counterCode = line.substr(11, 5);
  const currencyCode = line.substr(16, 3);
  const numberOfDecimalDigits = line.substr(19, 1);
  const reservedArea1 = line.substr(20, 1);
  const account = line.substr(21, 11);
  const reservedArea2 = line.substr(32, 2);
  const date = parseDate(line.substr(34, 6));
  const reservedArea3 = line.substr(40, 50);
  const rawAmount = line.substr(90, 14);
  const reservedArea4 = line.substr(104, 16);

  const amount = parseAmount(rawAmount, numberOfDecimalDigits);
  const rib = getRIB(bankCode, counterCode, account)

  return {
    account: rib,
    date,
    amount,
  }
}

/**
 * Parse a "Movement" (04) CFONB 120 record into a Movement object.
 * This function only check if the sign of the amount match the operation type (debit must be negative / credit must be positive).
 * @param line a string of 120 chars in the CFONB 120 format
 */
function parseMovementRecord(line: string): Movement {

  // get record's field according to the spec
  const bankCode = line.substr(2, 5);
  const internalOperationCode = line.substr(7, 4);
  const counterCode = line.substr(11, 5);
  const currency = line.substr(16, 3);
  const numberOfDecimalDigits = line.substr(19, 1);
  const reservedArea0 = line.substr(20, 1);
  const account = line.substr(21, 11);
  const interBankOperationCode = parseInterBankOperationCode(line.substr(32, 2));
  const dateOfAccounting = parseDate(line.substr(34, 6));
  const rejectionCode = line.substr(40, 2);
  const dateOfValue = parseDate(line.substr(42, 6));
  const label = line.substr(48, 31);
  const reservedArea1 = line.substr(79, 2);
  const operationNumber = line.substr(81, 7);
  const exonerationIndex = line.substr(88, 1);
  const unavailabilityIndex = line.substr(89, 1);
  const amount = parseAmount(line.substr(90, 14), numberOfDecimalDigits);
  const reference = line.substr(104, 16);

  const rib = getRIB(bankCode, counterCode, account);

  const isCredit = (Math.sign(amount) === 1 || Math.sign(amount) === 0)
  if (interBankOperationCode.isCredit !== undefined && interBankOperationCode.isCredit !== isCredit) {
    throw new Error(`Incoherent Record : the sign of the movement's amount doesn't match the operation type (i.e. you can't receive a negative amount or send a positive amount) !`);
  }
  
  return {
    // otherPartyRIB: rib,
    otherPartyName: label,
    amount,
    isCredit,
    date: dateOfAccounting,
    type: interBankOperationCode.type,
    refs: [reference]
  };
}

/**
 * Extract references from a "Complementary Movement" (05) CFONB 120 record.
 * This function **doesn't perform any check** on the input line and on the result.
 * @param line a string of 120 chars in the CFONB 120 format
 */
function parseComplementaryMovementRecord(line: string) {
  // get record's field according to the spec
  const complementaryCode = line.substr(46, 3);
  const complementaryInfo = line.substr(48, 70);
  const reservedArea2 = line.substr(118, 2);

  return [complementaryCode, complementaryInfo];
}

/**
 * This function assert than the old balance + every credit - every debit is equal to the new balance.
 * @param bankAccount a BankAccount object containing all the debit/credit along with the new balance
 * @param oldAmount a number representing the old balance of the account
 */
function assertBalances(bankAccount: BankAccount, oldAmount: number) {
  bankAccount.movements.forEach(credit => oldAmount += credit.amount);

  if (oldAmount !== bankAccount.balance) {
    throw new Error('Invalid Receipt : (oldBalance + credits - debits) is not equal to the new balance!');
  }
}

/**
 * Parse a whole CFONB 120 receipt into a BankAccount object.
 * This function **will perform** a number of check on the content of receipt to assert it's validity.
 * @param receipt an utf8 string representing the raw content of a CFONB 120 receipt
 */
export function parseBankReceipt(receipt: string): BankAccount {

  // split the file into records (lines) and only keep the valid records (must be 120 chars long)
  const rawLines = receipt.split('\n');
  const lines = rawLines.filter(line => line.length === 120);

  // assert that the receipt start with an "old balance" record and ends with a "new balance" one
  if (lines[0].substr(0, 2) !== '01') {
    throw new Error('Invalid Record : Receipt file must start with an "Old Balance" record (01)!');
  }
  if (lines[lines.length - 1].substr(0, 2) !== '07') {
    throw new Error('Invalid Record : Receipt file must end with an "New Balance" record (07)!');
  }

  // parse the old and new balance records
  const oldBalance = parseBalanceRecord(lines[0]);
  const newBalance = parseBalanceRecord(lines[lines.length -1]);

  // assert that the old and new balance records refers to the same account
  if (oldBalance.account !== newBalance.account) {
    throw new Error('Invalid Receipt : The "Old Balance" record and the "New Balance" record must refer to the same account!');
  }

  // save the old balance for later balances check
  const oldAmount = oldBalance.amount;

  // create the initial BankAccount with no movement
  const bankAccount: BankAccount = {
    account: newBalance.account,
    balance: newBalance.amount,
    lastUpdate: newBalance.date,
    movements: []
  }

  // if no movements assert balances and return
  if (lines.length === 2) {
    assertBalances(bankAccount, oldAmount);
    return bankAccount;
  }


  // if the file has some movement records the iterate over them (and their complementary records)
  // a "movement" record (04) is followed by [0-n] "complementary movement info" record (05)

  // avoid the first and last records that are already parsed by the above code
  for (let i = 1 ; i < lines.length - 1 ; i++) {
    if (lines[i].substr(0, 2) !== '04') {
      throw new Error(`Unexpected Record : The current record was expected to be a "Movement" record (04), but it was a (${lines[i].substr(0, 2)}) record!`);
    } else {

      // parse the current movement record into a Movement object
      const movIndex = i;
      const movement = parseMovementRecord(lines[i]);
      
      // save the control data of the record, every following complementary record must match this data
      const control = lines[i].substr(2, 40);

      // go to next record
      i++;

      // iterate over every potential complementary records
      while(lines[i].substr(0, 2) === '05') {

        // check that the complementary record match the previously saved control data
        if (lines[i].substr(2, 40) !== control) {
          console.log(control, `at line ${movIndex}`);
          console.log('should be equal to');
          console.log(lines[i].substr(2, 40), `at line ${i}`);
          throw new Error(`Incoherent Records : The "Complementary Information" record (#${i}) doesn\'t match the previous "Movement" record (#${movIndex})!`)
        }

        // parse the complementary record
        const complementaryInfo = parseComplementaryMovementRecord(lines[i]);

        // add the freshly parsed refs to the Movement object
        movement.refs = [...movement.refs, ...complementaryInfo];

        // go to next record
        i++;
      }

      // add the movement and it's refs to the BankAccount object
      bankAccount.movements.push(movement);

      // roll back the last increment of the while loop
      i--;
    }
  }

  // final assert & return
  assertBalances(bankAccount, oldAmount);
  return bankAccount;
}

export function parseBankFile(content: string) {

  // split the file into records (lines) and only keep the valid records (must be 120 chars long)
  const rawLines = content.split('\n');
  const lines = rawLines.filter(line => line.length === 120);

  const receipts: string[][] = [[]];
  let currentReceipt = 0;

  lines.forEach(line => {
    receipts[currentReceipt].push(line);
    if (line.substr(0, 2) === '07') {
      receipts.push([]); // add a new array for the next receipt, (if it was the last, we will need to pop it)
      currentReceipt++;
    }
  });

  receipts.pop(); // remove the extra array

  return receipts.map(receipt => receipt.join('\n'));
}

/**
 * Takes an array of various bank accounts and split it by account numbers.
 * This function return a Record of Arrays (containing bank accounts).
 * The Record is indexed by account number.
 * This function is useful to separate different account before performing a merge
 * @example
 * const accounts = [ account_A_0, account_B_0, account_A_1, account_B_1 ];
 * const result = splitBankAccounts(accounts);
 * // result = {
 * //  'account_A': [account_A_0, account_A_1],
 * //  'account_B': [account_B_0, account_B_1],
 * // }
*/
export function splitBankAccounts(bankAccounts: BankAccount[]) {

  const result: Record<string, BankAccount[]> = {};

  bankAccounts.forEach(bankAccount => {
    if (!result[bankAccount.account]) {
      result[bankAccount.account] = [bankAccount];
    } else {
      result[bankAccount.account].push(bankAccount);
    }
  });

  return result;
}

/**
 * This function takes different parts of the history of an account and merge them into a single bank account object
 * @param bankAccounts an array of bank accounts object, **THEY SHOULD ALL SHARE THE SAME ACCOUNT NUMBER**
 * @example
 * const accounts = [
 *  { accountNumber: 1234, movements: [A, B] },
 *  { accountNumber: 1234, movements: [C, D] },
 * ];
 * const merged = mergeBankAccounts(accounts);
 * // {
 * //   accountNumber: 1234,
 * //   movements: [A, B, C, D]
 * // }
 */
export function mergeBankAccounts(bankAccounts: BankAccount[]) {

  // assert that every account from the params refer to the same account number
  const accountNumber = bankAccounts[0].account;
  bankAccounts.forEach(bankAccount => {
    if (bankAccount.account !== accountNumber) {
      throw new Error(`Unexpected Account : You are trying to merge bank account from different account number, try to split before merging!`);
    }
  });

  const result = bankAccounts[0];
  bankAccounts.forEach((bankAccount, i) => {
    if (i !== 0) {
      result.movements.push(...bankAccount.movements);
      if (bankAccount.lastUpdate > result.lastUpdate) {
        result.balance = bankAccount.balance;
        result.lastUpdate = bankAccount.lastUpdate;
      }
    }
  });

  return result;
}


// ! THIS IS A CRITICAL FUNCTION, BE SURE TO BATTLE TEST IT IN REAL (but closed) PROD ENVIRONNEMENT
/**
 * Matching function that try to see if an expected payment correspond to an incoming payment
 */
export function matchPayment(expectedPayment: ExpectedPayment, incomingPayment: Movement) {
  const isCredit = incomingPayment.isCredit;
  const amountMatch = incomingPayment.amount === expectedPayment.amount;
  const partyMatch = incomingPayment.otherPartyName.includes(expectedPayment.fromParty);
  const refMatch = incomingPayment.refs.some(ref => ref.includes(expectedPayment.ref));

  console.log(isCredit, amountMatch, partyMatch, refMatch);
  
  if (isCredit && amountMatch && partyMatch && refMatch) {
    return true;
  }
  return false;
}