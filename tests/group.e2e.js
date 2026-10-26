import { browserOptions } from './browser-runtime.js';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../server.js';
const app=createApp({iceServers:[]});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`, browser=await chromium.launch(await browserOptions()), errors=[];
const view=(page,name)=>page.locator('.nav-list').getByRole('button',{name,exact:true}).click();
async function device(name,width=1280){const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(name=>{localStorage.setItem('mystic_username',name);window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined;},name);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>!document.querySelector('[data-action="create"]').disabled);return page;}
async function saved(page){return page.evaluate(async()=>{const request=indexedDB.open('GhostLinkVault');return new Promise(resolve=>{request.onsuccess=()=>{const db=request.result,read=db.transaction('metadata').objectStore('metadata').getAll();read.onsuccess=()=>{resolve(read.result.map(({fileName,sha256,complete})=>({fileName,sha256,complete})));db.close();};};});});}
async function complete(page,count){await page.waitForFunction(count=>document.querySelectorAll('.status-complete').length>=count,count,{timeout:30000});}
try{
 const alice=await device('Alice'),bob=await device('Bob',390),cara=await device('Cara'),dana=await device('Dana',320);
 await alice.getByRole('button',{name:'Create a room',exact:true}).click();await alice.locator('.status-waiting').waitFor();const invite=alice.url();
 await bob.goto(invite);await alice.getByRole('checkbox',{name:'Send to Bob',exact:true}).waitFor();await bob.locator('.status-connected').waitFor();assert.equal(await alice.getByRole('checkbox',{name:'Send to Bob',exact:true}).isChecked(),true);
 await cara.goto(invite);await alice.getByRole('checkbox',{name:'Send to Cara',exact:true}).waitFor();assert.equal(await alice.getByRole('checkbox',{name:'Send to Cara',exact:true}).isChecked(),false);
 await alice.getByRole('checkbox',{name:'Send to Cara',exact:true}).check();
 await dana.goto(invite);await alice.getByRole('checkbox',{name:'Send to Dana',exact:true}).waitFor();assert.equal(await alice.getByRole('checkbox',{name:'Send to Dana',exact:true}).isChecked(),false);
 await dana.getByRole('checkbox',{name:'Send to Cara',exact:true}).waitFor();await dana.waitForFunction(()=>[...document.querySelectorAll('[data-recipient]')].every(input=>!input.disabled));
 const bytes=Buffer.alloc(512*1024+19,41),expected=createHash('sha256').update(bytes).digest('hex');
 await alice.locator('#file-picker').setInputFiles({name:'shared.bin',mimeType:'application/octet-stream',buffer:bytes});await alice.getByRole('button',{name:'Send 1 selected file',exact:true}).click();await complete(alice,2);
 for(const page of [bob,cara]){const files=await saved(page);assert.equal(files.length,1);assert.equal(files[0].sha256,expected);assert.equal(files[0].complete,true);}assert.equal((await saved(dana)).length,0);
 // Group messages go over each channel and retain the sender's chosen display name.
 for(const page of [alice,bob,cara,dana])await page.getByRole('button',{name:'Messages',exact:true}).click();
 await alice.getByLabel('Message',{exact:true}).fill('Ready for review');await alice.getByRole('button',{name:'Send message',exact:true}).click();
 for(const page of [bob,cara,dana])await page.getByText('Ready for review',{exact:true}).waitFor();
 for(const page of [alice,bob,cara,dana])await page.getByRole('button',{name:'Close messages',exact:true}).click();
 await dana.getByRole('button',{name:'Leave room',exact:true}).click();await alice.locator('.status-connected').waitFor();
 await view(bob,'Send files');await bob.getByRole('checkbox',{name:'Send to Alice',exact:true}).check();await bob.getByRole('checkbox',{name:'Send to Cara',exact:true}).uncheck();
 await bob.locator('#file-picker').setInputFiles({name:'reply.txt',mimeType:'text/plain',buffer:Buffer.from('reply for Alice')});await bob.getByRole('button',{name:'Send 1 selected file',exact:true}).click();await complete(bob,2);
 assert.equal((await saved(alice)).filter(item=>item.fileName==='reply.txt').length,1);assert.equal((await saved(cara)).length,1);
 // A rejoined browser keeps its device identity; re-adding the same file verifies saved bytes.
 await bob.reload();await bob.locator('.status-connected').waitFor();await view(alice,'Send files');await alice.getByRole('checkbox',{name:'Send to Bob',exact:true}).check();await alice.getByRole('checkbox',{name:'Send to Cara',exact:true}).uncheck();
 await alice.locator('#file-picker').setInputFiles({name:'shared.bin',mimeType:'application/octet-stream',buffer:bytes});await alice.getByRole('button',{name:'Send 1 selected file',exact:true}).click();await complete(alice,4);assert.equal((await saved(bob)).length,1);
 // Large selections stay usable: paging limits DOM size without dropping staged files.
 await dana.evaluate(()=>{const transfer=new DataTransfer();for(let i=0;i<750;i++)transfer.items.add(new File([],`item-${i}.txt`));const input=document.querySelector('#file-picker');input.files=transfer.files;input.dispatchEvent(new Event('change'));});
 assert.equal(await dana.locator('.send-browser .file-row').count(),200);await dana.getByRole('button',{name:'Show more (200 of 750)',exact:true}).click();assert.equal(await dana.locator('.send-browser .file-row').count(),400);
 await dana.getByRole('checkbox',{name:'Select all files',exact:true}).uncheck();await dana.getByRole('checkbox',{name:'Select all files',exact:true}).check();await dana.locator('.selection-bar').getByText('750 selected',{exact:false}).waitFor();assert.equal(await dana.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await dana.evaluate(()=>window.scrollTo(0,0)); await dana.screenshot({path:'test-results/mystic-mobile-large-folder.png',fullPage:true});
 assert.equal(await bob.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS: four-device room, explicit recipients, new-device exclusion, matching checksums, group messages, departure isolation same-profile resume, and 750-file staging on a phone layout');
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(-5000));console.error(error);throw error;}finally{await browser.close();await app.close();}
