import Bundlr from '@bundlr-network/client';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  mkdirp,
  pathExists,
  readFileSync,
  readJSON,
  readJSONSync,
  writeJSON,
} from 'fs-extra';
import { BASE_CONFIG } from '../config';
import { makeUploadSecretKey } from './keypair';

export const uploadAssetPair = async (
  imagePath: string,
  jsonPath: string,
  shouldOverwrite = false
) => {
  const uploadKeypair = makeUploadSecretKey();

  const imageType = 'image/png';
  const jsonType = 'application/json';
  const manifestType = 'application/x.arweave-manifest+json';
  const cachePath = `${__dirname}/../../.cache/data.json`;

  if (!(await pathExists(imagePath))) {
    throw new Error(`Image ${imagePath} file missing`);
  }

  if (!(await pathExists(jsonPath))) {
    throw new Error(`JSON ${imagePath} file missing`);
  }

  await mkdirp(`${__dirname}/../../.cache`);

  const imageBuffer = readFileSync(`${imagePath}`);
  const metadataJSON = readJSONSync(`${jsonPath}`, {
    encoding: 'utf-8',
  });

  const oldCache = (await pathExists(`${cachePath}`))
    ? await readJSON(`${cachePath}`, { encoding: 'utf-8' })
    : {};

  const nameSplits = imagePath.split('/');
  const cacheName = nameSplits[nameSplits.length - 1].replace('.png', '');

  if (!shouldOverwrite && oldCache[cacheName]) {
    return {
      imageURL: oldCache[cacheName].imageURL,
      jsonURL: oldCache[cacheName].jsonURL,
      pathManifestURL: oldCache[cacheName].pathManifestURL,
      editionName: oldCache[cacheName].editionName,
    };
  }

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

  // Image
  const imageTx = bundlr.createTransaction(imageBuffer, {
    tags: [
      { name: 'App-Name', value: BASE_CONFIG.name },
      {
        name: 'Content-Type',
        value: imageType,
      },
    ],
  });

  await imageTx.sign();

  const imageDataItemId = imageTx.id;
  const newImageLink = `https://arweave.net/${imageDataItemId}`;

  const updatedJSON = {
    ...metadataJSON,
    image: newImageLink,
    properties: {
      ...metadataJSON.properties,
      files: [{ type: imageType, uri: newImageLink }],
      creators: metadataJSON.properties.creators || BASE_CONFIG.creators,
    },
  };

  // JSON
  const jsonTx = bundlr.createTransaction(JSON.stringify(updatedJSON), {
    tags: [
      { name: 'App-Name', value: BASE_CONFIG.name },
      { name: 'Content-Type', value: jsonType },
    ],
  });

  await jsonTx.sign();

  const jsonDataItemId = jsonTx.id;

  // Manifest (Both image and JSON info combined)
  const arweavePathManifest = makeJSONManifest(imageDataItemId, jsonDataItemId);

  const pathManifestTx = bundlr.createTransaction(
    JSON.stringify(arweavePathManifest),
    {
      tags: [
        { name: 'App-Name', value: BASE_CONFIG.name },
        { name: 'Content-Type', value: manifestType },
      ],
    }
  );

  await pathManifestTx.sign();

  const pathManifestId = pathManifestTx.id;

  const uploadContentSize =
    imageTx.data.length + jsonTx.data.length + pathManifestTx.data.length;

  console.log('TOTAL CONTENT SIZE', uploadContentSize, 'BYTES');

  const cost = await bundlr.utils.getPrice('solana', uploadContentSize);
  const bufferCost = cost.multipliedBy(3).dividedToIntegerBy(2);
  console.log(
    `${
      bufferCost.toNumber() / LAMPORTS_PER_SOL
    } SOL to upload ${uploadContentSize} bytes with buffer`
  );

  const currentBalance = await bundlr.getLoadedBalance();
  if (currentBalance.lt(bufferCost)) {
    console.log(
      `Current balance ${
        currentBalance.toNumber() / LAMPORTS_PER_SOL
      }. Sending fund txn...`
    );
    await bundlr.fund(bufferCost.minus(currentBalance));
    console.log(`Successfully funded Arweave Bundler, starting upload`);
  } else {
    console.log(
      `Current balance ${
        currentBalance.toNumber() / LAMPORTS_PER_SOL
      } is sufficient.`
    );
  }

  await imageTx.upload();
  await jsonTx.upload();
  await pathManifestTx.upload();

  const arweaveData = {
    imageURL: `https://arweave.net/${imageDataItemId}`,
    jsonURL: `https://arweave.net/${jsonDataItemId}`,
    pathManifestURL: `https://arweave.net/${pathManifestId}`,
    editionName: metadataJSON.name,
  };

  const cacheJSON = { ...oldCache, [cacheName]: arweaveData };
  await writeJSON(`${cachePath}`, cacheJSON, { spaces: 2 });

  return arweaveData;
};

export const makeJSONManifest = (imageDataId: string, jsonDataId: string) => {
  return {
    manifest: 'arweave/paths',
    version: '0.1.0',
    paths: {
      'image.png': {
        id: imageDataId,
      },
      'metadata.json': {
        id: jsonDataId,
      },
    },
    index: {
      path: 'metadata.json',
    },
  };
};
