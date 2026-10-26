import { unpackEncryptedChunk } from '../utils/BinaryPacker.js';
import { decryptChunk } from '../utils/CryptoVault.js';

export default class DBManager {
    constructor() {
        // Retain the original database name so existing browser data survives the rebrand.
        this.dbName = 'GhostLinkVault';
        this.db = null;
    }
    init() {
        if (this.opening) return this.opening;
        this.opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'fileId' });
                const chunks = db.objectStoreNames.contains('chunks') ? request.transaction.objectStore('chunks') : db.createObjectStore('chunks', { keyPath: 'id' });
                if (!chunks.indexNames.contains('fileId')) chunks.createIndex('fileId', 'fileId');
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.db.onversionchange = () => this.db.close();
                resolve(this.db);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close older app tabs to update local storage.'));
        });
        return this.opening;
    }
    transaction(stores, mode, action) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('Local file storage is unavailable.'));
            const tx = this.db.transaction(stores, mode);
            let result;
            try { result = action(tx); } catch (error) { tx.abort(); reject(error); return; }
            tx.oncomplete = () => resolve(result?.result);
            tx.onerror = () => reject(tx.error || new Error('Local storage failed.'));
            tx.onabort = () => reject(tx.error || new Error('Local storage was interrupted.'));
        });
    }
    saveMetadata(metadata) { return this.transaction(['metadata'], 'readwrite', tx => tx.objectStore('metadata').put(metadata)); }
    getMetadata(fileId) { return this.transaction(['metadata'], 'readonly', tx => tx.objectStore('metadata').get(fileId)); }
    getAllMetadata() { return this.transaction(['metadata'], 'readonly', tx => tx.objectStore('metadata').getAll()); }
    saveChunk(fileId, chunkIndex, packet) {
        return this.transaction(['chunks'], 'readwrite', tx => tx.objectStore('chunks').put({ id: `${fileId}_${chunkIndex}`, fileId, chunkIndex, data: packet }));
    }
    getChunk(fileId, index) { return this.transaction(['chunks'], 'readonly', tx => tx.objectStore('chunks').get(`${fileId}_${index}`)); }
    getSavedChunkCount(fileId) { return this.transaction(['chunks'], 'readonly', tx => tx.objectStore('chunks').index('fileId').count(fileId)); }
    deleteFile(fileId) {
        return this.transaction(['metadata', 'chunks'], 'readwrite', tx => {
            tx.objectStore('metadata').delete(fileId);
            const cursor = tx.objectStore('chunks').index('fileId').openCursor(IDBKeyRange.only(fileId));
            cursor.onsuccess = () => { const entry = cursor.result; if (entry) { entry.delete(); entry.continue(); } };
        });
    }
    async getFileBlob(fileId) {
        const metadata = await this.getMetadata(fileId);
        if (!metadata?.complete) throw new Error('This file is incomplete. Ask the sender to retry.');
        const chunks = [];
        let size = 0;
        for (let index = 0; index < metadata.totalChunks; index++) {
            const record = await this.getChunk(fileId, index);
            if (!record) throw new Error('A saved chunk is missing. Ask the sender to retry.');
            const packet = unpackEncryptedChunk(record.data);
            const buffer = await decryptChunk(metadata.cryptoKey, packet.iv, packet.encryptedPayload);
            chunks.push(buffer);
            size += buffer.byteLength;
        }
        if (size !== metadata.fileSize) throw new Error('Saved file size does not match.');
        return { blob: new Blob(chunks, { type: metadata.mimeType }), name: metadata.fileName };
    }
}
