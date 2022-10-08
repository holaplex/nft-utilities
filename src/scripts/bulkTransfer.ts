import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { readJSON } from 'fs-extra';
import { makeUpdateAuthKeypair } from '../utils/keypair';
import { config } from 'dotenv';

(async function (amountToSend: number, receiver: PublicKey) {
  config();

  if (!process.env.RPC_URL) {
    throw new Error('No RPC_URL found');
  }

  const cache = await readJSON(`${__dirname}/../../.cache/data.json`);
  const mintList = Object.entries(cache)
    .filter(([key]) => !key.startsWith('collection'))
    .map(([_, value]) => {
      return (value as { mintAddress: string }).mintAddress;
    });

  const senderKeypair = makeUpdateAuthKeypair();
  console.log(`Sender: ${senderKeypair.publicKey.toString()}`);

  const connection = new Connection(process.env.RPC_URL, 'confirmed');
  const instructionsPerTx = 5;
  const batches = Array.from(
    { length: Math.ceil(amountToSend / instructionsPerTx) },
    (_, i) => i
  );

  for (const batch of batches) {
    console.log(`Batch number ${batch}`);
    const subList = mintList.slice(
      batch * instructionsPerTx,
      batch * instructionsPerTx + instructionsPerTx
    );

    const instructions: TransactionInstruction[] = [];
    for (const mintAddressRaw of subList) {
      if (!mintAddressRaw) throw new Error('Invalid Mint address');

      const mintPub = new PublicKey(mintAddressRaw);
      const tokenAddress = await getAssociatedTokenAddress(
        mintPub,
        senderKeypair.publicKey
      );

      const receiverTokenAddress = await getAssociatedTokenAddress(
        mintPub,
        receiver
      );

      const senderTokenAccountInfo = await connection.getAccountInfo(
        tokenAddress
      );

      if (!senderTokenAccountInfo) {
        console.log('Token account empty. Moving to next mint');
        continue;
      }

      const receiverTokenInfo = await connection.getAccountInfo(
        receiverTokenAddress
      );

      !receiverTokenInfo &&
        instructions.push(
          createAssociatedTokenAccountInstruction(
            senderKeypair.publicKey,
            receiverTokenAddress,
            receiver,
            mintPub
          )
        );

      instructions.push(
        createTransferCheckedInstruction(
          tokenAddress,
          mintPub,
          receiverTokenAddress,
          senderKeypair.publicKey,
          1,
          0,
          []
        ),
        createCloseAccountInstruction(
          tokenAddress,
          senderKeypair.publicKey,
          senderKeypair.publicKey,
          []
        )
      );
    }

    if (instructions.length > 1) {
      const blockHash = await connection.getLatestBlockhash();
      const transaction = new Transaction({
        ...blockHash,
        feePayer: senderKeypair.publicKey,
      });

      transaction.add(...instructions);
      const txHash = await connection.sendTransaction(transaction, [
        senderKeypair,
      ]);

      await connection.confirmTransaction(
        { signature: txHash, ...blockHash },
        'singleGossip'
      );

      console.log(`Batch ${batch} complete. Tx Hash: ${txHash}`);
    }
  }
})(10, new PublicKey('trueG9tqXnY8oQy4PJ6rXuAF7Qh9HRtx8VgDGB4J1Q4'));
