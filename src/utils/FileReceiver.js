import { unpackEncryptedChunk } from './BinaryPacker.js';
import { decryptChunk } from './CryptoVault.js';
import { CHUNK_SIZE } from '../helpers/FileChunker.js';

export default class FileReceiver {
    constructor(metadata, db, onProgress) {
        this.metadata = metadata;
        this.db = db;
        this.onProgress = onProgress;
        this.count = 0;
        this.bytes = 0;
        this.startedAt = performance.now();
    }
    async receivePacket(packetBuffer) {
        const { fileId, chunkIndex, iv, encryptedPayload } = unpackEncryptedChunk(packetBuffer);
        const meta = this.metadata;
        if (fileId !== meta.fileId || chunkIndex !== this.count || chunkIndex >= meta.totalChunks) throw new Error('Unexpected file chunk.');
        const decrypted = await decryptChunk(meta.cryptoKey, iv, encryptedPayload);
        const expected = Math.min(CHUNK_SIZE, meta.fileSize - this.bytes);
        if (decrypted.byteLength !== expected) throw new Error('File chunk size does not match.');
        await this.db.saveChunk(fileId, chunkIndex, packetBuffer);
        this.count++;
        this.bytes += decrypted.byteLength;
        this.onProgress?.(Math.round(this.count / meta.totalChunks * 100), this.bytes, this.bytes * 1000 / Math.max(1, performance.now() - this.startedAt));
        return chunkIndex;
    }
    async finish() {
        if (this.count !== this.metadata.totalChunks || this.bytes !== this.metadata.fileSize) throw new Error('File is incomplete. Please retry.');
        this.metadata = { ...this.metadata, complete: true, completedAt: Date.now() };
        await this.db.saveMetadata(this.metadata);
    }
}
