import { config } from 'dotenv';
import { readdir } from 'fs-extra';
import { mintNFT } from '../utils/metaplex';

(async function () {
  try {
    config();

    if (!process.env.RPC_URL) throw new Error('Custom RPC URL required');

    const jsonFiles = (await readdir(`${__dirname}/../../assets`))
      .filter((fileName) => !fileName.startsWith('collection'))
      .filter((fileName) => fileName.endsWith('json'));

    for (const jsonFile of jsonFiles) {
      await mintNFT(
        `${__dirname}/../../assets/${jsonFile}`,
        jsonFile.replace('.json', ''),
        {}
      );
    }
  } catch (err) {
    console.error(`Upload Error: ${err.message}`);
  }
})();
