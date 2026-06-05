export default class HistoryDB {
    constructor() {
        this.dbName = 'GhostLinkHistory';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('chat')) {
                    db.createObjectStore('chat', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('transfers')) {
                    db.createObjectStore('transfers', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('peers')) {
                    db.createObjectStore('peers', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveChat(message) {
        return this._put('chat', message);
    }

    async saveTransfer(transfer) {
        return this._put('transfers', transfer);
    }

    async savePeer(peer) {
        return this._put('peers', peer);
    }

    async loadChat(limit = 100) {
        const items = await this._getAll('chat');
        const sorted = items.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        return sorted.slice(-limit);
    }

    async loadTransfers(limit = 100) {
        const items = await this._getAll('transfers');
        const sorted = items.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
        return sorted.slice(-limit);
    }

    async loadPeers() {
        const items = await this._getAll('peers');
        return items.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    }

    _put(storeName, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('HistoryDB is not initialized'));
                return;
            }
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(value);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    _getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('HistoryDB is not initialized'));
                return;
            }
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = (event) => resolve(event.target.result || []);
            request.onerror = (event) => reject(event.target.error);
        });
    }
}
