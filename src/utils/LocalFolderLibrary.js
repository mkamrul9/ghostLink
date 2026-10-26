import { passwordKey, sealBytes, openBytes, serializeMetadata, deserializeMetadata, utf8 } from './LocalCrypto.js';
import { generateEncryptionKey } from './CryptoVault.js';
const HEADER = 'mystic-library.json';
const CONTEXT = 'mystic-folder-master-v1';
function packed(record) { return { iv: record.iv, cipher: [...new Uint8Array(record.cipher)] }; }
function unpacked(record) {
    if (!Array.isArray(record?.iv) || record.iv.length !== 12 || !Array.isArray(record.cipher) || record.cipher.length > 262144 || [...record.iv,...record.cipher].some(byte=>!Number.isInteger(byte)||byte<0||byte>255)) throw new Error('The local library record is damaged.');
    return {iv:record.iv,cipher:new Uint8Array(record.cipher).buffer};
}
async function readJson(directory, name) {
    const file = await (await directory.getFileHandle(name)).getFile();
    if (file.size > 1024 * 1024) throw new Error('The local library record is too large.');
    return JSON.parse(await file.text());
}
async function writeFile(directory, name, contents) {
    const file = await directory.getFileHandle(name, {create:true}), writer = await file.createWritable();
    try { await writer.write(contents); await writer.close(); }
    catch (error) { await writer.abort().catch(()=>{}); throw error; }
}
function fileId(id) { if(!Number.isInteger(id)||id<0||id>0xffffffff)throw new Error('Invalid local file identifier.');return String(id); }
function recordName(store,id) { if(store==='metadata')return fileId(id)+'.json';if(!/^[0-9a-f]{64}$/.test(id))throw new Error('Invalid outgoing record identifier.');return id+'.json'; }
export default class LocalFolderLibrary {
    constructor(directory, header) { this.directory=directory; this.protection=header; this.deviceId=header?.deviceId; this.key=null; }
    get locked() { return !this.key; }
    requireUnlocked() { if(this.locked)throw new Error('Unlock your local folder first.'); }
    static async locate(chosen) {
        try { await chosen.getFileHandle(HEADER); return chosen; } catch(error) { if(error.name!=='NotFoundError')throw error; }
        return chosen.getDirectoryHandle('Mystic Library',{create:true});
    }
    static async open(directory) {
        const header=await readJson(directory,HEADER);
        if(!/^[0-9a-f-]{36}$/i.test(header.deviceId||'')||header.format!=='mystic-local-library'||header.version!==1||header.iterations!==600000||!Array.isArray(header.salt)||header.salt.length!==16||header.salt.some(byte=>!Number.isInteger(byte)||byte<0||byte>255))throw new Error('This is not a supported Mystic local library.');
        unpacked(header.master);
        return new LocalFolderLibrary(directory,header);
    }
    static async create(directory,password,{deviceId=crypto.randomUUID()}={}) {
        const library=new LocalFolderLibrary(directory,null);library.deviceId=deviceId;
        try {
            await library.acquireWriter();
            for await(const entry of directory.values())if(entry.name!=='mystic-library.lock'&&!/^mystic-library\.lock(?:\.\d+)?\.crswap$/.test(entry.name))throw new Error('Choose an empty Mystic Library folder, or open an existing library.');
            library.key=await generateEncryptionKey();await library.protect(password);return library;
        }catch(error){library.lock();throw error;}
    }
    async acquireWriter() {
        await this.releasing;
        if(this.writer)return;
        try { this.writer=await (await this.directory.getFileHandle('mystic-library.lock',{create:true})).createWritable({mode:'exclusive'}); }
        catch(error){if(error.name==='NoModificationAllowedError')throw new Error('This local library is already open in another tab or application. Close it there first.');throw error;}
    }
    async unlock(password) {
        const wrapping=await passwordKey(password,new Uint8Array(this.protection.salt),this.protection.iterations);
        let raw;
        try { raw=await openBytes(wrapping,unpacked(this.protection.master),`${CONTEXT}:${this.deviceId}`);if(raw.byteLength!==32)throw new Error(); }
        catch { throw new Error('That passphrase did not unlock your local folder.'); }
        await this.acquireWriter();
        this.key=await crypto.subtle.importKey('raw',raw,'AES-GCM',true,['encrypt','decrypt']);
    }
    lock() { this.key=null;const writer=this.writer;this.writer=null;this.releasing=writer?.abort().catch(()=>{}); }
    async protect(password) {
        this.requireUnlocked();if(password.length<12)throw new Error('Use a passphrase with at least 12 characters.');
        const salt=crypto.getRandomValues(new Uint8Array(16)), wrapping=await passwordKey(password,salt);
        const header={format:'mystic-local-library',version:1,deviceId:this.deviceId,iterations:600000,salt:[...salt],master:packed(await sealBytes(wrapping,await crypto.subtle.exportKey('raw',this.key),`${CONTEXT}:${this.deviceId}`))};
        await writeFile(this.directory,HEADER,JSON.stringify(header));this.protection=header;
    }
    async records(store,create=false) { return this.directory.getDirectoryHandle(store,{create}); }
    async getRecord(store,id) {
        this.requireUnlocked();const name=recordName(store,id);let record;
        try { record=await readJson(await this.records(store),name); }
        catch(error) { if(error.name==='NotFoundError')return undefined;throw error; }
        const value=JSON.parse(new TextDecoder().decode(await openBytes(this.key,unpacked(record),`${store}:${id}`)));
        if((store==='metadata'?value.fileId:value.id)!==id)throw new Error('Local file metadata is invalid.');
        return deserializeMetadata(value);
    }
    async saveRecord(store,value) {
        this.requireUnlocked();const id=store==='metadata'?value.fileId:value.id, name=recordName(store,id);
        const sealed=await sealBytes(this.key,utf8(JSON.stringify(await serializeMetadata(value))),`${store}:${id}`);
        await writeFile(await this.records(store,true),name,JSON.stringify(packed(sealed)));
    }
    async deleteRecord(store,id) { this.requireUnlocked();try { await (await this.records(store)).removeEntry(recordName(store,id)); }catch(error){if(error.name!=='NotFoundError')throw error;} }
    async getAllMetadata(includeImports=false) {
        this.requireUnlocked();let directory;try{directory=await this.records('metadata');}catch(error){if(error.name==='NotFoundError')return [];throw error;}
        const result=[];for await(const entry of directory.values())if(entry.kind==='file'&&/^\d+\.json$/.test(entry.name)){const value=await this.getRecord('metadata',Number(entry.name.slice(0,-5)));if(includeImports||!value.importing)result.push(value);}return result;
    }
    async chunkDirectory(id,create=false) { const root=await this.directory.getDirectoryHandle('chunks',{create});return root.getDirectoryHandle(fileId(id),{create}); }
    async saveChunk(id,index,packet) { this.requireUnlocked();if(!Number.isInteger(index)||index<0||index>0xffffffff)throw new Error('Invalid chunk position.');await writeFile(await this.chunkDirectory(id,true),`${index}.bin`,packet); }
    async saveReceivedChunk(metadata,index,packet) {
        // Acknowledge only after both file closes. An orphan chunk after a crash is
        // ignored until metadata commits, then overwritten safely during resume.
        await this.saveChunk(metadata.fileId,index,packet);await this.saveRecord('metadata',metadata);
    }
    async getChunk(id,index) {
        this.requireUnlocked();if(!Number.isInteger(index)||index<0||index>0xffffffff)throw new Error('Invalid chunk position.');
        try { const file=await (await (await this.chunkDirectory(id)).getFileHandle(`${index}.bin`)).getFile();if(file.size>65536)throw new Error('Invalid saved chunk size.');return {fileId:id,chunkIndex:index,data:await file.arrayBuffer()}; }
        catch(error){if(error.name==='NotFoundError')return undefined;throw error;}
    }
    async getChunks(id,first,count) { return Promise.all(Array.from({length:count},(_,offset)=>this.getChunk(id,first+offset))); }
    async getSavedChunkCount(id) { this.requireUnlocked();let folder;try{folder=await this.chunkDirectory(id);}catch(error){if(error.name==='NotFoundError')return 0;throw error;}let count=0;for await(const entry of folder.values())if(entry.kind==='file'&&/^\d+\.bin$/.test(entry.name))count++;return count; }
    async deleteFile(id) {
        this.requireUnlocked();await this.deleteRecord('metadata',id);
        try { await (await this.directory.getDirectoryHandle('chunks')).removeEntry(fileId(id),{recursive:true}); }catch(error){if(error.name!=='NotFoundError')throw error;}
    }
}
