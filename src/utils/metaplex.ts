import {
  createCreateMasterEditionV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  DataV2,
  createCreateMetadataAccountV3Instruction,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  getAssociatedTokenAddress,
  MintLayout,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToCheckedInstruction,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { readJSON, writeJSON } from 'fs-extra';
import { BASE_CONFIG } from '../config';
import { METADATA_PROGRAM_ID } from '../constants';
import { makeCollectionUpdateAuthKeypair } from './keypair';

export const getMetadata = async (mint: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
};

export const getMasterEdition = async (mint: PublicKey) => {
  return PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('edition'),
    ],
    METADATA_PROGRAM_ID
  );
};

export const mintNFT = async (
  jsonPath: string,
  cacheName: string,
  { isCollection = false, shouldOverwrite = false }
) => {
  if (!process.env.RPC_URL) throw new Error('Custom RPC URL required');
  let isDone = false;

  const cachePath = `${__dirname}/../../.cache/data.json`;
  const cache = await readJSON(`${cachePath}`, { encoding: 'utf-8' });

  if (!shouldOverwrite && cache[cacheName]['mintAddress']) {
    return new PublicKey(cache[cacheName]['mintAddress']);
  }

  const metadataJSON = await readJSON(`${jsonPath}`, {
    encoding: 'utf-8',
  });

  const collectionUpdateKeypair = makeCollectionUpdateAuthKeypair();
  const connection = new Connection(process.env.RPC_URL);

  const user = new PublicKey(
    isCollection
      ? BASE_CONFIG.collectionMintDestination
      : BASE_CONFIG.mintDestination
  );

  const mintKeypair = Keypair.generate();
  const [metadataAddress] = await getMetadata(mintKeypair.publicKey);
  const [masterEditionAddress] = await getMasterEdition(mintKeypair.publicKey);
  const associatedTokenAddress = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    user
  );

  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: collectionUpdateKeypair.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(
      MintLayout.span
    ),
    programId: TOKEN_PROGRAM_ID,
    space: MintLayout.span,
  });

  const initMintIx = createInitializeMintInstruction(
    mintKeypair.publicKey,
    0,
    collectionUpdateKeypair.publicKey,
    collectionUpdateKeypair.publicKey,
    TOKEN_PROGRAM_ID
  );

  const createTokenAccountIx = createAssociatedTokenAccountInstruction(
    collectionUpdateKeypair.publicKey,
    associatedTokenAddress,
    user,
    mintKeypair.publicKey
  );

  const mintNFTIx = createMintToCheckedInstruction(
    mintKeypair.publicKey,
    associatedTokenAddress,
    collectionUpdateKeypair.publicKey,
    1,
    0,
    []
  );

  const collectionData = !isCollection
    ? {
        key: new PublicKey(cache['collection']['mintAddress']),
        verified: false,
      }
    : null;

  const metadataData: DataV2 = {
    collection: collectionData,
    creators: (metadataJSON.properties.creators || BASE_CONFIG.creators).map(
      (c: { address: string; share: number }) => ({
        address: new PublicKey(c.address),
        share: c.share,
        verified: c.address === collectionUpdateKeypair.publicKey.toString(),
      })
    ),
    uses: null,
    name: metadataJSON.name,
    symbol: metadataJSON.symbol,
    uri: cache[cacheName].jsonURL,
    sellerFeeBasisPoints:
      metadataJSON.seller_fee_basis_points ||
      BASE_CONFIG.seller_fee_basis_points,
  };

  const createMetadataIx = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataAddress,
      mint: mintKeypair.publicKey,
      mintAuthority: collectionUpdateKeypair.publicKey,
      updateAuthority: collectionUpdateKeypair.publicKey,
      payer: collectionUpdateKeypair.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        isMutable: BASE_CONFIG.isMutable,
        data: metadataData,
        collectionDetails: isCollection
          ? {
              __kind: 'V1',
              size: 0,
            }
          : null,
      },
    }
  );

  const createMasterEditionIx = createCreateMasterEditionV3Instruction(
    {
      edition: masterEditionAddress,
      metadata: metadataAddress,
      mint: mintKeypair.publicKey,
      mintAuthority: collectionUpdateKeypair.publicKey,
      updateAuthority: collectionUpdateKeypair.publicKey,
      payer: collectionUpdateKeypair.publicKey,
    },
    { createMasterEditionArgs: { maxSupply: 0 } }
  );

  const updateMetadataIx = createUpdateMetadataAccountV2Instruction(
    {
      metadata: metadataAddress,
      updateAuthority: collectionUpdateKeypair.publicKey,
    },
    {
      updateMetadataAccountArgsV2: {
        primarySaleHappened: false,
        data: metadataData,
        isMutable: BASE_CONFIG.isMutable,
        updateAuthority: collectionUpdateKeypair.publicKey,
      },
    }
  );

  while (!isDone) {
    try {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const transaction = new Transaction({
        feePayer: collectionUpdateKeypair.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        createMintAccountIx,
        initMintIx,
        createTokenAccountIx,
        mintNFTIx,
        createMetadataIx,
        createMasterEditionIx,
        updateMetadataIx
      );

      const txHash = await connection.sendTransaction(
        transaction,
        [collectionUpdateKeypair, mintKeypair],
        { skipPreflight: false }
      );

      await connection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature: txHash,
        },
        'confirmed'
      );

      console.log(
        `Mint done successfully. Tx Hash: ${txHash}\nMint address: ${mintKeypair.publicKey.toString()}\n`
      );

      isDone = true;

      const updatedCache = {
        ...cache,
        [cacheName]: {
          ...cache[cacheName],
          txHash,
          mintAddress: mintKeypair.publicKey.toString(),
        },
      };

      await writeJSON(`${cachePath}`, updatedCache, { spaces: 2 });
    } catch (err) {
      console.log(err);
      console.log(`Mint failed. Retrying ...\n`);
      isDone = false;
      continue;
    }
  }

  return mintKeypair.publicKey;
};
