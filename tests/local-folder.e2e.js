import { browserOptions } from './browser-runtime.js';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../server.js';
const app=createApp({iceServers:[]});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`,browser=await chromium.launch(await browserOptions()),errors=[];
const view=(page,name)=>page.locator('.nav-list').getByRole('button',{name,exact:true}).click();
async function device(folder=false){const context=await browser.newContext({acceptDownloads:true});if(folder)await context.addInitScript(()=>{window.showDirectoryPicker=async()=>navigator.storage.getDirectory();window.showSaveFilePicker=undefined;Object.defineProperty(navigator.storage,'estimate',{value:async()=>({quota:1,usage:1})});});const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>!document.querySelector('[data-action="create"]').disabled);return page;}
async function openFolder(page,fresh){await view(page,'Settings');await page.getByRole('button',{name:'Choose local folder',exact:true}).click();const dialog=page.getByRole('dialog',{name:fresh?'Protect local folder':'Open local folder',exact:true});await dialog.getByLabel('Folder passphrase',{exact:true}).fill('my local folder passphrase');if(fresh)await dialog.getByLabel('Confirm passphrase',{exact:true}).fill('my local folder passphrase');await dialog.getByRole('button',{name:fresh?'Use this folder':'Open folder',exact:true}).click();await page.getByText('Received files will stay encrypted in your chosen folder.',{exact:true}).waitFor();}
try{
 const sender=await device(),receiver=await device(true);await openFolder(receiver,true);
 await sender.getByRole('button',{name:'Create a room',exact:true}).click();await sender.locator('.status-waiting').waitFor();await receiver.goto(sender.url());
 // Folder handles persist, but keys never do. Unlock before accepting a transfer.
 await view(receiver,'Settings');await receiver.getByRole('button',{name:'Unlock files',exact:true}).click();const unlock=receiver.getByRole('dialog',{name:'Unlock your files'});await unlock.getByLabel('Passphrase',{exact:true}).fill('my local folder passphrase');await unlock.getByRole('button',{name:'Unlock',exact:true}).click();
 await Promise.all([sender.locator('.status-connected').waitFor(),receiver.locator('.status-connected').waitFor()]);
 const bytes=Buffer.alloc(1024*1024+11,23);await sender.locator('#file-picker').setInputFiles({name:'project.bin',mimeType:'application/octet-stream',buffer:bytes});await sender.getByRole('button',{name:'Send 1 selected file',exact:true}).click();await sender.locator('.status-complete').waitFor({timeout:45000});
 const originalId=await receiver.evaluate(()=>localStorage.getItem('mystic_device_id'));
 const browserChunks=await receiver.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('GhostLinkVault');request.onsuccess=()=>{const db=request.result,read=db.transaction('chunks').objectStore('chunks').count();read.onsuccess=()=>{resolve(read.result);db.close();};};}));assert.equal(browserChunks,0);
 await view(receiver,'Received files');const waiting=receiver.waitForEvent('download');await receiver.getByRole('button',{name:'Download project.bin',exact:true}).click();const downloaded=await waiting;assert.deepEqual(await readFile(await downloaded.path()),bytes);
 // The OPFS handle is only an automated directory-API stand-in. Production uses
 // showDirectoryPicker's external directory; unit tests separately verify DB-loss recovery.
 await receiver.evaluate(()=>new Promise(resolve=>{localStorage.removeItem('mystic_device_id');const request=indexedDB.deleteDatabase('GhostLinkVault');request.onsuccess=()=>resolve();}));await receiver.reload();await openFolder(receiver,false);assert.equal(await receiver.evaluate(()=>localStorage.getItem('mystic_device_id')),originalId);
 await view(receiver,'Received files');await receiver.getByRole('button',{name:'Download project.bin',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: local folder setup, locked reload, real directory API writes, browser-quota bypass, export verification and reopening after database loss');
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(-2800));throw error;}finally{await browser.close();await app.close();}
