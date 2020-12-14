# Gateway: Fiat Payments

> Banking Gateway Ramp - ACH/SEPA/EBICS

### Colate final amount and generate XML/ACH

```javascript
// create a payment file

// const from: paymentParty = {
//   companyName: 'Cascade8',
//   bic: 'NSMBFRPPXXX',
//   iban: 'FR7630788001000889066000366'
// }
// const to: paymentParty = {
//   companyName: 'Pulsar',
//   bic: 'NSMBFRPPXXX',
//   iban: 'FR7630788001000889066000463'
// }
// const xml = createPaymentXML(from, to, '12.3', 'LOTR'); // sent 28/01/20
// const xml = createPaymentXML(to, from, '14.0', 'XTRF1654Z'); // sent 30/01/20
// const xml = createPaymentXML(from, to, '8.3', 'HP84QR562'); // sent 31/01/20
// const xml = createPaymentXML(from, to, '11.1', '785AZ247E'); // sent 4/01/20
// const xml = createPaymentXML(from, to, '11.1', 'AQPD8E1Z3'); // sent 4/01/20
// const xml = createPaymentXML(to, from, '19.95', '1QSDSDF5X'); // TODO send 5/02/20
// await asyncWrite('./example/payment/sepa_test.xml', xml);
// console.log('file written !');
```

### Ethereum Address to Banking Account

```javascript
// convert Ethereum address to an org then to a bankAccount
const to = await retrieveBankAccountFromEthAddress(shareOwner);
// const to: paymentParty = {
//   companyName: 'Pulsar',
//   bic: 'NSMBFRPPXXX',
//   iban: 'FR7630788001000889066000463'
```

### Create Payment

```javascript
// const from: paymentParty = {
//   companyName: 'Cascade8',
//   bic: 'NSMBFRPPXXX',
//   iban: 'FR7630788001000889066000366'
// }
// const to: paymentParty = {
//   companyName: 'Pulsar',
//   bic: 'NSMBFRPPXXX',
//   iban: 'FR7630788001000889066000463'
// }
// const xml = createPaymentXML(from, to, '12.3', 'LOTR'); // sent 28/01/20
// const xml = createPaymentXML(to, from, '14.0', 'XTRF1654Z'); // sent 30/01/20
// const xml = createPaymentXML(from, to, '8.3', 'HP84QR562'); // sent 31/01/20
// const xml = createPaymentXML(from, to, '11.1', '785AZ247E'); // sent 4/01/20
// const xml = createPaymentXML(from, to, '11.1', 'AQPD8E1Z3'); // sent 4/01/20
const xml = createPaymentXML(to, from, "19.95", "1QSDSDF5X"); // TODO send 5/02/20
await asyncWrite("./example/payment/sepa_test.xml", xml);
console.log("file written !");
// const xml = createPaymentXML(to, from, '19.95', '1QSDSDF5X'); // TODO send 5/02/20
// await asyncWrite('./example/payment/sepa_test.xml', xml);
// console.log('file written !');
```

### Get Event Filter

```javscript
export function getEventFilter() {
  return {
    fromBlock: 0,
    toBlock: 'latest',
    topics: [
      keccak256('InitiatePayment(address,uint256,uint256,string)')
    ]
  }
}
```

### Retreive Expected Payments

```javascript
console.log("retrieving expected payments from firestore");
const expectedPayments: ExpectedPayment[] = [
  {
    fromParty: "CASCADE 8",
    toAccount: "08890660004",
    amount: 11.1,
    ref: "785AZ247E",
    contractAddress: "0xdFF8135c35C9762eAeBD88c99FeC29aCc8C84C79",
    stakeholdersPrivateFor: [quorum.pulsarlNode.privateFor],
  },
];
```

```javascript
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
```

## License

Apache-2.0
