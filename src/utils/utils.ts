
/**
 * Convert an alphanumerical code into a number according to the RIB spec
 * @param value an alphanumerical string
 */
function toRIBNumber(value: string) {
  const numericString = value.split('').map(char => {
    switch(char) {
      case '0': return '0';
      case '1': return '1';
      case '2': return '2';
      case '3': return '3';
      case '4': return '4';
      case '5': return '5';
      case '6': return '6';
      case '7': return '7';
      case '8': return '8';
      case '9': return '9';

      case 'A': case 'J': return '1';
      case 'B': case 'K': case 'S': return '2';
      case 'C': case 'L': case 'T': return '3';
      case 'D': case 'M': case 'U': return '4';
      case 'E': case 'N': case 'V': return '5';
      case 'F': case 'O': case 'W': return '6';
      case 'G': case 'P': case 'X': return '7';
      case 'H': case 'Q': case 'Y': return '8';
      case 'I': case 'R': case 'Z': return '9';

      default: throw new Error(`Invalid RIB Character : ${char}`);
    }
  }).join('');

  const num = Number.parseInt(numericString);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid RIB Filed : ${value} could not be parsed into a number`);
  }

  return num;
}

/**
 * Calculate the RIB Key from the RIB components
 * @param bankCode an alphanumerical string representing the bank code
 * @param counterCode an alphanumerical string representing the bank code
 * @param account an alphanumerical string representing the bank code
 */
function getRIBKey(bankCode: string, counterCode: string, account: string) {
  const numericBankCode = toRIBNumber(bankCode) * 89;
  const numericCounterCode = toRIBNumber(counterCode) * 15;
  const numericAccount = toRIBNumber(account) * 3;

  const sum = (numericBankCode + numericCounterCode + numericAccount) % 97
  return 97 - sum;
}

/**
 * Calculate the RIB number from the RIB components
 * @param bankCode an alphanumerical string representing the bank code
 * @param counterCode an alphanumerical string representing the bank code
 * @param account an alphanumerical string representing the bank code
 */
export function getRIB(bankCode: string, counterCode: string, account: string) {
  const ribKey = getRIBKey(bankCode, counterCode, account);
  return `${bankCode}${counterCode}${account}${ribKey}`;
}

export interface OperationType {
  type: string;
  isCredit: boolean | undefined; // undefined means it can be both a credit or a debit, we should then rely on amount sign to determine this value
}

/** Parse the CFONB inter bank operation code into a detailed object */
export function parseInterBankOperationCode(code: string): OperationType {

  // valid code are 01-99, A1-A6, and B1-B6, to get the full list open the link below
  if ((/[0-9]{2}$/.test(code) || /^[A-B]{1}[1-6]{1}$/.test(code)) && code !== '00') {

    // CFONB inter bank operation code (in french) : https://fr.wikibooks.org/wiki/Introduction_au_cours_de_questions_mon%C3%A9taires_et_financi%C3%A8res/Cfonb120_code_interbancaire
    switch(code) {

      // ? TO ADD NEW CODE GO TO THE LINK ABOVE AN ADD THE CORRESPONDING 'CASE' LINE

      case '05': return {type: 'payment received', isCredit: true};
      case '06': return {type: 'payment sent', isCredit: false};
      case '14': return {type: 'treasury payment sent', isCredit: false};
      case '41': return {type: 'payment sent/received to/from abroad', isCredit: undefined};
      default:
        throw new Error (`Not implemented : the code ${code} is valid, but it has not been implemented, please contact a dev to add this code!`);
    }
  } else {
    throw new Error('Invalid Inter Bank Operation Code : Inter Bank Operation Code range from 01 to 99, from A1 to A6 or from B1 to B6 !');
  }
}