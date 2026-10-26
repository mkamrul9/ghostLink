import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../server.js';
const app = createApp({ iceServers: [] }); await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${app.server.address().port}`, browser = await chromium.launch({ headless:true, channel:process.env.BROWSER_CHANNEL || undefined });
const errors = [], contexts = [];
async function device(width = 1280, clock = false) {
 const context = await browser.newContext({ viewport:{width,height:900}, acceptDownloads:true }); contexts.push(context);
 await context.addInitScript(() => { window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined; });
 const page = await context.newPage(); if(clock)await page.clock.install(); page.on('pageerror', error => errors.push(error.message)); await page.goto(base);
 await page.waitForFunction(() => !document.querySelector('[data-action="create"]').disabled); return page;
}
const view = (page,name) => page.locator('.nav-list').getByRole('button',{name,exact:true}).click();
async function password(page, title, value, button, confirm = false) { const dialog = page.getByRole('dialog',{name:title,exact:true}); await dialog.getByLabel(/^(Backup p|P)assphrase$/, {exact:true}).fill(value); if(confirm) await dialog.getByLabel('Confirm passphrase',{exact:true}).fill(value); await dialog.getByRole('button',{name:button,exact:true}).click(); }
try {
 const sender = await device(), receiver = await device(390, true);
 await sender.getByRole('button',{name:'Create a room',exact:true}).click(); await sender.locator('.status-waiting').waitFor();
 await receiver.goto(sender.url()); await Promise.all([sender.locator('.status-connected').waitFor(), receiver.locator('.status-connected').waitFor()]);
 await sender.getByRole('button',{name:'New empty folder',exact:true}).click();
 await sender.getByRole('dialog').getByLabel('Folder path',{exact:true}).fill('Project/empty'); await sender.getByRole('dialog').getByRole('button',{name:'Add folder',exact:true}).click();
 await sender.locator('#file-picker').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('my private notes')});
 await sender.getByRole('button',{name:'Send 2 selected files',exact:true}).click();
 await receiver.waitForFunction(async () => { const {default:DB} = await import('/DB/DBManager.js'); const request = indexedDB.open('GhostLinkVault'); return await new Promise(resolve => { request.onsuccess = () => { const db=request.result, read=db.transaction('metadata').objectStore('metadata').getAll(); read.onsuccess=()=>{resolve(read.result.filter(item=>item.complete).length===2);db.close();}; }; }); });
 await view(receiver,'Received files'); await receiver.getByRole('checkbox',{name:'Select folder Project/empty',exact:true}).waitFor();
 await view(receiver,'Settings'); await receiver.getByRole('button',{name:'Protect files',exact:true}).click();
 await password(receiver,'Protect your files','my private passphrase','Protect files',true); await receiver.getByText('Your saved files are protected with your passphrase.',{exact:true}).waitFor();
 await receiver.reload(); await receiver.getByRole('button',{name:'Unlock files',exact:true}).waitFor();
 await view(receiver,'Received files'); await receiver.getByRole('heading',{name:'Your files are locked',exact:true}).waitFor();
 await receiver.getByRole('button',{name:'Unlock files',exact:true}).click(); await password(receiver,'Unlock your files','wrong passphrase','Unlock');
 await receiver.getByText('That passphrase did not unlock your files.',{exact:true}).waitFor();
 await receiver.getByRole('button',{name:'Unlock files',exact:true}).click(); await password(receiver,'Unlock your files','my private passphrase','Unlock');
 await receiver.getByRole('button',{name:'Download notes.txt',exact:true}).waitFor();
 await view(receiver,'Settings'); await receiver.getByRole('button',{name:'Save encrypted backup',exact:true}).click();
 const downloaded = receiver.waitForEvent('download'); await password(receiver,'Save an encrypted backup','my backup passphrase','Choose where to save',true);
 const backup = await downloaded, buffer = await readFile(await backup.path()); assert.ok(!buffer.includes(Buffer.from('my private notes')));
 const restored = await device(); await view(restored,'Settings');
 await restored.locator('#backup-picker').setInputFiles({name:'backup.mystic',mimeType:'application/octet-stream',buffer});
 await password(restored,'Restore your backup','my backup passphrase','Restore'); await restored.getByText('2 saved items restored.',{exact:true}).waitFor();
 await view(restored,'Received files'); await restored.getByRole('checkbox',{name:'Select folder Project/empty',exact:true}).waitFor();
 // Independently exercise browser's direct disk writer path with a mocked picker.
 await restored.evaluate(() => { window.__saved=[]; window.showSaveFilePicker=async ({suggestedName}) => ({ createWritable:async () => ({ write:async chunk=>window.__saved.push([...chunk]), close:async()=>{window.__closed=true;}, abort:async()=>{} }) }); });
 await restored.getByRole('button',{name:'Download notes.txt',exact:true}).click(); await restored.waitForFunction(()=>window.__closed);
 const bytes = await restored.evaluate(()=>window.__saved.flat()); assert.equal(Buffer.from(bytes).toString(),'my private notes');
 assert.equal(await receiver.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await receiver.clock.fastForward(11*60*1000); await receiver.getByRole('button',{name:'Unlock files',exact:true}).waitFor();
 await receiver.evaluate(()=>window.scrollTo(0,0)); await receiver.screenshot({path:'test-results/mystic-mobile-security.png',fullPage:true});
 assert.deepEqual(errors,[]); console.log('PASS: empty folder handoff, mobile passphrase protection, locked reload, encrypted backup/restore, streaming browser save, and automatic idle locking');
} finally { await browser.close(); await app.close(); }
