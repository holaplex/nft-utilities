import { Keypair } from '@solana/web3.js';

export const makeUploadSecretKey = () => {
  const uploadKeySecret = JSON.parse(
    process.env.ARWEAVE_UPLOADER_KEY_SECRET || '[]'
  );
  return Keypair.fromSecretKey(Uint8Array.from(uploadKeySecret));
};

export const makeUpdateAuthKeypair = () => {
  const updateAuthKeypair = JSON.parse(
    process.env.UPDATE_AUTHORITY_SECRET || '[]'
  );
  return Keypair.fromSecretKey(Uint8Array.from(updateAuthKeypair));
};

export const makeCollectionUpdateAuthKeypair = () => {
  const collectionUpdateAuthKeypair = JSON.parse(
    process.env.COLLECTION_UPDATE_AUTHORITY_SECRET || '[]'
  );
  return Keypair.fromSecretKey(Uint8Array.from(collectionUpdateAuthKeypair));
};
