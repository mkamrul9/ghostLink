import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import LocalFolderLibrary from '../src/utils/LocalFolderLibrary.js';
import DBManager from '../src/DB/DBManager.js';
import TransferManager from '../src/utils/TransferManager.js';
import { generateEncryptionKey, encryptChunk } from '../src/utils/CryptoVault.js';
import { packEncryptedChunk } from '../src/utils/BinaryPacker.js';
import { createHash } from 'node:crypto';
import { CHUNK_SIZE } from '../src/helpers/FileChunker.js';
const missing=()=>new DOMException('Not found','NotFoundError');
class MemoryDirectory {
 constructor(name='chosen'){this.name=name;this.kind='directory';this.entries=new Map();}
 async getDirectoryHandle(name,{create=false}={}){if(!this.entries.has(name)&&create)this.entries.set(name,new MemoryDirectory(name));const entry=this.entries.get(name);if(!entry)throw missing();if(entry.kind!=='directory')throw new Error('Not a directory');return entry;}
 async getFileHandle(name,{create=false}={}){if(!this.entries.has(name)&&create){const entry={name,kind:'file',data:new Blob(),getFile:async()=>entry.data,createWritable:async({mode}={})=>{if(mode==='exclusive'&&entry.locked)throw new DOMException('Locked','NoModificationAllowedError');entry.locked=true;let next;return {write:async data=>{next=new Blob([data]);},close:async()=>{entry.data=next;entry.locked=false;},abort:async()=>{entry.locked=false;}};}};this.entries.set(name,entry);}const entry=this.entries.get(name);if(!entry)throw missing();if(entry.kind!=='file')throw new Error('Not a file');return entry;}
 async *values(){yield* this.entries.values();}
 async removeEntry(name){if(!this.entries.delete(name))throw missing();}
}
async function db(t){const value=new DBManager();value.dbName=crypto.randomUUID();await value.init();t.after(()=>value.close());return value;}
async function receive(t,store,bytes){
 const sent=[],channel=Object.assign(new EventTarget(),{readyState:'open',bufferedAmount:0}),manager=new TransferManager({dataChannel:channel,sendControl:message=>sent.push(message)},store);t.after(()=>manager.close());
 const key=await generateEncryptionKey(),id=35,metadata={type:'FILE_META',protocol:2,fileId:id,fileName:'private.bin',relativePath:'Project/private.bin',fileSize:bytes.length,totalChunks:Math.ceil(bytes.length/CHUNK_SIZE),chunkSize:CHUNK_SIZE,resumeToken:'a'.repeat(64),identity:'b'.repeat(64),rawKey:[...new Uint8Array(await crypto.subtle.exportKey('raw',key))]};
 await manager.control(metadata);assert.equal(sent.at(-1).type,'FILE_READY');
 for(let offset=0;offset<bytes.length;offset+=CHUNK_SIZE){const {iv,encryptedBuffer}=await encryptChunk(key,bytes.slice(offset,offset+CHUNK_SIZE));await manager.packet(packEncryptedChunk(id,offset/CHUNK_SIZE,iv,encryptedBuffer));assert.equal(sent.at(-1).type,'CHUNK_ACK');}
 await manager.control({type:'FILE_END',fileId:id,sha256:createHash('sha256').update(bytes).digest('hex')});assert.equal(sent.at(-1).type,'FILE_COMPLETE');return {metadata,manager};
}
test('local folder stores encrypted packets and keys outside IndexedDB and recovers after browser database loss',async t=>{
 const directory=await LocalFolderLibrary.locate(new MemoryDirectory()),library=await LocalFolderLibrary.create(directory,'private library phrase'),store=await db(t);await store.attachLibrary(library,false);
 const bytes=Uint8Array.from({length:CHUNK_SIZE*2+7},(_,index)=>index%251);await receive(t,store,bytes);
 const chunks=await store.transaction(['chunks'],'readonly',tx=>tx.objectStore('chunks').getAll());assert.equal(chunks.length,0);
 const raw=await (await (await directory.getDirectoryHandle('metadata')).getFileHandle('35.json')).getFile();assert.ok(!(await raw.text()).includes('private.bin'));assert.ok(!(await raw.text()).includes('rawKey'));
 store.close();const recovered=await db(t),reopened=await LocalFolderLibrary.open(directory);assert.equal(reopened.deviceId,library.deviceId);await assert.rejects(reopened.unlock('wrong phrase'),/did not unlock/);await reopened.unlock('private library phrase');await recovered.attachLibrary(reopened,false);
 assert.deepEqual(new Uint8Array(await (await recovered.getFileBlob(35)).blob.arrayBuffer()),bytes);assert.equal((await recovered.getMetadata(35)).verified,true);
 await recovered.protect('replacement phrase');recovered.lock();await assert.rejects(recovered.unlock('private library phrase'));await recovered.unlock('replacement phrase');assert.equal((await recovered.getMetadata(35)).complete,true);
});
test('local folder acknowledgements wait for metadata; interrupted writes retain the committed resume position',async t=>{
 const directory=await LocalFolderLibrary.locate(new MemoryDirectory()),library=await LocalFolderLibrary.create(directory,'private folder phrase'),store=await db(t);await store.attachLibrary(library,false);
 const key=await generateEncryptionKey(),metadata={fileId:19,fileName:'a.bin',relativePath:'a.bin',fileSize:1,totalChunks:1,chunkSize:CHUNK_SIZE,nextChunk:0,complete:false,cryptoKey:key};await store.saveMetadata(metadata);
 const original=library.saveRecord.bind(library);library.saveRecord=async()=>{throw new Error('Disk full');};await assert.rejects(store.saveReceivedChunk({...metadata,nextChunk:1},0,new Uint8Array([1]).buffer),/Disk full/);library.saveRecord=original;
 assert.equal((await store.getMetadata(19)).nextChunk,0);assert.equal(await store.getSavedChunkCount(19),1);
 await store.deleteFile(19);assert.equal(await store.getMetadata(19),undefined);assert.equal(await store.getSavedChunkCount(19),0);
});
test('local library refuses nonempty folders, invalid record paths and malformed headers',async()=>{
 const root=new MemoryDirectory();await root.getFileHandle('existing.txt',{create:true});await assert.rejects(LocalFolderLibrary.create(root,'private folder phrase'),/empty/);
 const directory=new MemoryDirectory(),library=await LocalFolderLibrary.create(directory,'private folder phrase');await assert.rejects(library.saveRecord('metadata',{fileId:'../outside'}),/identifier/);await assert.rejects(library.getRecord('outgoing','../outside'),/identifier/);
 library.lock();await assert.rejects(library.getAllMetadata(),/Unlock/);
 const header=await directory.getFileHandle('mystic-library.json'),writer=await header.createWritable();await writer.write('{}');await writer.close();await assert.rejects(LocalFolderLibrary.open(directory),/supported/);
});


test('an active local library refuses a second writer and releases its lock when locked',async()=>{
 const root=new MemoryDirectory(),first=await LocalFolderLibrary.create(root,'a private passphrase'),second=await LocalFolderLibrary.open(root);
 await assert.rejects(second.unlock('a private passphrase'),/already open/);first.lock();await second.unlock('a private passphrase');assert.equal(second.locked,false);second.lock();
});
