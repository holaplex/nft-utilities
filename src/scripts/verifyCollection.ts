import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

import { getMasterEdition, getMetadata } from '../utils/metaplex';
import {
  makeUpdateAuthKeypair,
  makeCollectionUpdateAuthKeypair,
} from '../utils/keypair';
import {
  createSetAndVerifySizedCollectionItemInstruction,
  createVerifySizedCollectionItemInstruction,
  Metadata,
} from '@metaplex-foundation/mpl-token-metadata';
import { config } from 'dotenv';
import { readJSON } from 'fs-extra';

(async function (countPerBatch: number = 20) {
  config();
  try {
    const cache = await readJSON(`${__dirname}/../../.cache/data.json`);

    if (!cache?.collection?.mintAddress) {
      throw new Error('Collection mint not found');
    }

    const collectionMint = new PublicKey(cache.collection.mintAddress);

    const mintList = Object.entries(cache)
      .filter(([key]) => !key.startsWith('collection'))
      .map(([_, value]) => {
        return (value as { mintAddress: string }).mintAddress;
      });

    if (!process.env.RPC_URL) {
      throw new Error('No RPC_URL found');
    }

    const updateAuthKeypair = makeUpdateAuthKeypair();
    const collectionUpdateKeypair = makeCollectionUpdateAuthKeypair();

    const connection = new Connection(process.env.RPC_URL, 'confirmed');
    const [collectionMetadata] = await getMetadata(collectionMint);
    const [collectionMasterEdition] = await getMasterEdition(collectionMint);

    const mintListCount = mintList.length;
    const totalBatches = Math.ceil(mintListCount / countPerBatch);

    for (const batch of Array.from({ length: totalBatches }, (_, i) => i)) {
      let isDone = false;

      const subList = mintList.slice(
        batch * countPerBatch,
        batch * countPerBatch + countPerBatch
      );

      // @ts-ignore
      const verifyIxs: TransactionInstruction[] = (
        await Promise.all(
          subList.map(async (mintRaw: string) => {
            const mint = new PublicKey(mintRaw);
            const [metadata] = await getMetadata(mint);

            const { collection } = await Metadata.fromAccountAddress(
              connection,
              metadata
            );

            if (collection?.verified) return null;

            return collection
              ? createVerifySizedCollectionItemInstruction({
                  collection: collectionMetadata,
                  collectionAuthority: updateAuthKeypair.publicKey,
                  collectionMasterEditionAccount: collectionMasterEdition,
                  collectionAuthorityRecord: undefined,
                  payer: updateAuthKeypair.publicKey,
                  metadata,
                  collectionMint,
                })
              : createSetAndVerifySizedCollectionItemInstruction({
                  collection: collectionMetadata,
                  collectionAuthority: updateAuthKeypair.publicKey,
                  collectionMasterEditionAccount: collectionMasterEdition,
                  collectionAuthorityRecord: undefined,
                  payer: updateAuthKeypair.publicKey,
                  metadata,
                  collectionMint,
                  updateAuthority: updateAuthKeypair.publicKey,
                });
          })
        )
      ).filter((ix) => !!ix);

      if (verifyIxs.length === 0) {
        console.log(`Batch ${batch + 1} already verified`);
        continue;
      }

      while (!isDone) {
        try {
          console.log(`Verifying batch ${batch + 1}`);
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();

          const tx = new Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: updateAuthKeypair.publicKey,
          }).add(...verifyIxs);

          const txHash = await connection.sendTransaction(tx, [
            updateAuthKeypair,
            collectionUpdateKeypair,
          ]);

          await connection.confirmTransaction(
            {
              blockhash,
              lastValidBlockHeight,
              signature: txHash,
            },
            'singleGossip'
          );

          console.log(`Batch ${batch + 1} done. Tx hash: ${txHash}\n`);

          isDone = true;
        } catch (err) {
          console.error(err);
          continue;
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
})();
