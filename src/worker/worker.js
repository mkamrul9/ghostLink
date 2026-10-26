import { encryptChunk } from '../utils/CryptoVault.js';
import { packEncryptedChunk } from '../utils/BinaryPacker.js';
self.onmessage = async ({ data }) => {
    try {
        const { iv, encryptedBuffer } = await encryptChunk(data.key, data.buffer);
        const packet = packEncryptedChunk(data.fileId, data.chunkIndex, iv, encryptedBuffer);
        self.postMessage({ id: data.id, packet }, [packet]);
    } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
