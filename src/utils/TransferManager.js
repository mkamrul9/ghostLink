import { filePath, safePath } from './FileLibrary.js';
import WorkerManager from '../worker/WorkerManager.js';
import { CHUNK_SIZE, createChunkGenerator } from '../helpers/FileChunker.js';
import { generateEncryptionKey, importKeyFromRaw } from './CryptoVault.js';
import { unpackEncryptedChunk } from './BinaryPacker.js';
import FileStreamer from './FileStreamer.js';
import FileReceiver from './FileReceiver.js';
import { fileIdentity } from './FileIdentity.js';
import { digest, utf8, hex } from './LocalCrypto.js';
export default class TransferManager {
    constructor(rtc, db, options = {}) {
        this.worker = new WorkerManager(); this.rtc = rtc; this.db = db; this.options = options;
        this.receivers = new Map(); this.pendingReceives = new Map(); this.queued = new Map(); this.failures = new Map(); this.senders = new Map(); this.wireJobs = new Map(); this.waiters = new Map();
        rtc.onControl = message => this.control(message); rtc.onPacket = packet => this.packet(packet); this.queue = Promise.resolve();
    }
    wait(key, signal, timeout = 30000) {
        const promise = new Promise((resolve, reject) => {
            const finish = (error, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.waiters.delete(key); error ? reject(error) : resolve(value); };
            const abort = () => finish(new Error('Transfer paused. You can resume it.'));
            const timer = setTimeout(() => finish(new Error('The other device stopped responding. Reconnect and resume.')), timeout);
            this.waiters.set(key, finish); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
        });
        promise.catch(() => {}); return promise;
    }
    resolve(key, value) { this.waiters.get(key)?.(null, value); }
    sendFiles(files) {
        if (this.closed) return Promise.reject(new Error('Reconnect to a device before sending.'));
        const jobs = files.map(file => {
            let id; do { id = crypto.getRandomValues(new Uint32Array(1))[0]; } while (this.queued.has(id) || this.senders.has(id) || this.receivers.has(id));
            const job = { id, file }; this.queued.set(id, job);
            this.options.onAdd?.({ id, name: file.name, relativePath: filePath(file), size: file.size, kind: file.mysticDirectory ? 'directory' : 'file', direction: 'send', status: 'queued', progress: 0, startedAt: Date.now() }, file);
            return job;
        });
        this.queue = this.queue.catch(() => {}).then(async () => { for (const { id, file } of jobs) { if (!this.queued.has(id)) continue; this.queued.delete(id); if (this.closed) break; await this.sendFile(file, id); } });
        return this.queue;
    }
    async sendFile(file, jobId) {
        const controller = new AbortController(), signal = controller.signal;
        this.senders.set(jobId, controller);
        this.options.onProgress?.(jobId, { status: 'sending', phase: 'Checking saved transfer...', startedAt: Date.now() });
        let wireId = jobId, cacheId;
        try {
            this.db.requireUnlocked?.();
            if (file.size > (this.options.maxFileSize || Number.MAX_SAFE_INTEGER) || Math.ceil(file.size / CHUNK_SIZE) > 0xffffffff) throw new Error('This file exceeds the configured transfer size limit.');
            const identity = await fileIdentity(file);
            cacheId = await digest(utf8(JSON.stringify([this.rtc.remoteDeviceId || 'peer', filePath(file), identity])));
            let outgoing = await this.db.getOutgoing(cacheId);
            if (!outgoing) {
                outgoing = { id: cacheId, fileId: jobId, identity, token: hex(crypto.getRandomValues(new Uint8Array(32))), cryptoKey: await generateEncryptionKey(), createdAt: Date.now() };
                await this.db.saveOutgoing(outgoing);
            }
            wireId = outgoing.fileId; this.wireJobs.set(wireId, jobId);
            if (signal.aborted) throw new Error('Transfer paused.');
            const rawKey = [...new Uint8Array(await crypto.subtle.exportKey('raw', outgoing.cryptoKey))];
            const ready = this.wait(`${wireId}:ready`, signal, 600000);
            this.rtc.sendControl({ type: 'FILE_META', protocol: 2, fileId: wireId, fileName: file.name, relativePath: filePath(file), fileSize: file.size, totalChunks: Math.ceil(file.size / CHUNK_SIZE), chunkSize: CHUNK_SIZE, kind: file.mysticDirectory ? 'directory' : 'file', mimeType: file.type || 'application/octet-stream', rawKey, resumeToken: outgoing.token, identity });
            const response = await ready;
            const nextChunk = response?.nextChunk || 0;
            if (!Number.isInteger(nextChunk) || nextChunk < 0 || nextChunk > Math.ceil(file.size / CHUNK_SIZE)) throw new Error('The saved transfer position is invalid.');
            const prefixBytes = Math.min(nextChunk * CHUNK_SIZE, file.size);
            const prefixHash = await this.worker.startHash(wireId, file, prefixBytes);
            if (prefixBytes && prefixHash !== response.prefixHash) throw new Error('The saved prefix belongs to a different version. Delete the incomplete received copy and send again.');
            this.options.onProgress?.(jobId, { progress: file.size ? Math.round(prefixBytes / file.size * 100) : 0, bytes: prefixBytes, resumedBytes: prefixBytes, phase: prefixBytes ? 'Resuming saved data' : '' });
            const started = performance.now(); const manager = this;
            async function* packets() {
                let index = nextChunk, bytes = prefixBytes, batch = [];
                for await (const { buffer } of createChunkGenerator(file, { startChunk: nextChunk })) {
                    if (signal.aborted) throw new Error('Transfer paused.');
                    const byteLength = buffer.byteLength, packet = await manager.worker.encrypt(outgoing.cryptoKey, buffer, wireId, index);
                    batch.push(manager.wait(`${wireId}:chunk:${index}`, signal)); yield packet; index++; bytes += byteLength;
                    if (batch.length === 16) {
                        await Promise.all(batch); batch = [];
                        manager.options.onProgress?.(jobId, { progress: Math.round(bytes / file.size * 100), speed: (bytes - prefixBytes) * 1000 / Math.max(1, performance.now() - started), bytes });
                    }
                }
                await Promise.all(batch);
            }
            await new FileStreamer(this.rtc.dataChannel).stream(packets(), signal);
            const hash = await this.worker.finishHash(wireId), complete = this.wait(`${wireId}:complete`, signal);
            this.rtc.sendControl({ type: 'FILE_END', fileId: wireId, sha256: hash });
            const receipt = await complete;
            if (receipt?.sha256 !== hash) throw new Error('The other device reported a different file checksum.');
            this.options.onProgress?.(jobId, { progress: 100, status: 'complete', verified: true, sha256: hash, wireId, resumedBytes: prefixBytes, speed: 0, phase: '', completedAt: Date.now() });
            await this.db.saveOutgoing({ ...outgoing, sha256: hash, completedAt: Date.now() });
        } catch (error) {
            const failure = this.failures.get(jobId);
            this.options.onProgress?.(jobId, { status: failure ? 'failed' : signal.aborted ? 'cancelled' : 'failed', error: failure?.message || error.message, phase: '', speed: 0 });
            try { this.rtc.sendControl({ type: 'FILE_CANCEL', fileId: wireId }); } catch { /* disconnected */ }
            if (!signal.aborted || failure) this.options.onError?.(failure || error);
            if (error.code === 'ID_COLLISION' && cacheId) await this.db.deleteOutgoing(cacheId);
        } finally {
            controller.abort(); this.senders.delete(jobId); this.wireJobs.delete(wireId); this.failures.delete(jobId);
            if (!this.closed) await this.worker.clearHash(wireId).catch(() => {});
        }
    }
    async control(message) {
        const id = message.fileId;
        if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) return;
        if (message.type === 'FILE_READY') return this.resolve(`${id}:ready`, message);
        if (message.type === 'CHUNK_ACK') return this.resolve(`${id}:chunk:${message.chunkIndex}`, message);
        if (message.type === 'FILE_COMPLETE') return this.resolve(`${id}:complete`, message);
        if (message.type === 'FILE_CANCEL') { this.cancel(this.wireJobs.get(id) ?? id, false); return; }
        if (message.type === 'FILE_ERROR') {
            const error = new Error(String(message.message || 'The other device could not receive this file.').slice(0, 200)); error.code = message.code;
            const job = this.wireJobs.get(id);
            if (job !== undefined) this.failures.set(job, error);
            for (const [key, finish] of this.waiters) if (key.startsWith(`${id}:`)) finish(error);
            if (job !== undefined) this.senders.get(job)?.abort();
            return;
        }
        let admission;
        try {
            if (message.type === 'FILE_META') {
                if (this.options.canReceive && !this.options.canReceive()) throw new Error('The other device is working on saved files. Try again shortly.');
                this.db.requireUnlocked?.();
                if (this.receivers.size + this.pendingReceives.size >= 4 || this.receivers.has(id) || this.pendingReceives.has(id)) throw new Error('Wait for the current incoming files to finish.');
                const chunkSize = message.chunkSize || CHUNK_SIZE;
                if (!Number.isSafeInteger(chunkSize) || ![16384, CHUNK_SIZE].includes(chunkSize) || !Number.isSafeInteger(message.fileSize) || message.fileSize < 0 || message.fileSize > (this.options.maxFileSize || Number.MAX_SAFE_INTEGER) || message.totalChunks !== Math.ceil(message.fileSize / chunkSize) || message.totalChunks > 0xffffffff) throw new Error('File exceeds the transfer size limit or has invalid metadata.');
                if (message.kind === 'directory' && message.fileSize !== 0) throw new Error('Invalid empty folder.');
                if (!Array.isArray(message.rawKey) || message.rawKey.length !== 32 || message.rawKey.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('Invalid file key.');
                if (typeof message.fileName !== 'string' || !message.fileName.length || message.fileName.length > 255) throw new Error('Invalid file name.');
                if (message.protocol >= 2 && (!/^[0-9a-f]{64}$/.test(message.resumeToken || '') || !/^[0-9a-f]{64}$/.test(message.identity || ''))) throw new Error('Invalid resume information.');
                const relativePath = safePath(String(message.relativePath || message.fileName).slice(0, 4096));
                admission = {cancelled:false}; this.pendingReceives.set(id, admission);
                this.options.onAdd?.({id, name:message.fileName, relativePath, kind:message.kind, size:message.fileSize, direction:'receive', status:'receiving', progress:0, startedAt:Date.now()});
                const raw = new Uint8Array(message.rawKey), keyId = await digest(raw);
                const existing = await this.db.getMetadata(id);
                let metadata;
                if (existing) {
                    if (!message.resumeToken || existing.resumeToken !== message.resumeToken) { const error = new Error('A file identifier is already in use. Try sending again.'); error.code = 'ID_COLLISION'; throw error; }
                    if (existing.identity !== message.identity || existing.fileSize !== message.fileSize || existing.chunkSize !== chunkSize || existing.keyId !== keyId) throw new Error('Resume information does not match the saved file.');
                    metadata = existing;
                } else {
                    const estimate = await navigator.storage?.estimate?.();
                    if (estimate?.quota && estimate.quota - (estimate.usage || 0) < message.fileSize * 1.08) throw new Error('Not enough storage on this device. Free space or choose fewer files.');
                    metadata = { fileId: id, fileName: message.fileName.replace(/[\\/\x00-\x1f]/g, '_'), relativePath, fileSize: message.fileSize, mimeType: String(message.mimeType || 'application/octet-stream').slice(0, 120), totalChunks: message.totalChunks, chunkSize, cryptoKey: await importKeyFromRaw(raw), keyId, complete: false, nextChunk: 0, protocol: message.protocol || 1, resumeToken: message.resumeToken || null, identity: message.identity || null, kind: message.kind === 'directory' ? 'directory' : 'file', createdAt: Date.now() };
                    await this.db.saveMetadata(metadata);
                }
                if (admission.cancelled) throw new DOMException('Transfer paused.', 'AbortError');
                const receiver = new FileReceiver(metadata, this.db, (progress, bytes, speed) => this.options.onProgress?.(id, { progress, bytes, speed }));
                const prefixHash = await receiver.restore();
                if (admission.cancelled) throw new DOMException('Transfer paused.', 'AbortError');
                this.receivers.set(id, receiver);
                this.options.onAdd?.({ id, name: metadata.fileName, relativePath: metadata.relativePath, kind: metadata.kind, size: metadata.fileSize, progress: metadata.fileSize ? Math.round(receiver.bytes / metadata.fileSize * 100) : 0, status: 'receiving', direction: 'receive', resumedBytes: receiver.bytes, startedAt: Date.now() });
                this.rtc.sendControl({ type: 'FILE_READY', fileId: id, nextChunk: receiver.count, prefixHash });
            } else if (message.type === 'FILE_END') {
                const receiver = this.receivers.get(id); if (!receiver) throw new Error('File receiver is unavailable.');
                const hash = await receiver.finish(message.sha256); this.receivers.delete(id);
                this.options.onProgress?.(id, { status: 'complete', progress: 100, verified: receiver.metadata.verified, sha256: hash, speed: 0, completedAt: Date.now() });
                this.rtc.sendControl({ type: 'FILE_COMPLETE', fileId: id, sha256: hash }); this.options.onReceived?.(id);
            }
        } catch (error) { await this.failReceive(id, error); }
        finally { if (admission) this.pendingReceives.delete(id); }
    }
    async packet(packet) {
        let id;
        try {
            const header = unpackEncryptedChunk(packet); id = header.fileId;
            const receiver = this.receivers.get(id); if (!receiver) return;
            const index = await receiver.receivePacket(packet);
            if (this.receivers.has(id)) this.rtc.sendControl({ type: 'CHUNK_ACK', fileId: id, chunkIndex: index });
        } catch (error) { if (id !== undefined) await this.failReceive(id, error); else this.options.onError?.(error); }
    }
    async failReceive(id, error) {
        this.receivers.delete(id);
        try { this.rtc.sendControl({ type: 'FILE_ERROR', fileId: id, code: error.code, message: error.message }); } catch { /* disconnected */ }
        this.options.onProgress?.(id, { status: error.name === 'AbortError' ? 'cancelled' : 'failed', error: error.message, speed: 0 }); if(error.name !== 'AbortError')this.options.onError?.(error); this.options.onVaultChange?.();
    }
    cancel(id, notify = true) {
        if (this.queued.delete(id)) this.options.onProgress?.(id, { status: 'cancelled', speed: 0 });
        const pending = this.pendingReceives.get(id); if(pending) { pending.cancelled = true; this.options.onProgress?.(id, {status:'cancelled',speed:0}); }
        this.senders.get(id)?.abort();
        let wire = id; for (const [wireId, jobId] of this.wireJobs) if (jobId === id) wire = wireId;
        if (this.receivers.delete(wire)) this.options.onProgress?.(wire, { status: 'cancelled', speed: 0 });
        for (const [key, finish] of this.waiters) if (key.startsWith(`${wire}:`)) finish(new Error('Transfer paused. You can resume it.'));
        if (notify) { try { this.rtc.sendControl({ type: 'FILE_CANCEL', fileId: wire }); } catch { /* disconnected */ } }
        this.options.onVaultChange?.();
    }
    close() {
        this.closed = true; this.worker.terminate();
        for (const id of this.queued.keys()) this.options.onProgress?.(id, { status: 'interrupted', error: 'Reconnect and resume this file.', speed: 0 });
        this.queued.clear();
        for (const id of this.senders.keys()) this.failures.set(id, new Error('The other device disconnected. Reconnect to resume.'));
        for (const id of [...this.senders.keys(), ...this.receivers.keys(), ...this.pendingReceives.keys()]) this.cancel(id, false);
    }
}
