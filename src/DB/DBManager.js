// DBManager.js

export default class DBManager {
    constructor() {
        this.dbName = 'GhostLinkVault';
        this.version = 1;
        this.db = null;
    }

    /**
     * Initializes the database and creates Object Stores if they don't exist.
     * Wrapped in a Promise for clean async/await usage.
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store 1: Metadata (File info and the AES-GCM CryptoKey)
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'fileId' });
                }

                // Store 2: The actual encrypted chunks
                if (!db.objectStoreNames.contains('chunks')) {
                    // We use a compound key: fileId + chunkIndex
                    db.createObjectStore('chunks', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('[DB] GhostLinkVault Initialized');
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('[DB] Initialization failed', event);
                reject(event.target.error);
            };
        });
    }

    /**
     * Saves the file metadata and the CryptoKey.
     */
    async saveMetadata(fileId, fileName, totalChunks, cryptoKey) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readwrite');
            const store = transaction.objectStore('metadata');

            const data = { fileId, fileName, totalChunks, cryptoKey };
            const request = store.put(data);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Gets all saved file metadata from the vault.
     */
    async getAllMetadata() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const request = store.getAll();

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Saves a single encrypted ArrayBuffer chunk to the database.
     */
    async saveChunk(fileId, chunkIndex, encryptedBuffer) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chunks'], 'readwrite');
            const store = transaction.objectStore('chunks');

            // We generate a unique ID for this specific chunk
            const chunkId = `${fileId}_${chunkIndex}`;

            const request = store.put({
                id: chunkId,
                fileId: fileId,
                chunkIndex: chunkIndex,
                data: encryptedBuffer // Storing raw binary directly!
            });

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Checks how many chunks of a specific file we already have saved.
     * Crucial for resuming broken transfers.
     */
    async getSavedChunkCount(fileId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chunks'], 'readonly');
            const store = transaction.objectStore('chunks');
            const request = store.getAll(); // In a real app, use an index to query by fileId

            request.onsuccess = (event) => {
                const allChunks = event.target.result;
                const fileChunks = allChunks.filter(c => c.fileId === fileId);
                resolve(fileChunks.length);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }
}