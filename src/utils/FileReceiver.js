import { unpackEncryptedChunk } from './BinaryPacker.js';
import { decryptChunk } from './CryptoVault.js';
import { CHUNK_SIZE } from '../helpers/FileChunker.js';
import { sha256 } from '../vendor/sha256.js';
import { hex } from './LocalCrypto.js';
export default class FileReceiver {
    constructor(metadata, db, onProgress) {
        this.metadata = metadata; this.db = db; this.onProgress = onProgress;
        this.count = metadata.nextChunk || 0; this.chunkSize = metadata.chunkSize || CHUNK_SIZE;
        this.bytes = Math.min(this.count * this.chunkSize, metadata.fileSize); this.startedAt = performance.now(); this.hash = sha256.create();
    }
    async restore() {
        for (let first = 0; first < this.count; first += 64) {
            const records = await this.db.getChunks(this.metadata.fileId, first, Math.min(64, this.count - first));
            for (let offset = 0; offset < records.length; offset++) {
                if (!records[offset]) throw new Error('Saved transfer data is missing. Delete the incomplete copy and send again.');
                const packet = unpackEncryptedChunk(records[offset].data);
                if (packet.fileId !== this.metadata.fileId || packet.chunkIndex !== first + offset) throw new Error('Saved transfer data is invalid.');
                this.hash.update(new Uint8Array(await decryptChunk(this.metadata.cryptoKey, packet.iv, packet.encryptedPayload)));
            }
        }
        return hex(this.hash.clone().digest());
    }
    async receivePacket(packetBuffer) {
        const { fileId, chunkIndex, iv, encryptedPayload } = unpackEncryptedChunk(packetBuffer), meta = this.metadata;
        if (fileId !== meta.fileId || chunkIndex !== this.count || chunkIndex >= meta.totalChunks) throw new Error('Unexpected file chunk.');
        const decrypted = await decryptChunk(meta.cryptoKey, iv, encryptedPayload);
        if (decrypted.byteLength !== Math.min(this.chunkSize, meta.fileSize - this.bytes)) throw new Error('File chunk size does not match.');
        const next = { ...this.metadata, nextChunk: this.count + 1 };
        await this.db.saveReceivedChunk(next, chunkIndex, packetBuffer);
        this.metadata = next; this.hash.update(new Uint8Array(decrypted)); this.count++; this.bytes += decrypted.byteLength;
        this.onProgress?.(Math.round(this.count / meta.totalChunks * 100), this.bytes, this.bytes * 1000 / Math.max(1, performance.now() - this.startedAt));
        return chunkIndex;
    }
    async finish(expectedHash) {
        if (this.count !== this.metadata.totalChunks || this.bytes !== this.metadata.fileSize) throw new Error('File is incomplete. Please resume it.');
        const actualHash = hex(this.hash.clone().digest());
        if (this.metadata.protocol >= 2 && (!/^[0-9a-f]{64}$/.test(expectedHash || '') || actualHash !== expectedHash)) throw new Error('File verification failed. The received bytes do not match the sender.');
        this.metadata = { ...this.metadata, sha256: actualHash, verified: this.metadata.protocol >= 2, complete: true, completedAt: Date.now() };
        await this.db.saveMetadata(this.metadata);
        return actualHash;
    }
}
