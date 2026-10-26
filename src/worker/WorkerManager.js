import { createCryptoProcessor } from './CryptoProcessor.js';
export default class WorkerManager {
    constructor() { this.pending = new Map(); this.sequence = 0; this.fallback = createCryptoProcessor(); }
    request(data, transfer = []) {
        if (typeof Worker === 'undefined') return this.fallback(data);
        if (!this.worker) {
            this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = ({ data: response }) => {
                const request = this.pending.get(response.id); if (!request) return;
                this.pending.delete(response.id); response.error ? request.reject(new Error(response.error)) : request.resolve(response);
            };
            this.worker.onerror = () => this.terminate(new Error('File processing failed. Please retry.'));
        }
        const id = ++this.sequence;
        return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ ...data, id }, transfer); });
    }
    async encrypt(key, buffer, fileId, chunkIndex) { return (await this.request({ type: 'ENCRYPT', key, buffer, fileId, chunkIndex }, [buffer])).packet; }
    async startHash(fileId, file, prefixBytes) { return (await this.request({ type: 'HASH_START', fileId, file, prefixBytes })).prefixHash; }
    async finishHash(fileId) { return (await this.request({ type: 'HASH_END', fileId })).hash; }
    clearHash(fileId) { return this.request({ type: 'HASH_CLEAR', fileId }); }
    terminate(error = new Error('File processing stopped.')) {
        this.worker?.terminate(); this.worker = null;
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear(); this.fallback = createCryptoProcessor();
    }
}
