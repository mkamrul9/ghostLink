import {browserOptions} from './browser-runtime.js';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createApp} from '../server.js';
const app=createApp({iceServers:[]});let version=1;
const original=app.server.listeners('request')[0];app.server.removeAllListeners('request');
app.server.on('request',async(req,res)=>{
 if(version===2 && ['/download-worker.js','/pwa-assets.js'].includes(req.url)){
  let source=await readFile(`src${req.url}`,'utf8');source=req.url==='/pwa-assets.js'?source.replace(/mystic-shell-[a-f0-9]+/,'mystic-shell-update-test'):source+'\n// update test\n';
  res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(source);return;
 }
 original(req,res);
});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch(await browserOptions());const context=await browser.newContext({acceptDownloads:true});await context.addInitScript(()=>{window.showSaveFilePicker=undefined;});const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base+'/settings');await page.getByRole('button',{name:'Install Mystic',exact:true}).waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const manifest=await (await context.request.get(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 for(const size of [192,512]){const icon=manifest.icons.find(item=>item.sizes===`${size}x${size}` && item.purpose==='any');assert.ok(icon);const bytes=await (await context.request.get(base+icon.src)).body();assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
 assert.ok(manifest.icons.some(item=>item.purpose==='maskable'));
 await page.getByRole('button',{name:'Install Mystic',exact:true}).click();await page.getByRole('dialog',{name:'Install Mystic',exact:true}).waitFor();await page.getByRole('button',{name:'Got it',exact:true}).click();
 // Seed local history and an empty received file. Neither may enter the shell cache.
 await page.evaluate(async()=>{
  const write=(name,store,records)=>new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>{const db=request.result,tx=db.transaction(store,'readwrite');for(const value of records)tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  await write('GhostLinkHistory','chat',[{id:'private-pwa-note',roomId:'',origin:'peer',author:'My device',text:'Private offline note',ts:Date.now()}]);
  await write('GhostLinkVault','metadata',[{fileId:7201,fileName:'offline-empty.txt',fileSize:0,totalChunks:0,receivedChunks:0,complete:true,createdAt:Date.now(),sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}]);
 });
 const entries=await page.evaluate(async()=>{const names=await caches.keys(), urls=[];for(const name of names)for(const request of await(await caches.open(name)).keys())urls.push(new URL(request.url).pathname);return urls;});
 assert.ok(entries.includes('/index.html'));assert.ok(entries.includes('/utils/WebRTCConnection.js'));assert.ok(!entries.some(path=>/api|signal|local-download|private-pwa-note/.test(path)));
 await context.setOffline(true);await page.goto(base+'/messages');await page.getByText('Private offline note',{exact:true}).waitFor();await page.getByText('Offline. Your saved files, room messages, and help are available.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Send message',exact:true}).isDisabled(),true);
 await page.locator('.nav-list').getByRole('button',{name:'Received files',exact:true}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download offline-empty.txt',exact:true}).click()]);assert.equal((await readFile(await download.path())).length,0);
 await page.goto(base+'/help');await page.getByRole('heading',{name:'Help',exact:true}).waitFor();
 await context.setOffline(false);await page.goto(base+'/settings');version=2;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
 await page.getByRole('button',{name:'Update Mystic',exact:true}).waitFor();
 await page.getByRole('button',{name:'Update Mystic',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
 await page.waitForFunction(async()=> (await caches.keys()).includes('mystic-shell-update-test') && !(await navigator.serviceWorker.getRegistration()).waiting);
 assert.deepEqual(errors,[]);console.log('PASS: install manifest and PNG icons, installation guidance, private-content-free shell cache, offline room history/help/verified download, controlled update activation');
}catch(error){console.error((await page.locator('body').innerText()).slice(-4000));throw error;}finally{await browser.close();await app.close();}
