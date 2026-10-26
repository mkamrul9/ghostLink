import LocalFolderLibrary from '../utils/LocalFolderLibrary.js';
import { unpackEncryptedChunk } from '../utils/BinaryPacker.js';
import { decryptChunk } from '../utils/CryptoVault.js';
import { sha256 } from '../vendor/sha256.js';
import { hex, utf8, passwordKey, sealBytes, openBytes, serializeMetadata, deserializeMetadata } from '../utils/LocalCrypto.js';
const MEMORY_DOWNLOAD_LIMIT = 256 * 1024 * 1024;
export default class DBManager {
    constructor() { this.dbName = 'GhostLinkVault'; this.db = null; this.browserProtection = null; this.library = null; this.unlockKey = null; }
    get protection() { return this.library ? this.library.protection : this.browserProtection; }
    set protection(value) { this.browserProtection=value; }
    get locked() { return this.library ? this.library.locked : Boolean(this.browserProtection && !this.unlockKey); }
    get storageKind() { return this.library ? 'folder' : 'browser'; }
    async attachLibrary(library,remember=true) {
        this.library?.lock();this.unlockKey=null;this.library=library;
        if(remember) { try { await this.transaction(['config'],'readwrite',tx=>tx.objectStore('config').put({id:'local-folder',handle:library.directory,name:library.directory.name})); }catch { /* Some browsers cannot remember folder permissions. Reopen manually. */ } }
        if(!library.locked)await this.cleanupImports();
    }
    async rememberedLibrary() { return this.transaction(['config'],'readonly',tx=>tx.objectStore('config').get('local-folder')); }
    async reconnectLibrary() {
        const saved=await this.rememberedLibrary();if(!saved)throw new Error('Choose your local library folder again.');
        const permission=await saved.handle.requestPermission({mode:'readwrite'});if(permission!=='granted')throw new Error('Allow folder access to open your local library.');
        this.library=await LocalFolderLibrary.open(saved.handle);
    }
    async useBrowserStorage() { this.library?.lock();this.library=null;this.unlockKey=null;await this.transaction(['config'],'readwrite',tx=>tx.objectStore('config').delete('local-folder')); }
    async checkCapacity(bytes) {
        this.requireUnlocked();if(this.library)return;
        const estimate=await navigator.storage?.estimate?.();
        if(estimate?.quota && estimate.quota-(estimate.usage||0)<bytes*1.08)throw new Error('Not enough browser storage. Choose a local folder in Settings on desktop Chrome or Edge, or free browser space.');
    }
    init() {
        if (this.opening) return this.opening;
        this.opening = this.acquireTabLock().then(() => new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 3);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'fileId' });
                const chunks = db.objectStoreNames.contains('chunks') ? request.transaction.objectStore('chunks') : db.createObjectStore('chunks', { keyPath: 'id' });
                if (!chunks.indexNames.contains('fileId')) chunks.createIndex('fileId', 'fileId');
                if (!db.objectStoreNames.contains('outgoing')) db.createObjectStore('outgoing', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
            };
            request.onsuccess = async () => {
                this.db = request.result; this.db.onversionchange = () => this.close();
                try { this.protection = await this.transaction(['config'], 'readonly', tx => tx.objectStore('config').get('protection')) || null; if (!this.locked) await this.cleanupImports(); resolve(this.db); }
                catch (error) { reject(error); }
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close older Mystic tabs to update local storage.'));
        }));
        return this.opening;
    }
    async acquireTabLock() {
        if (typeof window === 'undefined' || !navigator.locks) return;
        await new Promise((resolve, reject) => {
            navigator.locks.request(`mystic-vault:${this.dbName}`, { ifAvailable: true }, async lock => {
                if (!lock) { reject(new Error('Mystic files are already open in another tab. Close that tab and refresh.')); return; }
                await new Promise(release => { this.releaseTabLock = release; resolve(); });
            }).catch(reject);
        });
    }
    close() { this.library?.lock();this.unlockKey=null;this.db?.close(); this.releaseTabLock?.(); }
    transaction(stores, mode, action) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('Local file storage is unavailable.'));
            const tx = this.db.transaction(stores, mode);
            let result;
            try { result = action(tx); } catch (error) { tx.abort(); reject(error); return; }
            tx.oncomplete = () => resolve(Array.isArray(result) ? result.map(request => request.result) : result?.result);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local storage was interrupted.'));
        });
    }
    requireUnlocked() { if (this.locked) throw new Error('Unlock your received files first.'); }
    async encode(metadata, store, keyName, key = this.unlockKey) {
        if (!this.protection && !key) return metadata;
        if (!key) throw new Error('Unlock your received files first.');
        const sealed = await sealBytes(key, utf8(JSON.stringify(await serializeMetadata(metadata))), `${store}:${metadata[keyName]}`);
        return { [keyName]: metadata[keyName], sealed };
    }
    async decode(record, store, keyName) {
        this.requireUnlocked();
        if (!record?.sealed) return record;
        if (!this.unlockKey) throw new Error('Unlock your received files first.');
        return deserializeMetadata(JSON.parse(new TextDecoder().decode(await openBytes(this.unlockKey, record.sealed, `${store}:${record[keyName]}`))));
    }
    async saveMetadata(metadata) { if(this.library)return this.library.saveRecord('metadata',metadata); this.requireUnlocked(); const record = await this.encode(metadata, 'metadata', 'fileId'); return this.transaction(['metadata'], 'readwrite', tx => tx.objectStore('metadata').put(record)); }
    async getMetadata(id) { if(this.library)return this.library.getRecord('metadata',id); this.requireUnlocked(); return this.decode(await this.transaction(['metadata'], 'readonly', tx => tx.objectStore('metadata').get(id)), 'metadata', 'fileId'); }
    async getAllMetadata(includeImports = false) { if(this.library)return this.library.getAllMetadata(includeImports); this.requireUnlocked(); const records = await this.transaction(['metadata'], 'readonly', tx => tx.objectStore('metadata').getAll()); const decoded = await Promise.all(records.map(record => this.decode(record, 'metadata', 'fileId'))); return includeImports ? decoded : decoded.filter(record => !record.importing); }
    async getOutgoing(id) { if(this.library)return this.library.getRecord('outgoing',id); this.requireUnlocked(); return this.decode(await this.transaction(['outgoing'], 'readonly', tx => tx.objectStore('outgoing').get(id)), 'outgoing', 'id'); }
    deleteOutgoing(id) { if(this.library)return this.library.deleteRecord('outgoing',id); return this.transaction(['outgoing'], 'readwrite', tx => tx.objectStore('outgoing').delete(id)); }
    async saveOutgoing(metadata) { if(this.library)return this.library.saveRecord('outgoing',metadata); this.requireUnlocked(); const record = await this.encode(metadata, 'outgoing', 'id'); return this.transaction(['outgoing'], 'readwrite', tx => tx.objectStore('outgoing').put(record)); }
    saveChunk(fileId, chunkIndex, packet) { if(this.library)return this.library.saveChunk(fileId,chunkIndex,packet); this.requireUnlocked(); return this.transaction(['chunks'], 'readwrite', tx => tx.objectStore('chunks').put({ id: `${fileId}_${chunkIndex}`, fileId, chunkIndex, data: packet })); }
    async saveReceivedChunk(metadata, index, packet) {
        if(this.library)return this.library.saveReceivedChunk(metadata,index,packet);
        this.requireUnlocked();
        const record = await this.encode(metadata, 'metadata', 'fileId');
        return this.transaction(['metadata', 'chunks'], 'readwrite', tx => {
            tx.objectStore('chunks').put({ id: `${metadata.fileId}_${index}`, fileId: metadata.fileId, chunkIndex: index, data: packet });
            tx.objectStore('metadata').put(record);
        });
    }
    getChunk(fileId, index) { if(this.library)return this.library.getChunk(fileId,index); this.requireUnlocked(); return this.transaction(['chunks'], 'readonly', tx => tx.objectStore('chunks').get(`${fileId}_${index}`)); }
    getChunks(fileId, first, count) { if(this.library)return this.library.getChunks(fileId,first,count); this.requireUnlocked(); return this.transaction(['chunks'], 'readonly', tx => Array.from({ length: count }, (_, offset) => tx.objectStore('chunks').get(`${fileId}_${first + offset}`))); }
    getSavedChunkCount(id) { if(this.library)return this.library.getSavedChunkCount(id); this.requireUnlocked(); return this.transaction(['chunks'], 'readonly', tx => tx.objectStore('chunks').index('fileId').count(id)); }
    deleteFile(fileId) {
        if(this.library)return this.library.deleteFile(fileId);
        this.requireUnlocked();
        return this.transaction(['metadata', 'chunks'], 'readwrite', tx => {
            tx.objectStore('metadata').delete(fileId);
            const cursor = tx.objectStore('chunks').index('fileId').openCursor(IDBKeyRange.only(fileId));
            cursor.onsuccess = () => { const entry = cursor.result; if (entry) { entry.delete(); entry.continue(); } };
        });
    }
    async *fileChunks(fileId) {
        const metadata = await this.getMetadata(fileId);
        if (!metadata?.complete) throw new Error('This file is incomplete. Ask the sender to resume it.');
        let size = 0; const hash = metadata.verified ? sha256.create() : null;
        for (let first = 0; first < metadata.totalChunks; first += 64) {
            const records = await this.getChunks(fileId, first, Math.min(64, metadata.totalChunks - first));
            for (let offset = 0; offset < records.length; offset++) {
                if (!records[offset]) throw new Error('A saved chunk is missing. Ask the sender to resume it.');
                const packet = unpackEncryptedChunk(records[offset].data);
                if (packet.fileId !== fileId || packet.chunkIndex !== first + offset) throw new Error('Saved file data is invalid.');
                const buffer = await decryptChunk(metadata.cryptoKey, packet.iv, packet.encryptedPayload);
                size += buffer.byteLength; const bytes = new Uint8Array(buffer); hash?.update(bytes); yield bytes;
            }
        }
        if (size !== metadata.fileSize) throw new Error('Saved file size does not match.');
        if (hash && hex(hash.digest()) !== metadata.sha256) throw new Error('Saved file verification failed. Restore a backup or ask the sender to resend it.');
    }
    async getFileBlob(fileId, maxBytes = MEMORY_DOWNLOAD_LIMIT) {
        const metadata = await this.getMetadata(fileId);
        if (!metadata?.complete) throw new Error('This file is incomplete. Ask the sender to resume it.');
        if (metadata.fileSize > maxBytes) throw new Error('Use Save to device in a browser with direct file saving for this large file.');
        const chunks = [];
        for await (const chunk of this.fileChunks(fileId)) chunks.push(chunk);
        return { blob: new Blob(chunks, { type: metadata.mimeType }), name: metadata.fileName };
    }
    async protect(password) {
        if(this.library)return this.library.protect(password);
        this.requireUnlocked();
        if (password.length < 12) throw new Error('Use a passphrase with at least 12 characters.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await passwordKey(password, salt);
        const metadata = await this.getAllMetadata();
        const rawOutgoing = await this.transaction(['outgoing'], 'readonly', tx => tx.objectStore('outgoing').getAll());
        const outgoing = await Promise.all(rawOutgoing.map(record => this.decode(record, 'outgoing', 'id')));
        const protectedMetadata = await Promise.all(metadata.map(record => this.encode(record, 'metadata', 'fileId', key)));
        const protectedOutgoing = await Promise.all(outgoing.map(record => this.encode(record, 'outgoing', 'id', key)));
        const protection = { id: 'protection', version: 1, salt: [...salt], iterations: 600000, check: await sealBytes(key, utf8('Mystic local vault v1'), 'mystic-vault-check-v1') };
        await this.transaction(['metadata', 'outgoing', 'config'], 'readwrite', tx => {
            for (const record of protectedMetadata) tx.objectStore('metadata').put(record);
            for (const record of protectedOutgoing) tx.objectStore('outgoing').put(record);
            tx.objectStore('config').put(protection);
        });
        this.protection = protection; this.unlockKey = key;
    }
    async unlock(password) {
        if(this.library){await this.library.unlock(password);await this.cleanupImports();return;}
        if (!this.protection) return;
        const key = await passwordKey(password, new Uint8Array(this.protection.salt), this.protection.iterations);
        try { if (new TextDecoder().decode(await openBytes(key, this.protection.check, 'mystic-vault-check-v1')) !== 'Mystic local vault v1') throw new Error(); }
        catch { throw new Error('That passphrase did not unlock your files.'); }
        this.unlockKey = key; await this.cleanupImports();
    }
    async cleanupImports() { for (const metadata of await this.getAllMetadata(true)) if (metadata.importing) await this.deleteFile(metadata.fileId); }
    lock() { if(this.library){this.library.lock();return;} if (this.protection) this.unlockKey = null; }
}
