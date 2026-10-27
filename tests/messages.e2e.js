import {browserOptions} from './browser-runtime.js';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createApp} from '../server.js';
const app=createApp({iceServers:[]});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=process.env.MYSTIC_TEST_URL || `http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch(await browserOptions()), errors=[];
async function device(name,width){const context=await browser.newContext({viewport:{width,height:844},acceptDownloads:true});await context.addInitScript(name=>localStorage.setItem('mystic_username',name),name);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>!document.querySelector('[data-action="create"]').disabled);return page;}
const view=(page,name)=>page.locator('.nav-list').getByRole('button',{name,exact:true}).click();
try{
 const alice=await device('Alice',1280),bob=await device('Bob',390),cara=await device('Cara',320);
 await alice.getByRole('button',{name:'Create a room',exact:true}).click();await alice.locator('.status-waiting').waitFor();const invite=alice.url();
 for(const page of [bob,cara]){await page.goto(invite);await page.locator('.status-connected').waitFor();}
 await alice.waitForFunction(()=>[...document.querySelectorAll('[data-recipient]')].length===2 && [...document.querySelectorAll('[data-recipient]')].every(item=>!item.disabled));
 await view(alice,'Messages');await alice.getByLabel('Message',{exact:true}).fill('Folder handoff ready');await alice.getByLabel('Message',{exact:true}).press('Enter');
 await alice.getByText('Delivered to 2 devices',{exact:true}).waitFor();
 await bob.locator('.unread-badge').getByText('1',{exact:true}).waitFor();await view(bob,'Messages');assert.equal(await bob.locator('.unread-badge').isVisible(),false);
 await bob.getByLabel('Message',{exact:true}).fill('Thanks\n');await bob.getByLabel('Message',{exact:true}).press('Shift+Enter');await bob.getByLabel('Message',{exact:true}).press('x');await bob.getByRole('button',{name:'Send message',exact:true}).click();await alice.getByText('Thanks\n\nx',{exact:true}).waitFor();
 await bob.getByLabel('Message',{exact:true}).fill('Unsent draft');
 const long='A'.repeat(1500)+' https://example.com/share';await alice.getByLabel('Message',{exact:true}).fill(long);await alice.getByRole('button',{name:'Send message',exact:true}).click();await bob.getByRole('link',{name:'https://example.com/share',exact:true}).waitFor();assert.equal(await bob.getByLabel('Message',{exact:true}).inputValue(),'Unsent draft');assert.equal(await bob.getByLabel('Message',{exact:true}).evaluate(node=>node===document.activeElement),true);
 await bob.getByLabel('Search messages',{exact:true}).fill('handoff');assert.equal(await bob.locator('.chat-message').count(),1);await bob.getByLabel('Search messages',{exact:true}).fill('');
 await bob.getByLabel('Message',{exact:true}).fill('Unsent draft');await view(bob,'Send files');await bob.locator('.header-chat').click();assert.equal(await bob.getByLabel('Message',{exact:true}).inputValue(),'Unsent draft');await bob.getByRole('button',{name:'Close messages',exact:true}).click();await view(bob,'Messages');
 const [download]=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Save room messages',exact:true}).click()]);const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.messages.length,3);
 await bob.reload();await bob.locator('.status-connected').waitFor();await bob.getByRole('link',{name:'https://example.com/share',exact:true}).waitFor();assert.equal(await bob.locator('.chat-message').count(),3);
 assert.equal(await bob.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await bob.setViewportSize({width:390,height:320});await bob.getByLabel('Message',{exact:true}).scrollIntoViewIfNeeded();assert.equal(await bob.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await bob.setViewportSize({width:390,height:844});
 for(const page of [alice,bob])await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
 await mkdir('test-results',{recursive:true});await alice.screenshot({path:'test-results/mystic-messages-desktop.png',fullPage:true});await bob.screenshot({path:'test-results/mystic-messages-mobile.png',fullPage:true});
 await bob.getByRole('button',{name:'Clear room messages on this device',exact:true}).click();await bob.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await bob.waitForFunction(()=>document.querySelectorAll('.chat-message').length===0);assert.equal(await bob.locator('.chat-message').count(),0);assert.equal(await alice.locator('.chat-message').count(),3);
 assert.deepEqual(errors,[]);console.log('PASS: three-device room messages, receipt counts, unread badge, multiline/long notes, safe links, search, drafts, local export/clear, reload and mobile layouts');
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(-2400));throw error;}finally{await browser.close();await app.close();}
