import { createCryptoProcessor } from './CryptoProcessor.js';
const process = createCryptoProcessor();
self.onmessage = async ({ data }) => {
    try { const result = await process(data); self.postMessage({ id: data.id, ...result }, result.packet ? [result.packet] : []); }
    catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
