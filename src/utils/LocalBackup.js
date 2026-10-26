import { passwordKey, sealBytes, openBytes, serializeMetadata, deserializeMetadata, utf8, hex, digest } from './LocalCrypto.js';
import { unpackEncryptedChunk, packEncryptedChunk } from './BinaryPacker.js';
import { decryptChunk } from './CryptoVault.js';
import { safePath } from './FileLibrary.js';
import { sha256 } from '../vendor/sha256.js';
const MAGIC = utf8('MYSTICBACKUP2\n');
function uint32(value) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; }
function tagged(type, data) { const result = new Uint8Array(data.byteLength + 1); result[0] = type; result.set(new Uint8Array(data), 1); return result; }
export async function* backupStream(db, ids, password) {
    db.requireUnlocked();
    if (password.length < 12) throw new Error('Use a backup passphrase with at least 12 characters.');
    if (!ids.length) throw new Error('There are no received files to back up.');
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await passwordKey(password, salt);
    const header = utf8(JSON.stringify({ version: 2, salt: [...salt], iterations: 600000 })), headerHash = await digest(header), hash = sha256.create();
    yield MAGIC; yield uint32(header.length); yield header;
    let sequence = 0, chunks = 0, files = 0;
    const frame = async payload => {
        const encrypted = await sealBytes(key, payload, `mystic-backup:${headerHash}:${sequence++}`);
        const length = encrypted.cipher.byteLength + 12;
        const result = new Uint8Array(length + 4); result.set(uint32(length)); result.set(encrypted.iv, 4); result.set(new Uint8Array(encrypted.cipher), 16); return result;
    };
    for (const id of ids) {
        const metadata = await db.getMetadata(id); if (!metadata) throw new Error('A selected file is no longer saved.');
        const count = metadata.complete ? metadata.totalChunks : metadata.nextChunk || 0;
        const plain = tagged(1, utf8(JSON.stringify({ ...await serializeMetadata(metadata), backupChunks: count })));
        hash.update(plain); yield await frame(plain); files++;
        for (let first = 0; first < count; first += 64) {
            const records = await db.getChunks(id, first, Math.min(64, count - first));
            for (const record of records) {
                if (!record) throw new Error('Saved data is missing. This backup was not completed.');
                const payload = tagged(2, record.data); hash.update(payload); yield await frame(payload); chunks++;
            }
        }
    }
    yield await frame(tagged(3, utf8(JSON.stringify({ files, chunks, sha256: hex(hash.digest()) }))));
}
async function byteReader(blob) {
    const reader = blob.stream().getReader(); let pending = new Uint8Array(0), done = false;
    return {
        async read(size, allowEnd = false) {
            const result = new Uint8Array(size); let position = 0;
            while (position < size) {
                if (!pending.length) { const next = await reader.read(); done = next.done; pending = next.value || new Uint8Array(0); if (done) { if (allowEnd && !position) return null; throw new Error('The backup is incomplete or damaged.'); } }
                const length = Math.min(pending.length, size - position); result.set(pending.subarray(0, length), position); pending = pending.subarray(length); position += length;
            }
            return result;
        }, close() { return reader.cancel().catch(() => {}); }
    };
}
export async function restoreBackup(db, file, password) {
    db.requireUnlocked(); const reader = await byteReader(file), imported = [], hash = sha256.create();
    let sequence = 0, chunks = 0, files = 0, current = null;
    const finishCurrent = async () => {
        if (!current) return;
        if (current.count !== current.expected) throw new Error('A file is missing backup chunks.');
        if (current.originalComplete) {
            if (current.bytes !== current.metadata.fileSize) throw new Error('A restored file has an invalid size.');
            const actual = hex(current.hash.digest());
            if (current.metadata.verified && actual !== current.metadata.sha256) throw new Error('A restored file failed verification.');
            current.metadata.sha256 = actual;
        }
    };
    try {
        if (new TextDecoder().decode(await reader.read(MAGIC.length)) !== new TextDecoder().decode(MAGIC)) throw new Error('This is not a Mystic backup.');
        const headerLength = new DataView((await reader.read(4)).buffer).getUint32(0, true);
        if (headerLength < 20 || headerLength > 4096) throw new Error('Invalid backup header.');
        const headerBytes = await reader.read(headerLength), header = JSON.parse(new TextDecoder().decode(headerBytes));
        if (header.version !== 2 || header.iterations !== 600000 || !Array.isArray(header.salt) || header.salt.length !== 16) throw new Error('Unsupported backup format.');
        const key = await passwordKey(password, new Uint8Array(header.salt), header.iterations), headerHash = await digest(headerBytes);
        while (true) {
            const length = new DataView((await reader.read(4)).buffer).getUint32(0, true);
            if (length < 29 || length > 131072) throw new Error('Invalid backup frame.');
            const record = await reader.read(length); let payload;
            try { payload = new Uint8Array(await openBytes(key, { iv: [...record.subarray(0, 12)], cipher: record.slice(12).buffer }, `mystic-backup:${headerHash}:${sequence++}`)); }
            catch { throw new Error(sequence === 1 ? 'Wrong backup passphrase, or the backup is damaged.' : 'Backup verification failed. No imported files were kept.'); }
            if (payload[0] === 1) {
                await finishCurrent();
                const raw = JSON.parse(new TextDecoder().decode(payload.subarray(1)));
                if (!Number.isInteger(raw.fileId) || !Number.isSafeInteger(raw.fileSize) || raw.fileSize < 0 || !Number.isInteger(raw.totalChunks) || raw.totalChunks < 0 || raw.totalChunks > 0xffffffff || !Number.isInteger(raw.backupChunks) || raw.backupChunks < 0 || raw.backupChunks > raw.totalChunks || !Array.isArray(raw.rawKey) || raw.rawKey.length !== 32 || raw.rawKey.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error('Invalid backup file metadata.');
                const chunkSize = raw.chunkSize || 16384;
                if (![16384, 61440].includes(chunkSize) || raw.totalChunks !== Math.ceil(raw.fileSize / chunkSize) || raw.complete && raw.backupChunks !== raw.totalChunks || raw.kind === 'directory' && raw.fileSize !== 0) throw new Error('Invalid backup file layout.');
                raw.relativePath = safePath(raw.relativePath || raw.fileName);
                let id; do { id = crypto.getRandomValues(new Uint32Array(1))[0]; } while (await db.getMetadata(id));
                const metadata = await deserializeMetadata({ ...raw, fileId: id, fileName: raw.relativePath.split('/').at(-1), complete: false, importing: true, nextChunk: 0, resumeToken: null });
                delete metadata.backupChunks;
                await db.saveMetadata(metadata); imported.push({ id, complete: Boolean(raw.complete), count: raw.backupChunks });
                current = { metadata, originalId: raw.fileId, originalComplete: Boolean(raw.complete), expected: raw.backupChunks, count: 0, bytes: 0, hash: sha256.create() }; files++;
            } else if (payload[0] === 2) {
                if (!current || current.count >= current.expected) throw new Error('Unexpected backup data.');
                const packet = unpackEncryptedChunk(payload.slice(1).buffer);
                if (packet.fileId !== current.originalId || packet.chunkIndex !== current.count) throw new Error('Backup chunks are out of order.');
                const decoded = await decryptChunk(current.metadata.cryptoKey, packet.iv, packet.encryptedPayload);
                if (decoded.byteLength !== Math.min(current.metadata.chunkSize || 16384, current.metadata.fileSize - current.bytes)) throw new Error('Invalid backup chunk size.');
                current.hash.update(new Uint8Array(decoded)); current.bytes += decoded.byteLength; current.count++; chunks++;
                await db.saveChunk(current.metadata.fileId, packet.chunkIndex, packEncryptedChunk(current.metadata.fileId, packet.chunkIndex, packet.iv, packet.encryptedPayload));
            } else if (payload[0] === 3) {
                await finishCurrent();
                const end = JSON.parse(new TextDecoder().decode(payload.subarray(1)));
                if (end.files !== files || end.chunks !== chunks || end.sha256 !== hex(hash.digest()) || await reader.read(1, true)) throw new Error('The backup is incomplete or has extra data.');
                for (const entry of imported) { const metadata = await db.getMetadata(entry.id); await db.saveMetadata({ ...metadata, importing: false, complete: entry.complete, nextChunk: entry.count }); }
                return imported.length;
            } else throw new Error('Unknown backup record.');
            hash.update(payload);
        }
    } catch (error) { await Promise.all(imported.map(entry => db.deleteFile(entry.id))); throw error; }
    finally { await reader.close(); }
}
