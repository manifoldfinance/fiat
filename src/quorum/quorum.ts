
import { JsonRpcProvider } from '@ethersproject/providers';
import { AbiCoder } from '@ethersproject/abi';
import { id as keccak256 } from '@ethersproject/hash';

import { quorum } from '../environment/env';

export interface QuorumNodeCredentials {
  url: string;
  user: string;
}

export function quorumProvider(credential: QuorumNodeCredentials, password: string) {
  return new JsonRpcProvider({
    url: credential.url,
    user: credential.user,
    password
  });
}

/** calculate the solidity function id */
function getFunctionId(functionSignature: string) {
  return keccak256(functionSignature).substr(0, 10);
}

/**
 * Function called after we received an expected payment on our bank account from a buyer.
 * This function will connect to the Bank's quorum node and call the `pay()` function of the movie's smart-contract.
 * This will result in the emitting of `InitiatePayment` events that will be caught by the payment server to end the flow. 
 */
export async function sendPaymentToQuorum(
  /** the eth address of the movie smart-contract */
  contractAddress: string,

  /** list of privateFor of every stakeholders of this movie */
  stakeholdersPrivateFor: string[],

  /** some reference identifying the buyer */
  buyerInfo: string,
  /** the amount payed by the buyer */
  amount: number,
) {
  if (amount < 0) {
    throw new Error(`'amount' must be greater than 0 but ${amount} was given!`);
  }

  const provider = quorumProvider(quorum.bankNode, quorum.password);

  const abiCoder = new AbiCoder();
  const functionId = getFunctionId('pay(string,uint256)');
  const functionParams = abiCoder.encode(
    ['string','uint256'],
    [
      buyerInfo,
      amount,
    ]
  ).substr(2); // remove leading '0x'
  const tx = {
    from: quorum.bankNode.ethAddress,
    to: contractAddress,
    gas: '0x2fefd800', // setting 'gas' to 'BLOCK_GAS_LIMIT'
    data: `${functionId}${functionParams}`,
    privateFor: [
      quorum.archipelNode.privateFor, // archipel
      ...stakeholdersPrivateFor,
    ], // this transaction is private between us (archipel), every stakeholders (pulsar) and the bank (who is sending the tx)
  }
  const txHash = await provider.send('eth_sendTransaction', [tx]);
  const txResponse = await provider.getTransaction(txHash);

  // logging to Firebase function's console
  console.log(`quorum movie smart-contract payment sent ! proof (only for authorized nodes) : ${txHash}`);

  return txResponse;
}


export function getEventFilter() {
  return {
    fromBlock: 0,
    toBlock: 'latest',
    topics: [
      keccak256('InitiatePayment(address,uint256,uint256,string)')
    ]
  }
}