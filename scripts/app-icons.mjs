import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {browserOptions} from '../tests/browser-runtime.js';
const browser=await chromium.launch(await browserOptions());
try{
 const mark=await readFile('src/assets/mystic-mark.svg','utf8');
 for(const size of [180,192,512]){
  const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;}svg{display:block;width:100%;height:100%;}</style>${mark}`);
  await page.screenshot({path:`src/assets/mystic-${size}.png`});await page.close();
 }
 const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
 await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#ff9b59;display:grid;place-items:center;}svg{width:384px;height:384px;}</style>${mark}`);
 await page.screenshot({path:'src/assets/mystic-maskable-512.png'});
}finally{await browser.close();}
