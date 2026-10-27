const timeFields = { chat: 'ts', transfers: 'startedAt', peers: 'lastSeen' };
const retention = 500;
export default class HistoryDB {
    constructor() { this.dbName = 'GhostLinkHistory'; this.db = null; }
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);
            request.onupgradeneeded = () => {
                for (const [name, field] of Object.entries(timeFields)) {
                    const store = request.result.objectStoreNames.contains(name) ? request.transaction.objectStore(name) : request.result.createObjectStore(name, { keyPath: 'id' });
                    if (!store.indexNames.contains('byTime')) store.createIndex('byTime', field);
                }
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.db.onversionchange = () => this.db.close();
                resolve(this.db);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close older app tabs to update local history.'));
        });
    }
    clear() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(Object.keys(timeFields), 'readwrite');
            for (const name of Object.keys(timeFields)) tx.objectStore(name).clear();
            tx.oncomplete = resolve;
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }
    clearRoomChat(roomId) {
        return new Promise((resolve,reject)=>{
            if(!this.db)return reject(new Error('History is unavailable.'));
            const tx=this.db.transaction('chat','readwrite'), cursor=tx.objectStore('chat').openCursor();
            cursor.onsuccess=()=>{const item=cursor.result;if(item){if(item.value.roomId===roomId)item.delete();item.continue();}};
            tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
        });
    }
    saveChat(value) { return this._put('chat', value); }
    saveTransfer(value) { return this._put('transfers', value); }
    savePeer(value) { return this._put('peers', value); }
    async loadChat(limit = 100) { return (await this._getAll('chat', limit)).reverse(); }
    async loadTransfers(limit = 100) { return (await this._getAll('transfers', limit)).reverse(); }
    loadPeers() { return this._getAll('peers', 20); }
    _put(name, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('History is unavailable.'));
            const tx = this.db.transaction([name], 'readwrite');
            const store = tx.objectStore(name);
            store.put(value);
            const count = store.count();
            count.onsuccess = () => {
                let extra = count.result - retention;
                if (extra <= 0) return;
                const cursor = store.index('byTime').openCursor();
                cursor.onsuccess = () => {
                    const item = cursor.result;
                    if (item && extra-- > 0) { item.delete(); item.continue(); }
                };
            };
            tx.oncomplete = resolve;
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }
    _getAll(name, limit) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('History is unavailable.'));
            const result = [];
            const tx = this.db.transaction([name], 'readonly');
            const cursor = tx.objectStore(name).index('byTime').openCursor(null, 'prev');
            cursor.onsuccess = () => {
                if (!cursor.result || result.length >= limit) return;
                result.push(cursor.result.value);
                cursor.result.continue();
            };
            tx.oncomplete = () => resolve(result);
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }
}
