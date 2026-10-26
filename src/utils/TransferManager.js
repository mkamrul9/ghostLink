import WorkerManager from '../worker/WorkerManager.js';
import { CHUNK_SIZE, createChunkGenerator } from '../helpers/FileChunker.js';
import { generateEncryptionKey, importKeyFromRaw } from './CryptoVault.js';
import { unpackEncryptedChunk } from './BinaryPacker.js';
import FileStreamer from './FileStreamer.js';
import FileReceiver from './FileReceiver.js';

export default class TransferManager {
    constructor(rtc, db, options = {}) {
        this.worker = new WorkerManager();
        this.rtc = rtc;
        this.db = db;
        this.options = options;
        this.receivers = new Map();
        this.queued = new Map();
        this.failures = new Map();
        this.senders = new Map();
        this.waiters = new Map();
        rtc.onControl = message => this.control(message);
        rtc.onPacket = packet => this.packet(packet);
        this.queue = Promise.resolve();
    }
    wait(key, signal) {
        let cancel;
        const promise = new Promise((resolve, reject) => {
            const finish = (error) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                this.waiters.delete(key);
                error ? reject(error) : resolve();
            };
            const abort = () => finish(new Error('Transfer cancelled.'));
            const timer = setTimeout(() => finish(new Error('Peer did not acknowledge the transfer. Please reconnect and retry.')), 30000);
            cancel = finish;
            this.waiters.set(key, finish);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
        });
        // A disconnect can reject a packet acknowledgement before its batch is awaited.
        promise.catch(() => {});
        promise.cancel = cancel;
        return promise;
    }
    resolve(key) { this.waiters.get(key)?.(); }
    sendFiles(files) {
        if (this.closed) return Promise.reject(new Error('Reconnect to a peer before sending.'));
        const jobs = files.map(file => {
            let id;
            do { id = crypto.getRandomValues(new Uint32Array(1))[0]; } while (this.queued.has(id) || this.senders.has(id) || this.receivers.has(id));
            const job = { id, file };
            this.queued.set(id, job);
            this.options.onAdd?.({ id, name: file.name, size: file.size, direction: 'send', status: 'queued', progress: 0, startedAt: Date.now() }, file);
            return job;
        });
        this.queue = this.queue.catch(() => {}).then(async () => {
            for (const { id, file } of jobs) {
                if (!this.queued.has(id)) continue;
                this.queued.delete(id);
                if (this.closed) break;
                await this.sendFile(file, id);
            }
        });
        return this.queue;
    }
    async sendFile(file, fileId) {
        const controller = new AbortController();
        const signal = controller.signal;
        this.senders.set(fileId, controller);
        this.options.onProgress?.(fileId, { status: 'sending', startedAt: Date.now() });
        try {
            if (file.size > this.options.maxFileSize) throw new Error('This file exceeds the transfer size limit.');
            const key = await generateEncryptionKey();
            const rawKey = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
            const ready = this.wait(`${fileId}:ready`, signal);
            // Metadata and keys travel only over the encrypted WebRTC data channel.
            this.rtc.sendControl({ type: 'FILE_META', fileId, fileName: file.name, relativePath: file.webkitRelativePath || file.fullPath || file.name, fileSize: file.size, totalChunks: Math.ceil(file.size / CHUNK_SIZE), mimeType: file.type || 'application/octet-stream', rawKey });
            await ready;
            const started = performance.now();
            const manager = this;
            async function* packets() {
                let index = 0;
                let bytes = 0;
                let batch = [];
                for await (const { buffer } of createChunkGenerator(file)) {
                    if (signal.aborted) throw new Error('Transfer cancelled.');
                    const byteLength = buffer.byteLength;
                    const packet = await manager.worker.encrypt(key, buffer, fileId, index);
                    batch.push(manager.wait(`${fileId}:chunk:${index}`, signal));
                    yield packet;
                    index++;
                    bytes += byteLength;
                    if (batch.length === 16) {
                        await Promise.all(batch);
                        batch = [];
                        manager.options.onProgress?.(fileId, { progress: Math.round(bytes / file.size * 100), speed: bytes * 1000 / Math.max(1, performance.now() - started), bytes });
                    }
                }
                await Promise.all(batch);
            }
            await new FileStreamer(this.rtc.dataChannel).stream(packets(), signal);
            const complete = this.wait(`${fileId}:complete`, signal);
            this.rtc.sendControl({ type: 'FILE_END', fileId });
            await complete;
            this.options.onProgress?.(fileId, { status: 'complete', progress: 100, speed: 0, completedAt: Date.now() });
        } catch (error) {
            const failure = this.failures.get(fileId);
            this.options.onProgress?.(fileId, { status: failure ? 'failed' : signal.aborted ? 'cancelled' : 'failed', error: failure?.message || error.message, speed: 0 });
            try { this.rtc.sendControl({ type: 'FILE_CANCEL', fileId }); } catch { /* disconnected */ }
            if (!signal.aborted || this.failures.has(fileId)) this.options.onError?.(this.failures.get(fileId) || error);
        } finally {
            controller.abort();
            this.senders.delete(fileId);
            this.failures.delete(fileId);
        }
    }
    async control(message) {
        const id = message.fileId;
        if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) return;
        if (message.type === 'FILE_READY') return this.resolve(`${id}:ready`);
        if (message.type === 'CHUNK_ACK') return this.resolve(`${id}:chunk:${message.chunkIndex}`);
        if (message.type === 'FILE_COMPLETE') return this.resolve(`${id}:complete`);
        if (message.type === 'FILE_CANCEL') { this.cancel(id, false); return; }
        if (message.type === 'FILE_ERROR') {
            this.failures.set(id, new Error(String(message.message || 'Peer could not receive this file.').slice(0, 200)));
            for (const [key, finish] of this.waiters) if (key.startsWith(`${id}:`)) finish(new Error(String(message.message || 'Peer could not receive this file.').slice(0, 200)));
            this.cancel(id, false);
            return;
        }
        try {
            if (message.type === 'FILE_META') {
                if (this.receivers.size >= 4 || this.receivers.has(id)) throw new Error('Too many incoming files.');
                if (!Number.isSafeInteger(message.fileSize) || message.fileSize < 0 || message.fileSize > this.options.maxFileSize || message.totalChunks !== Math.ceil(message.fileSize / CHUNK_SIZE)) throw new Error('File exceeds the transfer size limit or has invalid metadata.');
                if (!Array.isArray(message.rawKey) || message.rawKey.length !== 32 || message.rawKey.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('Invalid file key.');
                if (typeof message.fileName !== 'string' || !message.fileName.length || message.fileName.length > 255) throw new Error('Invalid file name.');
                const estimate = await navigator.storage?.estimate?.();
                if (estimate?.quota && estimate.quota - estimate.usage < message.fileSize * 1.1) throw new Error('Not enough browser storage. Free space in your vault.');
                if (await this.db.getMetadata(id)) throw new Error('File identifier collision. Please retry.');
                const cryptoKey = await importKeyFromRaw(new Uint8Array(message.rawKey));
                const metadata = { fileId: id, fileName: message.fileName.replace(/[\\/\x00-\x1f]/g, '_'), relativePath: String(message.relativePath || message.fileName).slice(0, 1024), fileSize: message.fileSize, mimeType: String(message.mimeType || 'application/octet-stream').slice(0, 120), totalChunks: message.totalChunks, cryptoKey, complete: false, createdAt: Date.now() };
                await this.db.saveMetadata(metadata);
                this.receivers.set(id, new FileReceiver(metadata, this.db, (progress, bytes, speed) => this.options.onProgress?.(id, { progress, bytes, speed })));
                this.options.onAdd?.({ id, name: metadata.fileName, size: metadata.fileSize, progress: 0, status: 'receiving', direction: 'receive', startedAt: Date.now() });
                this.rtc.sendControl({ type: 'FILE_READY', fileId: id });
            } else if (message.type === 'FILE_END') {
                const receiver = this.receivers.get(id);
                if (!receiver) throw new Error('File receiver is unavailable.');
                await receiver.finish();
                this.receivers.delete(id);
                this.options.onProgress?.(id, { status: 'complete', progress: 100, speed: 0, completedAt: Date.now() });
                this.rtc.sendControl({ type: 'FILE_COMPLETE', fileId: id });
                this.options.onReceived?.(id);
            }
        } catch (error) { await this.failReceive(id, error); }
    }
    async packet(packet) {
        let id;
        try {
            const header = unpackEncryptedChunk(packet);
            id = header.fileId;
            const receiver = this.receivers.get(id);
            if (!receiver) return; // Packets already in flight after cancellation.
            const index = await receiver.receivePacket(packet);
            if (this.receivers.has(id)) this.rtc.sendControl({ type: 'CHUNK_ACK', fileId: id, chunkIndex: index });
        } catch (error) { if (id !== undefined) await this.failReceive(id, error); else this.options.onError?.(error); }
    }
    async failReceive(id, error) {
        this.receivers.delete(id);
        try { this.rtc.sendControl({ type: 'FILE_ERROR', fileId: id, message: error.message }); } catch { /* disconnected */ }
        this.options.onProgress?.(id, { status: 'failed', error: error.message, speed: 0 });
        this.options.onError?.(error);
        this.options.onVaultChange?.();
    }
    cancel(id, notify = true) {
        if (this.queued.delete(id)) this.options.onProgress?.(id, { status: 'cancelled', speed: 0 });
        this.senders.get(id)?.abort();
        if (this.receivers.delete(id)) this.options.onProgress?.(id, { status: 'cancelled', speed: 0 });
        for (const [key, finish] of this.waiters) if (key.startsWith(`${id}:`)) finish(new Error('Transfer cancelled.'));
        if (notify) { try { this.rtc.sendControl({ type: 'FILE_CANCEL', fileId: id }); } catch { /* disconnected */ } }
        this.options.onVaultChange?.();
    }
    close() {
        this.closed = true;
        this.worker.terminate();
        for (const id of [...this.queued.keys()]) {
            this.queued.delete(id);
            this.options.onProgress?.(id, { status: 'interrupted', error: 'The session ended before this file was sent. Reconnect and retry.', speed: 0 });
        }
        for (const id of this.senders.keys()) this.failures.set(id, new Error('The peer disconnected. Reconnect and retry.'));
        for (const id of [...this.senders.keys(), ...this.receivers.keys()]) this.cancel(id, false);
    }
}
