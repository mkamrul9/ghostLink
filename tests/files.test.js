import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { generateEncryptionKey, encryptChunk, decryptChunk, importKeyFromRaw } from '../src/utils/CryptoVault.js';
import { packEncryptedChunk, unpackEncryptedChunk } from '../src/utils/BinaryPacker.js';
import { createChunkGenerator, CHUNK_SIZE } from '../src/helpers/FileChunker.js';
import FileReceiver from '../src/utils/FileReceiver.js';
import FileStreamer from '../src/utils/FileStreamer.js';
import DBManager from '../src/DB/DBManager.js';
import HistoryDB from '../src/DB/HistoryDB.js';
import { parseEntry, handleDroppedItems } from '../src/helpers/FileSystemHelper.js';
async function vault(t) {
    const db = new DBManager(); db.dbName = `test-${crypto.randomUUID()}`; await db.init(); t.after(() => db.db.close()); return db;
}
async function packet(key, id, index, data) { const { iv, encryptedBuffer } = await encryptChunk(key, data); return packEncryptedChunk(id, index, iv, encryptedBuffer); }
test('encrypted binary packets round trip and reject corruption or invalid headers', async () => {
    const key = await generateEncryptionKey();
    const original = new TextEncoder().encode('private contents');
    const packed = await packet(key, 0xffffffff, 3, original);
    const header = unpackEncryptedChunk(packed);
    assert.equal(header.fileId, 0xffffffff); assert.equal(header.chunkIndex, 3);
    assert.deepEqual(new Uint8Array(await decryptChunk(key, header.iv, header.encryptedPayload)), original);
    new Uint8Array(header.encryptedPayload)[0] ^= 1;
    await assert.rejects(decryptChunk(key, header.iv, header.encryptedPayload));
    assert.throws(() => unpackEncryptedChunk(new ArrayBuffer(20)));
    assert.throws(() => packEncryptedChunk(Date.now(), 0, new Uint8Array(12), new ArrayBuffer(16)));
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const padded = new Uint8Array(40); padded.set(raw, 4);
    const imported = await importKeyFromRaw(padded.subarray(4, 36));
    assert.deepEqual(new Uint8Array(await crypto.subtle.exportKey('raw', imported)), raw);
});
test('receiver validates and persists every chunk; vault survives reopen and deletes all file data', async t => {
    const db = await vault(t), key = await generateEncryptionKey();
    const input = new Uint8Array(CHUNK_SIZE * 2 + 19).map((_, i) => i % 251);
    const metadata = { fileId: 42, fileName: 'example.bin', fileSize: input.byteLength, mimeType: 'application/octet-stream', totalChunks: 3, cryptoKey: key, complete: false };
    await db.saveMetadata(metadata);
    const receiver = new FileReceiver(metadata, db);
    let index = 0;
    for await (const chunk of createChunkGenerator(new Blob([input]))) await receiver.receivePacket(await packet(key, 42, index++, chunk.buffer));
    await receiver.finish();
    assert.equal(await db.getSavedChunkCount(42), 3);
    db.db.close(); const reopened = new DBManager(); reopened.dbName = db.dbName; await reopened.init(); t.after(() => reopened.db.close());
    const result = await reopened.getFileBlob(42);
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), input);
    await reopened.deleteFile(42);
    assert.equal(await reopened.getSavedChunkCount(42), 0);
    assert.equal(await reopened.getMetadata(42), undefined);
});
test('empty files complete, incomplete files cannot download, wrong or duplicate packets reject', async t => {
    const db = await vault(t), key = await generateEncryptionKey();
    const empty = { fileId: 7, fileName: 'empty.txt', fileSize: 0, totalChunks: 0, cryptoKey: key, complete: false };
    await db.saveMetadata(empty); await new FileReceiver(empty, db).finish();
    assert.equal((await db.getFileBlob(7)).blob.size, 0);
    const metadata = { ...empty, fileId: 8, fileSize: 3, totalChunks: 1 };
    await db.saveMetadata(metadata); await assert.rejects(db.getFileBlob(8), /incomplete/);
    const receiver = new FileReceiver(metadata, db);
    await assert.rejects(receiver.finish(), /incomplete/);
    await assert.rejects(receiver.receivePacket(await packet(key, 9, 0, new Uint8Array(3))), /Unexpected/);
    await receiver.receivePacket(await packet(key, 8, 0, new Uint8Array(3)));
    await assert.rejects(receiver.receivePacket(await packet(key, 8, 0, new Uint8Array(3))), /Unexpected/);
});
test('folder enumeration reads every batch and has a standard FileList fallback', async () => {
    let calls = 0;
    const makeEntry = name => ({ isFile: true, file: resolve => resolve(new File(['x'], name)) });
    const folder = { isDirectory: true, name: 'folder', createReader: () => ({ readEntries: resolve => resolve(calls++ === 0 ? Array.from({ length: 100 }, (_, i) => makeEntry(`${i}.txt`)) : calls === 2 ? [makeEntry('last.txt')] : []) }) };
    const files = await parseEntry(folder); assert.equal(files.length, 101); assert.equal(files[100].fullPath, 'folder/last.txt');
    const fallback = new File(['test'], 'fallback.txt'); assert.deepEqual(await handleDroppedItems({ files: [fallback] }), [fallback]);
});
test('stream backpressure resumes once and rejects on disconnect or abort', async () => {
    class Channel extends EventTarget { readyState = 'open'; bufferedAmount = 0; sent = []; send(data) { this.sent.push(data); } }
    const channel = new Channel(); const streamer = new FileStreamer(channel);
    async function* packets() { yield new Uint8Array(4); yield new Uint8Array(7); }
    channel.bufferedAmount = 2000000;
    const result = streamer.stream(packets());
    setTimeout(() => { channel.bufferedAmount = 0; channel.dispatchEvent(new Event('bufferedamountlow')); }, 5);
    await result; assert.equal(channel.sent.length, 2);
    channel.bufferedAmount = 2000000; const failed = streamer.stream(packets());
    setTimeout(() => channel.dispatchEvent(new Event('close')), 5);
    await assert.rejects(failed, /disconnected/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(streamer.stream(packets(), controller.signal), /cancelled/);
});
test('history writes complete before clearing all history stores', async t => {
    const db = new HistoryDB(); db.dbName = `history-${crypto.randomUUID()}`; await db.init(); t.after(() => db.db.close());
    await db.saveChat({ id: 'chat-1', text: 'hello', ts: 1 });
    await db.saveTransfer({ id: 1, startedAt: 1 }); await db.savePeer({ id: 'room1', lastSeen: 1 });
    assert.equal((await db.loadChat()).length, 1); await db.clear();
    assert.deepEqual(await db.loadChat(), []); assert.deepEqual(await db.loadTransfers(), []); assert.deepEqual(await db.loadPeers(), []);
});
