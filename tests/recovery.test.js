import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import 'fake-indexeddb/auto';
import { unzipSync } from 'fflate';
import DBManager from '../src/DB/DBManager.js';
import TransferManager from '../src/utils/TransferManager.js';
import { CHUNK_SIZE } from '../src/helpers/FileChunker.js';
import { backupStream, restoreBackup } from '../src/utils/LocalBackup.js';
import { createZipStream, createZip } from '../src/utils/ZipDownload.js';
import { directoryFile, namedFile, filePath, fileTree, nestedFiles } from '../src/utils/FileLibrary.js';
import { unpackEncryptedChunk, packEncryptedChunk } from '../src/utils/BinaryPacker.js';
import { saveStream } from '../src/utils/SaveToDevice.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function database(t, name = crypto.randomUUID()) { const db = new DBManager(); db.dbName = name; await db.init(); t.after(() => db.close()); return db; }
function paired(t, a, b, options = {}) {
    const errors = [], changes = [], metas = [], packets = [];
    const left = { remoteDeviceId: 'receiver' }, right = { remoteDeviceId: 'sender' };
    let queue = Promise.resolve();
    left.sendControl = message => { metas.push(message); queue = queue.then(() => right.onControl(message)); };
    right.sendControl = message => { queueMicrotask(() => left.onControl(message)); };
    left.dataChannel = Object.assign(new EventTarget(), { readyState: 'open', bufferedAmount: 0, send(packet) { packets.push(packet); queue = queue.then(async () => { await right.onPacket(packet); await options.afterPacket?.(packets.length); }); } });
    right.dataChannel = Object.assign(new EventTarget(), { readyState: 'open', bufferedAmount: 0 });
    const sender = new TransferManager(left, a, { onProgress: (id, patch) => changes.push({ id, ...patch }), onError: error => errors.push(error) });
    const receiver = new TransferManager(right, b, { onError: error => errors.push(error) });
    t.after(() => { sender.close(); receiver.close(); });
    return { sender, receiver, errors, changes, metas, packets, drain: () => queue };
}

test('resume survives closing storage and transfers only the missing suffix, with full SHA-256 verification', async t => {
    const a = await database(t), b = await database(t);
    const bytes = Uint8Array.from({ length: CHUNK_SIZE * 40 + 37 }, (_, i) => (i * 7) % 251), file = namedFile(new File([bytes], 'work.bin'), 'Project/work.bin');
    let pair = paired(t, a, b, { afterPacket: async count => { if (count === 16) pair.sender.cancel(pair.changes[0].id); } });
    await pair.sender.sendFiles([file]); await pair.drain();
    const saved = (await b.getAllMetadata())[0]; assert.equal(saved.nextChunk, 16); assert.equal(saved.complete, false);
    pair.sender.close(); pair.receiver.close(); a.close(); b.close();
    const aa = await database(t, a.dbName), bb = await database(t, b.dbName);
    pair = paired(t, aa, bb); await pair.sender.sendFiles([file]); await pair.drain();
    assert.equal(pair.packets.length, 25); assert.equal(pair.metas[0].fileId, saved.fileId);
    assert.equal(pair.changes.at(-1).status, 'complete'); assert.equal(pair.changes.at(-1).resumedBytes, CHUNK_SIZE * 16);
    assert.equal(pair.changes.at(-1).sha256, hash(bytes)); assert.equal((await bb.getMetadata(saved.fileId)).verified, true);
    assert.equal(hash(new Uint8Array(await (await bb.getFileBlob(saved.fileId)).blob.arrayBuffer())), hash(bytes));
    const duplicate = paired(t, aa, bb); await duplicate.sender.sendFiles([file]); await duplicate.drain();
    assert.equal(duplicate.packets.length, 0); assert.equal(duplicate.changes.at(-1).status, 'complete');
});

test('changed content hidden from sample lookup cannot reuse an incompatible saved prefix', async t => {
    const a = await database(t), b = await database(t), bytes = new Uint8Array(CHUNK_SIZE * 40).fill(3);
    let pair = paired(t, a, b, { afterPacket: async count => { if (count === 16) pair.sender.cancel(pair.changes[0].id); } });
    await pair.sender.sendFiles([new File([bytes], 'x.bin')]); await pair.drain(); pair.sender.close(); pair.receiver.close();
    bytes[CHUNK_SIZE * 4] = 6;
    pair = paired(t, a, b); await pair.sender.sendFiles([new File([bytes], 'x.bin')]); await pair.drain();
    assert.equal(pair.packets.length, 0); assert.match(pair.changes.at(-1).error, /different version/);
    assert.equal((await b.getAllMetadata())[0].nextChunk, 16);
});

test('wrong final checksum never marks an incoming file complete', async t => {
    const a = await database(t), b = await database(t), pair = paired(t, a, b);
    const original = pair.sender.rtc.sendControl;
    pair.sender.rtc.sendControl = message => original(message.type === 'FILE_END' ? { ...message, sha256: '0'.repeat(64) } : message);
    await pair.sender.sendFiles([new File(['wrong digest'], 'file.txt')]); await pair.drain();
    assert.equal((await b.getAllMetadata())[0].complete, false); assert.equal(pair.changes.at(-1).status, 'failed');
});

test('passphrase protection seals file names and encryption keys, survives reload and rejects wrong passphrases', async t => {
    const a = await database(t), b = await database(t), pair = paired(t, a, b);
    await pair.sender.sendFiles([new File(['private content'], 'secret-name.txt')]); await pair.drain();
    await b.protect('correct horse battery'); await a.protect('another private passphrase');
    const records = await b.transaction(['metadata'], 'readonly', tx => tx.objectStore('metadata').getAll());
    assert.deepEqual(Object.keys(records[0]).sort(), ['fileId','sealed']); assert.ok(!JSON.stringify(records).includes('secret-name'));
    const outgoing = await a.transaction(['outgoing'], 'readonly', tx => tx.objectStore('outgoing').getAll()); assert.deepEqual(Object.keys(outgoing[0]).sort(), ['id','sealed']);
    b.close(); const reopened = await database(t, b.dbName); assert.equal(reopened.locked, true);
    await assert.rejects(reopened.getAllMetadata(), /Unlock/); await assert.rejects(reopened.unlock('wrong password'), /did not unlock/);
    await reopened.unlock('correct horse battery'); const meta = (await reopened.getAllMetadata())[0];
    assert.equal(await (await reopened.getFileBlob(meta.fileId)).blob.text(), 'private content');
    await reopened.protect('replacement passphrase'); reopened.lock(); await assert.rejects(reopened.unlock('correct horse battery')); await reopened.unlock('replacement passphrase');
});

test('encrypted portable backup restores complete files and empty folders; wrong, truncated and modified backups roll back', async t => {
    const a = await database(t), b = await database(t), pair = paired(t, a, b);
    await pair.sender.sendFiles([namedFile(new File(['hello'], 'notes.txt'), 'Work/notes.txt'), directoryFile('Work/empty')]); await pair.drain();
    const metadata = await b.getAllMetadata(), pieces = [];
    for await (const chunk of backupStream(b, metadata.map(item => item.fileId), 'backup passphrase')) pieces.push(chunk);
    const blob = new Blob(pieces), target = await database(t); await target.protect('vault passphrase');
    assert.equal(await restoreBackup(target, blob, 'backup passphrase'), 2);
    const restored = await target.getAllMetadata(); assert.ok(restored.every(item => item.complete)); assert.ok(restored.some(item => item.kind === 'directory'));
    assert.equal(await (await target.getFileBlob(restored.find(item => item.kind !== 'directory').fileId)).blob.text(), 'hello');
    assert.ok(!Buffer.from(await blob.arrayBuffer()).includes(Buffer.from('notes.txt')));
    await assert.rejects(restoreBackup(target, blob, 'incorrect phrase'), /Wrong backup passphrase/);
    await assert.rejects(restoreBackup(target, blob.slice(0, -8), 'backup passphrase'), /incomplete/);
    const damaged = new Uint8Array(await blob.arrayBuffer()); damaged[damaged.length - 50] ^= 1;
    await assert.rejects(restoreBackup(target, new Blob([damaged]), 'backup passphrase'));
    assert.equal((await target.getAllMetadata(true)).length, 2);
});

test('streaming ZIP includes empty directories, supports ZIP64 counts and declares large files without allocating them', async () => {
    const files = [directoryFile('Root/empty'), namedFile(new File(['hi'], 'x.txt'), 'Root/x.txt')];
    assert.equal(nestedFiles(fileTree(files.map(file => ({ path:filePath(file), directory:Boolean(file.mysticDirectory) })))).length, 2);
    const zip = await createZip(files.map(file => ({ path:filePath(file), size:file.size, directory:Boolean(file.mysticDirectory), getBlob:async () => file })));
    const unpacked = unzipSync(new Uint8Array(await zip.arrayBuffer())); assert.deepEqual(Object.keys(unpacked), ['Root/empty/','Root/x.txt']);
    const stream = createZipStream([{ path:'huge.bin', size: 5 * 1024 ** 3, getChunks: async function* () { throw new Error('should not read'); } }]);
    const first = (await stream.next()).value; assert.equal(new DataView(first.buffer).getUint32(18, true), 0xffffffff); await stream.return();
    let count64 = false;
    for await (const chunk of createZipStream(Array.from({ length:65536 }, (_, i) => ({ path:`empty-${i}`, size:0, directory:true })))) {
        if (new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true) === 0x06064b50) { assert.equal(new DataView(chunk.buffer).getBigUint64(24,true), 65536n); count64 = true; }
    }
    assert.equal(count64, true);
});

test('direct saving writes a 300 MiB stream incrementally and aborts a damaged stream', async t => {
    const oldWindow = globalThis.window; t.after(() => { globalThis.window = oldWindow; });
    let size = 0, closed = false, aborted = false;
    globalThis.window = { showSaveFilePicker: async () => ({ createWritable: async () => ({ write: async chunk => { assert.ok(chunk.byteLength <= 1024 ** 2); size += chunk.byteLength; }, close: async () => {closed=true;}, abort: async () => {aborted=true;} }) }) };
    await saveStream({ name:'large.bin', size:300 * 1024 ** 2, source:async function* () { const chunk = new Uint8Array(1024 ** 2); for(let i=0;i<300;i++) yield chunk; } });
    assert.equal(size, 300 * 1024 ** 2); assert.equal(closed,true);
    await assert.rejects(saveStream({ name:'bad.bin', size:1, source:async function* () { yield new Uint8Array([1]); throw new Error('damaged'); } }), /damaged/); assert.equal(aborted,true);
});


test('download rechecks full-file integrity and rejects reordered authenticated chunks in local storage', async t => {
 const a=await database(t),b=await database(t),pair=paired(t,a,b),data=new Uint8Array(CHUNK_SIZE*2);data.fill(19,0,CHUNK_SIZE);data.fill(71,CHUNK_SIZE);
 await pair.sender.sendFiles([new File([data],'saved.bin')]);await pair.drain();const meta=(await b.getAllMetadata())[0];
 const first=unpackEncryptedChunk((await b.getChunk(meta.fileId,0)).data),second=unpackEncryptedChunk((await b.getChunk(meta.fileId,1)).data);
 await b.saveChunk(meta.fileId,0,packEncryptedChunk(meta.fileId,0,second.iv,second.encryptedPayload));await b.saveChunk(meta.fileId,1,packEncryptedChunk(meta.fileId,1,first.iv,first.encryptedPayload));
 await assert.rejects(b.getFileBlob(meta.fileId),/verification failed/);
});
