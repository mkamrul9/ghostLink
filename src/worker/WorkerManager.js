export default class WorkerManager {
    constructor() { this.pending = new Map(); this.sequence = 0; }
    encrypt(key, buffer, fileId, chunkIndex) {
        if (!this.worker) {
            this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = ({ data }) => {
                const request = this.pending.get(data.id);
                if (!request) return;
                this.pending.delete(data.id);
                data.error ? request.reject(new Error(data.error)) : request.resolve(data.packet);
            };
            this.worker.onerror = () => this.terminate(new Error('File processing failed. Please retry.'));
        }
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, key, buffer, fileId, chunkIndex }, [buffer]);
        });
    }
    terminate(error = new Error('File processing stopped.')) {
        this.worker?.terminate(); this.worker = null;
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
    }
}
