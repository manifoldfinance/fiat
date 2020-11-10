
import { initializeApp } from 'firebase-admin';
import { ExpectedPayment, Movement } from '../receipt/receipt';
import { PaymentParty } from '../payment/payment';

const app = initializeApp();
const db = app.firestore();

/** This interface come from the Draw.io data model */
interface InvoiceTitleDetails {
  titleId: string;
  price: number;
}
export interface MovieQuorumInfo {
  amount: number;
  ethContractAddress: string;
  stakeholdersPrivateFor: string[];
}

/** Perform a read & write to firestore to check that the app can access the DB
 * and to save the last time that the server has run
*/
export async function checkFirestoreConnection() {

  // perform a write
  const timestamp = Date.now();
  await db.collection('_META').doc('_BANK').set({lastConnection: timestamp});
  
  // assert the read correspond
  const metaBankRef = await db.collection('_META').doc('_BANK').get();
  if (!metaBankRef.exists) {
    throw new Error('Something went wrong!');
  } else {
    const data = metaBankRef.data();
    if (data!.lastConnection === timestamp) {
      return true;
    } else {
      throw new Error('Something went wrong!');
    }
  }
}

/** Check all invoice object where `invoice.status === 'due'`
 * and construct an ExpectedPayment object from every selected due invoices
*/
export async function retrieveExpectedPayments() {

  const querySnapshot = await db.collection('invoices').where('status', '==', 'due').get();
  const expectedPayments: ExpectedPayment[] = []
  querySnapshot.forEach(invoice => {
    const invoiceData = invoice.data();
    expectedPayments.push({
      invoiceId: invoice.id,
      fromParty: invoiceData.account.name,
      amount: invoiceData.price,
      ref: invoiceData.paymentRef,
    });
  });
  return expectedPayments;
}

/**
 * Perform all the Firestore queries needed to get smart-contract addresses and privateFor lists for a given invoice
 */
export async function retrieveMoviesQuorumInfoFromInvoice(invoiceId: string) {

  const invoiceSnapshot = await db.collection('invoices').doc(invoiceId).get();
  const invoiceData = invoiceSnapshot.data();
  if (!invoiceData) {
    throw new Error(`Invoice Not Found : the invoice with id ${invoiceId} doesn't exist ! This is probably caused by incoherent data in the firestore.`);
  }
  const moviesQuorumInfoPromises = (invoiceData.titles as InvoiceTitleDetails[]).map(async title => {
    const movieId = title.titleId;
    const amount = title.price;

    const movieSnapshot = await db.collection('movies').doc(movieId).get();
    const movieData = movieSnapshot.data();
    if (!movieData) {
      throw new Error(`Movie Not Found : the movie with id ${movieId} doesn't exist ! This means that invoice #${invoiceId} contains incoherent 'titles' data.`);
    }
    const ethContractAddress = movieData.quorum.address;
    const stakeholdersEthAddresses = movieData.quorum.stakeholderNodes as string[];

    const stakeholdersPrivateForPromises = stakeholdersEthAddresses.map(async ethAddress => {
      const nodeSnapshot = await db.collection('quorumNodes').doc(ethAddress).get();
      const nodeData = nodeSnapshot.data();
      if (!nodeData) {
        throw new Error(`Quorum Node Not Found : the quorum node with address ${ethAddress} doesn't exist ! This means that the 'quorum.stakeholderNodes' key of the movie ${movieId} contains incoherent data.`);
      }
      return nodeData.privateFor as string;
    });
    const stakeholdersPrivateFor = await Promise.all(stakeholdersPrivateForPromises);

    return {amount, ethContractAddress, stakeholdersPrivateFor} as MovieQuorumInfo;
  });

  return Promise.all(moviesQuorumInfoPromises);
}

/** set teh `status` field of a given invoice firestore document to 'paid' */
export async function setInvoiceStatusToPaid(invoiceId: string, txHashProofs: string[]) {
  try {
    await db.collection('invoices').doc(invoiceId).update({status: 'paid', txHashProofs});
  } catch (error) {
    console.error(`The update of the invoice ${invoiceId} has failed !`);
    throw error;
  }
}

/** save unmatched payment to firestore `unmatchedPayments` collection, so that they can be treated by an admin */
export async function persistUnmatchedPayment(payment: {account: string, movement: Movement}) {
  try {
    await db.collection('unmatchedPayments').add(payment);
  } catch (error) {
    // ! THIS IS A CRITICAL ERROR THAT SHOULD NEVER EVER HAPPEN
    // ! IT MEANS THAT WE HAVE RECEIVE MONEY FOR AN UNKNOWN REASON
    // ! AND WE HAVE FAIL TO SAVE THAT, SO THE MONEY WILL BE DIFFICULT TO RECOVER FOR THE SENDER
    console.error(`The insertion of the following payment has failed !`);
    console.error(payment);
    throw error;
  }
}

export async function retrieveBankAccountFromEthAddress(ethAddress: string): Promise<PaymentParty> {
  const nodeSnapshot = await db.collection('quorumNodes').doc(ethAddress).get();
  const nodeData = nodeSnapshot.data();

  if (!nodeData) {
    throw new Error(`Quorum Node Not Found : There is no node with address ${ethAddress}!`);
  }

  const orgId = nodeData.orgId;
  const orgSnapshot = await db.collection('orgs').doc(orgId).get();
  const orgData = orgSnapshot.data();

  if (!orgData) {
    throw new Error(`Organization Not Found : There is no org with id ${orgId}!`);
  }

  return { companyName: orgData.account.name, bic: orgData.account.BIC, iban: orgData.account.IBAN }
}