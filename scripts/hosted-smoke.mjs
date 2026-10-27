import {chromium} from 'playwright';
import {browserOptions} from '../tests/browser-runtime.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=new URL(process.argv[2]);
if(url.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(url.hostname) && url.protocol==='http:'))throw new Error('Use your HTTPS Mystic address, or localhost for development.');
if(url.username || url.password)throw new Error('Use an address without credentials.');
const browser=await chromium.launch(await browserOptions()),errors=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function device(name,width){const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});await context.addInitScript(name=>{localStorage.setItem('mystic_username',name);window.showSaveFilePicker=undefined;},name);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(url.origin);await page.waitForFunction(()=>!document.querySelector('[data-action="create"]')?.disabled);return page;}
const view=(page,name)=>page.locator('.nav-list').getByRole('button',{name,exact:true}).click();
try{
 const laptop=await device('Demo laptop',1280),phone=await device('Demo phone',390);
 await laptop.getByRole('button',{name:'Create a room',exact:true}).click();await laptop.locator('.status-waiting').waitFor();await phone.goto(laptop.url());
 await Promise.all([laptop.locator('.status-connected').waitFor(),phone.locator('.status-connected').waitFor()]);
 for(const [sender,receiver,name,bytes]of [[laptop,phone,'Mystic-demo.txt',Buffer.from('Mystic hosted transfer: laptop to phone.\n')],[phone,laptop,'Mystic-reply.bin',Buffer.alloc(128*1024+7,73)]]){
  await view(sender,'Send files');await sender.locator('#file-picker').setInputFiles({name,mimeType:'application/octet-stream',buffer:bytes});await sender.getByRole('button',{name:'Send 1 selected file',exact:true}).click();
  await view(receiver,'Received files');const button=receiver.getByRole('button',{name:`Download ${name}`,exact:true});await button.waitFor();
  const [download]=await Promise.all([receiver.waitForEvent('download'),button.click()]);assert.equal(hash(await readFile(await download.path())),hash(bytes));
 }
 for(const [sender,receiver,text]of [[laptop,phone,'The files arrived.'],[phone,laptop,'Received and ready.']]){
  await view(sender,'Messages');await view(receiver,'Messages');await sender.getByLabel('Message',{exact:true}).fill(text);await sender.getByRole('button',{name:'Send message',exact:true}).click();await receiver.getByText(text,{exact:true}).waitFor();await sender.getByText('Delivered',{exact:true}).last().waitFor();
 }
 await laptop.screenshot({path:'test-results/mystic-hosted-desktop.png',fullPage:true});await phone.evaluate(()=>window.scrollTo(0,0));await phone.screenshot({path:'test-results/mystic-hosted-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: public-origin rooms and WebSockets, matching downloaded bytes in both directions, two-way messages with delivery receipts, desktop/phone browser layouts. Browsers ran on this computer; physical cross-network testing remains separate.');
}finally{await browser.close();}
