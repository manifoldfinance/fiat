
import { promisify } from 'util';
import { exec } from 'child_process';
import { access } from 'fs';
import { receiptFolder } from '../storage/storage';

const asyncExec = promisify(exec);
const accessAsync = promisify(access);

type DownloadCommand = {command: '--fdl --output', filePath: string};
type UploadCommand = {command: '--ful --input', filePath: string};
type CommandString = DownloadCommand | UploadCommand;

async function invokeEbics(commandString?: CommandString) {
  try {
    const command = `java -jar ./ebics-client/ebics-1.1-SNAPSHOT.jar --dir ./ebics-client ${commandString?.command || ''} ${commandString?.filePath || ''}`;
    console.log('$>', command);
    await asyncExec(command); // actual command invoke via child_process
  } catch(error) {
    console.error('\n\nAn error occurred inside the ebics-client!\n\n');
    throw new Error(error);
  }
}

/**
 * This function checks :
 * - if the node execution environnement has access to java,
 * - if the ebics-client folder exists and contains the expected files,
 * - if the node process can call the ebics-client jar
 * It do so buy running the `child_process.exec()` function and catching potential errors.
 */
export async function checkEbicsProcess() {

  // checking access to Java
  try {
    await asyncExec('java --version');
  } catch(error) {
    throw new Error('\n\njava is not available! Please install it in order to use this program!\n\n');
  }

  // check if the jar exists
  try {
    await accessAsync('./ebics-client/ebics-1.1-SNAPSHOT.jar');
  } catch(error) {
    throw new Error('\n\nEbics Client doesn\'t exist! Please contact a dev!\n\n');
  }

  // check if folder contains everything it needs
  try {
    await accessAsync('./ebics-client/users');
  } catch(error) {
    throw new Error('\n\nEbics Client exist but is not correctly initialized! Please contact a dev!\n\n');
  }

  // try to run the jar
  try {
    await invokeEbics();
  } catch(error) {
    console.error('\n\nEbics Client could not be invoked!\n\n');
    throw new Error(error);
  }

  return true;
}

export async function downloadReceiptsFromEbics() {
  const timestamp = Date.now();
  const filePath = `${receiptFolder}/receipts-${timestamp}.cfonb120`;

  try {
    await invokeEbics({command: '--fdl --output', filePath});
  } catch (error) {
    
    if ((error.message as string).includes('Aucune donn�e disponible pour t�l�chargement')) {
      throw new Error('\n\nThe receipt of today has already been downloaded and is no longer available!\n\n')
    } else {
      console.log('\n\nThe download of receipt via ebics has failed!\n\n');
      throw new Error(error);
    }
  }

  return filePath;
}

export async function uploadPaymentToEbics(filePath: string) {

  try {
    await accessAsync(filePath);
  } catch(error) {
    throw new Error('\n\nPayment File not found or cannot be accessed!\n\n');
  }

  try {
    await invokeEbics({command: '--ful --input', filePath})
  } catch (error) {
    console.log('\n\nThe upload of payment file has failed!\n\n');
    throw new Error(error);
  }
}
