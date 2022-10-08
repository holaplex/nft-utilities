import { config } from 'dotenv';
import { uploadAssetPair } from '../utils/bundlr';
import { mintNFT } from '../utils/metaplex';

(async function () {
  config();

  try {
    console.log(`Uploading collection image/json pair`);
    const IMAGE_PATH = `${__dirname}/../../assets/collection.png`;
    const JSON_PATH = `${__dirname}/../../assets/collection.json`;
    await uploadAssetPair(IMAGE_PATH, JSON_PATH);

    await mintNFT(JSON_PATH, 'collection', { isCollection: true });
  } catch (err) {
    console.error(err);
  }
})();
