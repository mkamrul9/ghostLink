import { sha256 } from '../vendor/sha256.js';
import { encryptChunk } from '../utils/CryptoVault.js';
import { packEncryptedChunk } from '../utils/BinaryPacker.js';
import { hex } from '../utils/LocalCrypto.js';
export function createCryptoProcessor() {
    const hashes = new Map();
    return async data => {
        if (data.type === 'HASH_START') {
            const hash = sha256.create();
            for (let offset = 0; offset < data.prefixBytes; offset += 1024 * 1024) hash.update(new Uint8Array(await data.file.slice(offset, Math.min(data.prefixBytes, offset + 1024 * 1024)).arrayBuffer()));
            hashes.set(data.fileId, hash);
            return { prefixHash: hex(hash.clone().digest()) };
        }
        if (data.type === 'HASH_END') {
            const hash = hashes.get(data.fileId) || sha256.create(); hashes.delete(data.fileId); return { hash: hex(hash.digest()) };
        }
        if (data.type === 'HASH_CLEAR') { hashes.delete(data.fileId); return {}; }
        const hash = hashes.get(data.fileId);
        if (hash) hash.update(new Uint8Array(data.buffer));
        const { iv, encryptedBuffer } = await encryptChunk(data.key, data.buffer);
        return { packet: packEncryptedChunk(data.fileId, data.chunkIndex, iv, encryptedBuffer) };
    };
}
