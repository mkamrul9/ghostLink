import { browserOptions } from './browser-runtime.js';
import { chromium } from 'playwright';
import { createReadStream } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../server.js';
const app=createApp({iceServers:[]});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch(await browserOptions()),base=`http://127.0.0.1:${app.server.address().port}`,errors=[];
let serverDownloads=0;app.server.on('request',req=>{if(req.url.startsWith('/local-download/'))serverDownloads++;});
const size=280*1024**2, seed=Buffer.alloc(1024**2,73),hash=createHash('sha256');for(let i=0;i<280;i++)hash.update(seed);const expected=hash.digest('hex');
try{
 const pages=[];
 for(let i=0;i<2;i++){const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>!document.querySelector('[data-action="create"]').disabled);pages.push(page);}
 const [sender,receiver]=pages;await sender.getByRole('button',{name:'Create a room',exact:true}).click();await sender.locator('.status-waiting').waitFor();await receiver.goto(sender.url());await Promise.all(pages.map(page=>page.locator('.status-connected').waitFor()));
 await sender.evaluate(()=>{const chunk=new Uint8Array(1024**2).fill(73),file=new File(Array.from({length:280},()=>chunk),'large-handoff.bin'),transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('#file-picker');input.files=transfer.files;input.dispatchEvent(new Event('change'));});
 const started=Date.now();await sender.getByRole('button',{name:'Send 1 selected file',exact:true}).click();await sender.waitForFunction(()=>document.querySelector('.status-complete'),{},{timeout:180000});
 const result=await receiver.evaluate(async()=>{const request=indexedDB.open('GhostLinkVault');return new Promise(resolve=>{request.onsuccess=()=>{const db=request.result,read=db.transaction('metadata').objectStore('metadata').getAll();read.onsuccess=()=>{const {fileId,fileSize,sha256,verified,complete}=read.result[0];resolve({fileId,fileSize,sha256,verified,complete});db.close();};};});});
 assert.equal(result.fileSize,size);assert.equal(result.sha256,expected);assert.equal(result.verified,true);assert.equal(result.complete,true);
 // Verify the entire decrypted export, using a bounded native-writer test double.
 await receiver.evaluate(()=>{window.__written=0;window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async bytes=>{window.__written+=bytes.byteLength;for(const value of bytes)if(value!==73)throw new Error('Export bytes differ');},close:async()=>{window.__saved=true;},abort:async()=>{}})});});
 await receiver.locator('.nav-list').getByRole('button',{name:'Received files',exact:true}).click();await receiver.getByRole('button',{name:'Download large-handoff.bin',exact:true}).click();await receiver.waitForFunction(()=>window.__saved,{},{timeout:120000});assert.equal(await receiver.evaluate(()=>window.__written),size);
 // The second export uses a service-worker response with transferable stream backpressure.
 await receiver.evaluate(()=>{window.showSaveFilePicker=undefined;});const waiting=receiver.waitForEvent('download');
 await receiver.getByRole('button',{name:'Download large-handoff.bin',exact:true}).click();const download=await waiting;
 const downloadedHash=createHash('sha256');let downloadedBytes=0;for await(const chunk of createReadStream(await download.path())){downloadedHash.update(chunk);downloadedBytes+=chunk.length;}
 assert.equal(downloadedBytes,size);assert.equal(downloadedHash.digest('hex'),expected);assert.equal(await download.failure(),null);assert.equal(serverDownloads,0);
 assert.equal(await receiver.evaluate(async()=>{const response=await fetch(`/local-download/${crypto.randomUUID()}`);return response.status;}),404);assert.equal(serverDownloads,0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',bytes:size,sha256:expected,transferMs:Date.now()-started,scope:'280 MiB over real local WebRTC and IndexedDB, then native and browser-owned streaming exports; not an internet throughput benchmark.'}));
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(-2000));console.error(errors);throw error;}finally{await browser.close();await app.close();}
