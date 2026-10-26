import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import DBManager from '../src/DB/DBManager.js';
import HistoryDB from '../src/DB/HistoryDB.js';
import TransferManager from '../src/utils/TransferManager.js';
import { generateEncryptionKey, encryptChunk } from '../src/utils/CryptoVault.js';
import { packEncryptedChunk } from '../src/utils/BinaryPacker.js';
async function fixture(t) {
    const db = new DBManager(); db.dbName = crypto.randomUUID(); await db.init(); t.after(() => db.db.close());
    const messages = [], changes = [], added = [];
    const channel = new EventTarget(); channel.readyState = 'open'; channel.bufferedAmount = 0;
    const rtc = { sendControl: message => messages.push(message), dataChannel: channel };
    const manager = new TransferManager(rtc, db, { maxFileSize: 1024, onAdd: item => added.push(item), onProgress: (id, patch) => changes.push({ id, ...patch }) });
    t.after(() => manager.close());
    const key = await generateEncryptionKey();
    const meta = { type: 'FILE_META', fileId: 17, fileName: '<notes>.txt', fileSize: 3, totalChunks: 1, rawKey: [...new Uint8Array(await crypto.subtle.exportKey('raw', key))] };
    return { db, rtc, manager, messages, changes, added, key, meta };
}
test('ready and completion acknowledgements follow durable encrypted storage', async t => {
    const { db, manager, messages, key, meta } = await fixture(t);
    await manager.control(meta);
    assert.equal(messages.at(-1).type, 'FILE_READY'); assert.equal((await db.getMetadata(17)).complete, false);
    const { iv, encryptedBuffer } = await encryptChunk(key, new Uint8Array([4, 5, 6]));
    await manager.packet(packEncryptedChunk(17, 0, iv, encryptedBuffer));
    assert.equal(messages.at(-1).type, 'CHUNK_ACK'); assert.equal(await db.getSavedChunkCount(17), 1);
    await manager.control({ type: 'FILE_END', fileId: 17 });
    assert.equal(messages.at(-1).type, 'FILE_COMPLETE'); assert.equal((await db.getMetadata(17)).complete, true);
});
test('rejects invalid metadata, oversize transfers and unauthenticated ciphertext', async t => {
    const { db, manager, messages, key, meta } = await fixture(t);
    await manager.control({ ...meta, fileSize: 2048 });
    assert.equal(messages.at(-1).type, 'FILE_ERROR'); assert.equal(await db.getMetadata(17), undefined);
    await manager.control({ ...meta, rawKey: [1, 2] }); assert.equal(messages.at(-1).type, 'FILE_ERROR');
    await manager.control({ ...meta, relativePath: '../outside.txt' }); assert.equal(messages.at(-1).type, 'FILE_ERROR');
    await manager.control(meta);
    const { iv, encryptedBuffer } = await encryptChunk(key, new Uint8Array([1, 2, 3]));
    new Uint8Array(encryptedBuffer)[0] ^= 1;
    await manager.packet(packEncryptedChunk(17, 0, iv, encryptedBuffer));
    assert.equal(messages.at(-1).type, 'FILE_ERROR'); assert.equal(await db.getSavedChunkCount(17), 0);
    await assert.rejects(db.getFileBlob(17), /incomplete/);
});
test('queued files can be cancelled before transmission and survive disconnect as interrupted', async t => {
    const { manager, rtc, added, changes } = await fixture(t);
    rtc.sendControl = message => queueMicrotask(() => {
        if (message.type === 'FILE_META') manager.control({ type: 'FILE_READY', fileId: message.fileId });
        if (message.type === 'FILE_END') manager.control({ type: 'FILE_COMPLETE', fileId: message.fileId, sha256: message.sha256 });
    });
    const result = manager.sendFiles([new File([], 'first.txt'), new File([], 'second.txt')]);
    manager.cancel(added[1].id);
    await result;
    assert.ok(changes.some(item => item.id === added[0].id && item.status === 'complete'));
    assert.ok(changes.some(item => item.id === added[1].id && item.status === 'cancelled'));
    const next = manager.sendFiles([new File([], 'waiting.txt')]);
    manager.close(); await next;
    assert.ok(changes.some(item => item.id === added[2].id && item.status === 'interrupted'));
});
test('local history retains the newest 500 entries and loads recent entries in chronological order', async t => {
    const db = new HistoryDB(); db.dbName = crypto.randomUUID(); await db.init(); t.after(() => db.db.close());
    for (let i = 0; i < 505; i++) await db.saveChat({ id: `message-${i}`, text: 'hello', ts: i });
    const all = await db.loadChat(1000);
    assert.equal(all.length, 500); assert.equal(all[0].ts, 5); assert.equal(all.at(-1).ts, 504);
    const recent = await db.loadChat(2); assert.deepEqual(recent.map(item => item.ts), [503, 504]);
});

test('incoming admission is visible before asynchronous storage work and pending receives can be cancelled', async t => {
 const {manager,meta,db,added,changes,messages}=await fixture(t);let release;
 const original=db.getMetadata.bind(db);db.getMetadata=async id=>{await new Promise(resolve=>{release=resolve;});return original(id);};
 const pending=manager.control(meta);
 for(let i=0;i<20 && !release;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(added.at(-1).status,'receiving');manager.cancel(meta.fileId);release();await pending;
 assert.equal(manager.receivers.size,0);assert.equal(manager.pendingReceives.size,0);assert.equal(changes.at(-1).status,'cancelled');assert.notEqual(messages.at(-1).type,'FILE_READY');
});
