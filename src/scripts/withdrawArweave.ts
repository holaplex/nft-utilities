import Bundlr from '@bundlr-network/client';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { config } from 'dotenv';
import { makeUploadSecretKey } from '../utils/keypair';

(async function (solAmount: number) {
  try {
    config();
    const uploadKeypair = makeUploadSecretKey();

    const bundlr = new Bundlr(
      process.env.NODE_ENV === 'development'
        ? 'https://devnet.bundlr.network'
        : 'https://node1.bundlr.network/',
      'solana',
      uploadKeypair.secretKey,
      {
        providerUrl:
          process.env.NODE_ENV === 'development'
            ? 'https://metaplex.devnet.rpcpool.com'
            : 'https://api.metaplex.solana.com',
      }
    );

    console.log(
      `Current arweave balance: ${(
        await bundlr.getBalance(uploadKeypair.publicKey.toString())
      ).div(LAMPORTS_PER_SOL)}`
    );

    console.log(`Withdrawing ${solAmount} SOL`);
    await bundlr.withdrawBalance(new BigNumber(solAmount * LAMPORTS_PER_SOL));
    console.log(`Done :)`);
  } catch (err) {
    console.error(err);
  }
})(1);
