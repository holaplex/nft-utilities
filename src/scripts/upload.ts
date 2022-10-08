import { config } from 'dotenv';
import { readdir } from 'fs-extra';
import { uploadAssetPair } from '../utils/bundlr';

(async function () {
  try {
    config();

    const imageJSONPairs = (await readdir(`${__dirname}/../../assets`)).filter(
      (fileName) => !fileName.startsWith('collection')
    );

    if (imageJSONPairs.length % 2 !== 0) {
      throw new Error(
        'Incorrect image/json pairs detected. Please make sure that you have 1:1 combination of image/json respectively'
      );
    }

    for (const imageJSONPairIndex of Array.from(
      { length: imageJSONPairs.length / 2 },
      (_, i) => i
    )) {
      console.log(`Uploading pair number: ${imageJSONPairIndex}`);
      const IMAGE_PATH = `${__dirname}/../../assets/${imageJSONPairIndex}.png`;
      const JSON_PATH = `${__dirname}/../../assets/${imageJSONPairIndex}.json`;

      const { imageURL, jsonURL } = await uploadAssetPair(
        IMAGE_PATH,
        JSON_PATH
      );

      console.log(`IMAGE URL: ${imageURL}\nJSON URL: ${jsonURL}\n`);
    }
  } catch (err) {
    console.error(`Upload Error: ${err.message}`);
  }
})();
