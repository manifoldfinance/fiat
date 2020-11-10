
import { promisify } from 'util';
import { exec } from 'child_process';
import { default as FTPS} from 'ftps';
import { receiptFolder, paymentFolder } from '../storage/storage';
import { ftpsCredentials } from '../environment/env';

const asyncExec = promisify(exec);

/**
 * This function check if the node execution environnement has access to the lftp program.
 * It do so buy running the `child_process.exec()` function and catching potential errors.
 */
export async function checkFtpsProcess() {
  try {
    // execute 'lftp -v', in case of success it will return something like 'v10.0.3' to the stdout
    // resulting in doing nothing then returning true
    // in case of failure it will return something like 'lftp is not a known command' to stderr that will be caught
    await asyncExec('lftp -v');
  } catch(error) {
    throw new Error('\n\nlftp is not available! Please install it in order to use this program!\n\n\tsudo apt-get install lftp\n\n');
  }
  return true;
}

/** This function create a new ftps instance from the given configuration credentials */
function getFtps() {
  return new FTPS(ftpsCredentials)
}

/**
 * This function check if the ftps connection is successful.
 * It do so by sending a `ls` command to the server and catching potential errors.
 */
export async function checkFtpsConnection() {
  // retrieve ftps instance 
  const ftps = getFtps();

  return new Promise<boolean>((resolve, reject) => {
    // send 'ls' command then execute a callback that will resolve or reject the promise
    ftps.ls().exec((error, result) => {
      if (!!error) { // an exception as occurred
        reject(error);
      } else {
        if (!!result.error) { // everything went ok (request/answer) but the server has returned an error
          reject(result.error);
        }
        resolve(true);
      }
    });
  });
}

interface LsResult {
  isFile: boolean;
  name: string;
}
/**
 * This take the raw response of an `ls` command and parse it into an array of LsResult.
 * @param result a string representing the raw server response of an `ls` command
 */
function parseLsResult(result: string): LsResult[] {

  // split result by lines, filter empty lines, then split lines into columns and filter empty columns
  const lines = result.split('\n');
  const columns: string[][] = [];
  lines.forEach(line => {
    if (line !== '') {
      const dirtyColumns = line.split(' ');
      columns.push(dirtyColumns.filter(column => column !== ''));
    }
  });

  // check that lines are correctly formed of 9 columns
  columns.forEach(line => {
    if (line.length !== 9) {
      throw new Error(`LS Parse : the following data could not be parsed as an LS result:\n${result}`);
    }
  })

  return columns.map(column => {

    // first column is the chmod, the first char is '-' for a file and 'd' or 'l' for a directory (or link)
    const permissions = column[0];
    let isFile = permissions.startsWith('-');

    // in 'ls' the file name is the last column
    const name = column[8];
    return {isFile, name};
  });
}

/**
 * This function will download the receipts file form the server.
 * It works by listing all the files of the receipt folder *(witch is set in the config)*.
 * Then downloading all the listed files one by one to the temporary receipt folder *(also set in the config)*.
 */
export async function getReceipts() {
  // retrieve ftps instance
  const ftps = getFtps();

  // get local and remote folders from config
  const remoteFolder = './releves/RDC'; // TODO get folder from config
  const localFolder = receiptFolder;

  // listing all existing files in the remote folder
  const fileNames = await new Promise<string[]>((resolve, reject) => {
    // 'cd' to remote folder then 'ls' then execute callback
     ftps.cd(remoteFolder).ls().exec((error, result) => { 
      if (!!error) { // an exception as occurred
        reject(error);
      } else {
        if (!!result.error) { // everything went ok (request/answer) but the server has returned an error
          reject(result.error);
        }
        if (!result.data) {
          resolve([]); // no files = empty folder
        } else {
          // parse the raw 'ls' result to extract the file names
          const list = parseLsResult(result.data);
          resolve(list.filter(result => result.isFile).map(file => file.name));
        }
      }
    });
  });

  // downloading listed files one by one (at the same time with Promise.all)
  // it return an array of successfully downloaded file names or an empty string for failed files
  const downloadedFileNames = await Promise.all(fileNames.map(fileName => {
    return new Promise<string>(resolve => {
      // 'get' the current file (download to the given folder) then execute the callback 
      ftps.get(`${remoteFolder}/${fileName}`, `${localFolder}/${fileName}`).exec((error, result) => {
        if (!!error || !!result.error) {

          // something went wrong : the file wasn't downloaded, but we still want the other files
          // so we simply log the error and resolve an empty string
          // because Promise.all is all or nothing a reject would have stop the remaining downloads
          console.warn(`An error as prevent ${fileName} to be correctly downloaded!`);
          console.warn(error, result.error);
          resolve('');

        } else {
          resolve(fileName); // resolve to the file name
        }
      });
    });
  }));

  // filter the failed files (empty string)
  return downloadedFileNames.filter(fileName => fileName !== '');
}

/**
 * This function will upload all the given payment files one by one
 * from the local payment folder *(set in config)* to the remote payment folder *(also set in config)*.
 */
export async function sendPayment(fileNames: string[]) { // TODO TEST THIS FUNCTION WITH 1 AND MORE FILES !!!
  const ftps = getFtps();

  // get local and remote folders from config
  const remoteFolder = './upload-VARIABLE/VDESJ3'; // TODO get folder from config
  const localFolder = paymentFolder;

  // uploading given files one by one (at the same time with Promise.all)
  // it return an array of successfully uploaded file names or an empty string for failed files
  const uploadedFiles = await Promise.all(
    fileNames.map(fileName =>
      new Promise<string>(resolve => {
        // 'put' then execute callback
        ftps.put(`${localFolder}/${fileName}`, `${remoteFolder}/${fileName}`).exec((error, result) => {
          if (!!error || !!result.error) {

            // something went wrong : the file wasn't uploaded, but we still want the other files
            // so we simply log the error and resolve an empty string
            // because Promise.all is all or nothing a reject would have stop the remaining uploads
            console.warn(`An error as prevent ${fileName} to be correctly uploaded!!`);
            console.warn(error, result.error);
            resolve('');

          } else {
            resolve(fileName); // resolve to the file name
          }
        });
      })
    )
  );

  return uploadedFiles.filter(fileName => fileName !== '');
}