
import { promisify } from 'util';
import { access, mkdir, readdir, unlink, rmdir } from 'fs';

const accessAsync = promisify(access);
const mkdirAsync = promisify(mkdir);
const readdirAsync = promisify(readdir);
const unlinkAsync = promisify(unlink);
const rmdirAsync = promisify(rmdir);

// TODO REFACTOR IN A CLASS

// TODO GET FROM CONFIG
export const storageFolder = './tmp';
export const receiptFolder = './tmp/receipt';
export const paymentFolder = './tmp/payment';

export async function initTemporaryStorage() {
  await clearTemporaryStorage();

  try {
    await accessAsync(storageFolder);
  } catch(error) {
    await mkdirAsync(storageFolder);
  }

  try {
    await accessAsync(receiptFolder);
  } catch(error) {
    await mkdirAsync(receiptFolder);
  }

  try {
    await accessAsync(paymentFolder);
  } catch(error) {
    await mkdirAsync(paymentFolder);
  }
}

export async function clearTemporaryStorage() {
  console.warn('This function has been disabled to prevent deleting potentially needed files!');
  return;
  try {
    const fileNames = await readdirAsync(receiptFolder);
    await fileNames.forEach(async name => await unlinkAsync(`${receiptFolder}/${name}`));
  } catch (error) {
    // no folder
  }

  try {
    const fileNames = await readdirAsync(paymentFolder);
    await fileNames.forEach(async name => await unlinkAsync(`${paymentFolder}/${name}`));
  } catch (error) {
    // no folder
  }

  try {
    await rmdirAsync(receiptFolder);
  } catch (error) {
    // no folder
  }

  try {
    await rmdirAsync(paymentFolder);
  } catch (error) {
    // no folder
  }

  try {
    await rmdirAsync(storageFolder);
  } catch (error) {
    // no folder
  }
}