import { browserOptions } from '../tests/browser-runtime.js';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../server.js';
const root=resolve('test-results/readme-fixture/Studio');
for(const folder of ['Design','Planning'])await mkdir(resolve(root,folder),{recursive:true});
for(const [name,contents]of [['Design/Brand-guide.pdf','Mystic sample file'],['Design/Logo.svg','<svg xmlns="http://www.w3.org/2000/svg"/>'],['Planning/Launch-plan.md','# Launch plan'],['Planning/Checklist.txt','Review files\nConfirm handoff'],['Read-me.txt','Example project for Mystic documentation']])await writeFile(resolve(root,name),contents);
await mkdir('docs/images',{recursive:true});
const app=createApp({iceServers:[]});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch(await browserOptions()),base=`http://127.0.0.1:${app.server.address().port}`;
try{
 const senderContext=await browser.newContext({viewport:{width:1440,height:1060},reducedMotion:'reduce'}),receiverContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await senderContext.addInitScript(()=>localStorage.setItem('mystic_username','Studio laptop'));await receiverContext.addInitScript(()=>localStorage.setItem('mystic_username','My phone'));
 const sender=await senderContext.newPage(),receiver=await receiverContext.newPage();await sender.goto(base);await sender.waitForFunction(()=>!document.querySelector('[data-action="create"]').disabled);await sender.getByRole('button',{name:'Create a room',exact:true}).click();await sender.locator('.status-waiting').waitFor();await receiver.goto(sender.url());await sender.locator('.status-connected').waitFor();
 await sender.locator('#folder-picker').setInputFiles(root);await sender.screenshot({path:'docs/images/mystic-desktop.png',fullPage:true});
 await sender.getByRole('button',{name:'Send 5 selected files',exact:true}).click();await sender.waitForFunction(()=>document.querySelectorAll('.status-complete').length===5);await receiver.locator('.nav-list').getByRole('button',{name:'Received files',exact:true}).click();await receiver.evaluate(()=>window.scrollTo(0,0));await receiver.screenshot({path:'docs/images/mystic-mobile.png',fullPage:true});
 for(const [from,to,text]of [[sender,receiver,'The project folder is ready.'],[receiver,sender,'Received. Thank you!']]){
  for(const page of [from,to])await page.locator('.nav-list').getByRole('button',{name:'Messages',exact:true}).click();
  await from.getByLabel('Message',{exact:true}).fill(text);await from.getByRole('button',{name:'Send message',exact:true}).click();await to.getByText(text,{exact:true}).waitFor();await from.getByText('Delivered',{exact:true}).last().waitFor();
 }
 for(const [page,kind]of [[sender,'desktop'],[receiver,'mobile']]){await page.evaluate(()=>{document.querySelector('.toast-container').replaceChildren();document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`docs/images/mystic-messages-${kind}.png`,fullPage:true});}
 console.log('Captured current desktop and mobile file-sharing and room-message screens.');
}finally{await browser.close();await app.close();}
