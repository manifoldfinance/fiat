
import { isValid } from 'iban';

export interface PaymentParty {
  companyName: string;
  bic: string;
  iban: string;
}

function isValidBIC(bic: string) {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)
}

function isPrintableASCII(value: string) {
  return /^[\x20-\x7E]{2,60}$/.test(value);
}

function assertParty(party: PaymentParty) {
  if (!isValid(party.iban)) {
    throw new Error(`Invalid IBAN : "${party.iban}" is an invalid IBAN!`);
  }
  if (!isValidBIC(party.bic)) {
    throw new Error(`Invalid BIC : "${party.bic}" is an invalid BIC!`);
  }
  if (party.companyName.length === 0) {
    throw new Error('Invalid Company Name : Company Name cannot be empty!');
  }
  if (party.companyName.length > 60) {
    throw new Error('Invalid Company Name : Company Name is too long (max 60 chars)!');
  }
  if (!isPrintableASCII(party.companyName)) {
    throw new Error('Invalid Company Name : Company Name must be composed only of printable ASCII chars (from x20 to x7E)!');
  }
}

function assertAmount(amount: string) {
  const numberAmount = Number.parseInt(amount);
  if (Number.isNaN(numberAmount)) {
    throw new Error('Invalid Amount : Amount must be a string that represent a valid number!');
  }
  if (numberAmount <= 0) {
    throw new Error('Invalid Amount : Amount must be greater than 0 !')
  }
  if (!/^[0-9]{1,12}\.[0-9]{1,2}$/.test(amount)) {
    throw new Error('Invalid Amount : Amount must be between 1.00 and 999999999999.0 and it should have either 1 or 2 decimal(s)!');
  }
}

function assertReference(reference: string) {
  if (reference.length === 0) {
    throw new Error('Invalid Reference : Reference cannot be empty!');
  }
  if (reference.length > 35) {
    throw new Error('Invalid Reference : Reference is too long (max 35 chars)!');
  }
  if (!isPrintableASCII(reference)) {
    throw new Error('Invalid Reference : Reference must be composed only of printable ASCII chars (from x20 to x7E)!');
  }
}

export function createPaymentXML(from: PaymentParty, to: PaymentParty, amount: string, reference: string) {

  assertParty(from);
  assertParty(to);
  assertAmount(amount);
  assertReference(reference);

  const date = new Date();
  const dateTime = date.toISOString().split('.')[0];
  const isoDate = date.toISOString().split('T')[0];

  return `
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${reference}</MsgId>
      <CreDtTm>${dateTime}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amount}</CtrlSum>
      <InitgPty>
        <Nm>${from.companyName}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${reference}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>${''/* BATCH BOOKING */}
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amount}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${isoDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${from.companyName}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${from.iban}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${from.bic}</BIC>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${reference}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${amount}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BIC>${to.bic}</BIC>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${to.companyName}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${to.iban}</IBAN>
          </Id>
        </CdtrAcct>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
  `;
}