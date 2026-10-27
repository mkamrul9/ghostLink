import { browserOptions } from './browser-runtime.js';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../server.js';
const app = createApp({ iceServers: [], maxRoomPeers: 2 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch(await browserOptions());
const contexts = [], errors = [], consoleErrors = [];
await mkdir('test-results/upload/Trip/day1', { recursive: true });
await mkdir('test-results/upload/Trip/day2', { recursive: true });
await writeFile('test-results/upload/Trip/day1/photo.jpg', 'first photo');
await writeFile('test-results/upload/Trip/day2/photo.jpg', 'second photo');
await writeFile('test-results/upload/Trip/notes.txt', 'trip notes');
async function device(viewport = { width: 1440, height: 1050 }, path = '/') {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    context.setDefaultTimeout(20000); contexts.push(context);
    await context.addInitScript(() => {
        window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
        window.__copied = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copied.push(value); } } });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async value => { window.__shared = value; } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR', error.message); });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(base + path);
    await page.waitForFunction(() => document.querySelector('[data-action="create"]') && !document.querySelector('[data-action="create"]').disabled);
    return page;
}
async function view(page, name) { await page.locator('.nav-list').getByRole('button', { name, exact: true }).click(); }
async function connected(page) { await page.locator('.status-connected').waitFor({ timeout: 45000 }); }
async function complete(page, count) { await page.waitForFunction(count => document.querySelectorAll('.transfer-status.status-complete').length >= count, count, { timeout: 45000 }); }
const hash = data => createHash('sha256').update(data).digest('hex');
try {
    const host = await device();
    const guest = await device();
    await host.getByRole('button', { name: 'Create a room', exact: true }).click();
    await host.locator('.status-waiting').waitFor();
    const code = await host.getByLabel('Your room code', { exact: true }).inputValue();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    const invite = host.url();
    await host.getByRole('button', { name: 'Copy room code', exact: true }).click();
    await host.getByRole('button', { name: 'Share room', exact: true }).click();
    const sharing = host.getByRole('dialog', { name: 'Share room' });
    await sharing.getByRole('button', { name: 'Copy link', exact: true }).click();
    assert.deepEqual(await host.evaluate(() => window.__copied), [code, invite]);
    assert.ok(decodeURIComponent(await sharing.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).includes(code));
    assert.ok(decodeURIComponent(await sharing.getByRole('link', { name: 'Telegram' }).getAttribute('href')).includes(invite));
    await sharing.getByRole('button', { name: 'More apps' }).click();
    assert.equal((await host.evaluate(() => window.__shared)).url, invite);
    await sharing.getByRole('button', { name: 'Close sharing' }).click();
    await guest.getByLabel('Room code or invite link').fill(code.toLowerCase());
    await guest.getByRole('button', { name: 'Join room', exact: true }).click();
    await Promise.all([connected(host), connected(guest)]);
    console.log('PASS: readable room codes, copy, social links, native sharing and joining by code');

    const third = await device(); await third.goto(invite);
    await third.getByText('This room already has two devices.', { exact: true }).first().waitFor();
    await third.context().close();
    console.log('PASS: room remains private to two devices');

    await view(host, 'Settings');
    await host.getByLabel('Your name', { exact: true }).fill('Morgan <Studio>');
    await host.getByRole('button', { name: 'Save settings', exact: true }).click();
    await host.locator('.header-chat').click();
    await guest.locator('.header-chat').click();
    await guest.getByLabel('Message', { exact: true }).fill('keep this draft');
    const message = '<img src=x onerror="window.__xss=1"> Hello';
    await host.getByLabel('Message', { exact: true }).fill(message);
    await host.getByRole('button', { name: 'Send message', exact: true }).click();
    await guest.getByText(message, { exact: true }).waitFor();
    assert.equal(await guest.getByLabel('Message', { exact: true }).inputValue(), 'keep this draft');
    assert.equal(await guest.evaluate(() => window.__xss), undefined);
    await guest.getByRole('log', {name:'Messages'}).getByText('Morgan <Studio>', { exact: true }).waitFor();
    await host.getByRole('button', { name: 'Close messages' }).click();
    await guest.getByRole('button', { name: 'Close messages' }).click();
    console.log('PASS: simpler messages drawer, name settings, preserved drafts and safe text');

    await view(host, 'Send files');
    await host.locator('#folder-picker').setInputFiles(resolve('test-results/upload/Trip'));
    assert.equal(await host.locator('.send-browser .file-row').count(), 3);
    await host.getByRole('button', { name: 'Rename notes.txt', exact: true }).click();
    await host.getByRole('dialog', { name: 'Rename file' }).getByLabel('File name', { exact: true }).fill('trip-notes.txt');
    await host.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
    await host.getByRole('button', { name: 'Move to folder', exact: true }).click();
    await host.getByRole('dialog', { name: 'Move to folder' }).getByLabel('Folder name', { exact: true }).fill('Holiday');
    await host.getByRole('dialog').getByRole('button', { name: 'Move files', exact: true }).click();
    await host.getByRole('checkbox', { name: 'Select Holiday/day1/photo.jpg', exact: true }).waitFor();
    await host.getByRole('searchbox', { name: 'Search selected files' }).fill('trip-notes');
    assert.equal(await host.locator('.send-browser .file-row').count(), 1);
    await host.getByRole('checkbox', { name: 'Select all files', exact: true }).uncheck();
    await host.getByRole('searchbox', { name: 'Search selected files' }).fill('');
    await host.getByRole('checkbox', { name: 'Select all files', exact: true }).check();
    await host.getByRole('combobox', { name: 'Sort files' }).first().selectOption('size');
    console.log('PASS: adding nested folders, rename, move, search, sort and selection');
    await host.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); document.activeElement?.blur(); window.scrollTo(0, 0); document.querySelector('.toast-container').replaceChildren(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await host.screenshot({ path: 'test-results/mystic-organize.png', fullPage: true });

    await host.getByRole('button', { name: 'Ask Pip', exact: true }).click();
    await host.getByLabel('Ask the helper', { exact: true }).fill('send photo.jpg');
    await host.getByRole('button', { name: 'Ask helper', exact: true }).click();
    await host.getByText('More than one file has that name. Include the folder, for example: send Reports/report.pdf.', { exact: true }).waitFor();
    await host.getByLabel('Ask the helper', { exact: true }).fill('send Holiday/day1/photo.jpg');
    await host.getByRole('button', { name: 'Ask helper', exact: true }).click();
    const helper = host.getByRole('dialog', { name: 'Pip helper' });
    assert.equal(await helper.locator('.helper-review li').count(), 1);
    await host.screenshot({ path: 'test-results/mystic-helper.png', fullPage: true });
    await helper.getByRole('button', { name: 'Send 1 file', exact: true }).click();
    await Promise.all([complete(host, 1), complete(guest, 1)]);
    await host.getByRole('button', { name: 'Close helper', exact: true }).click();
    await view(host, 'Send files');
    assert.equal(await host.locator('.send-browser .file-row').count(), 2);
    await host.getByRole('button', { name: 'Send 2 selected files', exact: true }).click();
    await Promise.all([complete(host, 3), complete(guest, 3)]);
    console.log('PASS: free helper handles ambiguity and sends only the reviewed file');

    await view(guest, 'Received files');
    const [folderDownload] = await Promise.all([guest.waitForEvent('download'), guest.getByRole('button', { name: 'Download folder Holiday', exact: true }).click()]);
    const restored = unzipSync(new Uint8Array(await readFile(await folderDownload.path())));
    assert.deepEqual(Object.keys(restored).sort(), ['Holiday/day1/photo.jpg', 'Holiday/day2/photo.jpg', 'Holiday/trip-notes.txt']);
    assert.equal(strFromU8(restored['Holiday/day2/photo.jpg']), 'second photo');
    console.log('PASS: received folder download restores nested paths and file contents');

    const payload = Buffer.alloc(786543); for (let index = 0; index < payload.length; index++) payload[index] = index % 251;
    await view(host, 'Send files');
    await host.locator('#file-picker').setInputFiles([{ name: 'design-notes.bin', mimeType: 'application/octet-stream', buffer: payload }, { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }]);
    await host.getByRole('button', { name: 'Send 2 selected files', exact: true }).click();
    await Promise.all([complete(host, 5), complete(guest, 5)]);
    const [download] = await Promise.all([guest.waitForEvent('download'), guest.getByRole('button', { name: 'Download design-notes.bin', exact: true }).click()]);
    assert.equal(hash(await readFile(await download.path())), hash(payload));
    await guest.reload(); await Promise.all([connected(host), connected(guest)]);
    const [emptyDownload] = await Promise.all([guest.waitForEvent('download'), guest.getByRole('button', { name: 'Download empty.txt', exact: true }).click()]);
    assert.equal((await readFile(await emptyDownload.path())).length, 0);
    console.log('PASS: encrypted binary and empty files, reconnect, saved files and matching SHA-256');

    await guest.getByRole('button', { name: 'Rename trip-notes.txt', exact: true }).click();
    await guest.getByRole('dialog').getByLabel('File name', { exact: true }).fill('saved-notes.txt');
    await guest.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
    await guest.getByRole('checkbox', { name: 'Select Holiday/saved-notes.txt', exact: true }).check();
    await guest.getByRole('button', { name: 'Move to folder', exact: true }).click();
    await guest.getByRole('dialog').getByLabel('Folder name', { exact: true }).fill('Saved');
    await guest.getByRole('dialog').getByRole('button', { name: 'Move files', exact: true }).click();
    await guest.getByRole('checkbox', { name: 'Select Saved/saved-notes.txt', exact: true }).waitFor();
    console.log('PASS: received files can be renamed and organized without changing original files');

    await view(guest, 'Send files');
    await guest.locator('#file-picker').setInputFiles({ name: 'reply.txt', mimeType: 'text/plain', buffer: Buffer.from('A reply') });
    await guest.getByRole('button', { name: 'Send 1 selected file', exact: true }).click();
    await Promise.all([complete(host, 6), complete(guest, 6)]);
    await view(host, 'Send files');
    await host.locator('#file-picker').setInputFiles({ name: 'cancel-and-retry.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4 * 1024 * 1024, 31) });
    await host.getByRole('button', { name: 'Send 1 selected file', exact: true }).click();
    const cancelled = host.locator('.transfer-card').filter({ hasText: 'cancel-and-retry.bin' }).first();
    await cancelled.getByRole('button', { name: 'Cancel', exact: true }).click();
    await cancelled.locator('.status-cancelled').waitFor();
    await cancelled.getByRole('button', { name: 'Resume', exact: true }).click();
    await Promise.all([complete(host, 7), complete(guest, 7)]);
    console.log('PASS: transfers work in both directions, with cancellation and retry');

    await view(host, 'Settings');
    await host.locator('.settings-details').filter({ hasText: 'History' }).locator('summary').click();
    const [exported] = await Promise.all([host.waitForEvent('download'), host.getByRole('button', { name: 'Download history', exact: true }).click()]);
    assert.equal(JSON.parse(await readFile(await exported.path(), 'utf8')).app, 'Mystic');
    await view(guest, 'Settings');
    await guest.locator('.settings-details').filter({ hasText: 'History' }).locator('summary').click();
    await guest.getByRole('button', { name: 'Clear history', exact: true }).click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await view(guest, 'Received files');
    assert.ok(await guest.locator('.received-browser .file-row').count() >= 6);
    await guest.getByRole('button', { name: 'Delete empty.txt', exact: true }).click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await guest.getByRole('button', { name: 'Download empty.txt', exact: true }).waitFor({ state: 'detached' });
    console.log('PASS: history export, history clearing and independent file deletion');

    await view(host, 'Help');
    await host.locator('[data-tour="send"]').click();
    const tour = host.getByRole('dialog', { name: 'Mystic tutorial' });
    await tour.getByRole('heading', { name: 'Create a room', exact: true }).waitFor();
    for (let index = 0; index < 4; index++) await tour.getByRole('button', { name: 'Next', exact: true }).click();
    await tour.getByRole('button', { name: 'Done', exact: true }).click();
    await host.getByRole('searchbox', { name: 'Search help' }).fill('WhatsApp');
    assert.equal(await host.locator('.faq-list details').count(), 1);
    await host.getByRole('searchbox', { name: 'Search help' }).fill('');
    console.log('PASS: help search and complete interactive tutorial');
    await view(host, 'Send files');
    await host.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); document.activeElement?.blur(); window.scrollTo(0, 0); document.querySelector('.toast-container').replaceChildren(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await host.screenshot({ path: 'test-results/mystic-desktop.png', fullPage: true });

    const mobile = await device({ width: 390, height: 844 }, '/help');
    await mobile.getByRole('heading', { name: 'Help', exact: true }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await view(mobile, 'Send files');
    await mobile.locator('#file-picker').setInputFiles({ name: 'mobile-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await mobile.getByRole('button', { name: 'Send 1 selected file', exact: true }).isDisabled());
    await mobile.getByRole('button', { name: 'Ask Pip', exact: true }).click();
    await mobile.getByLabel('Ask the helper', { exact: true }).fill('How do I receive files?');
    await mobile.getByRole('button', { name: 'Ask helper', exact: true }).click();
    await mobile.getByRole('button', { name: 'Open received files', exact: true }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.getByRole('button', { name: 'Close helper', exact: true }).click();
    await view(mobile, 'Settings');
    await mobile.getByLabel('Your name', { exact: true }).fill('Mobile Mystic');
    await mobile.getByRole('button', { name: 'Save settings', exact: true }).click();
    await mobile.reload();
    assert.equal(await mobile.getByLabel('Your name', { exact: true }).inputValue(), 'Mobile Mystic');
    await view(mobile, 'Send files');
    await mobile.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); document.activeElement?.blur(); window.scrollTo(0, 0); document.querySelector('.toast-container').replaceChildren(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await mobile.screenshot({ path: 'test-results/mystic-mobile.png', fullPage: true });
    console.log('PASS: mobile text, navigation, helper, direct Help route and saved settings');
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    assert.deepEqual(consoleErrors, [], 'Browser console errors');
    console.log('Browser acceptance suite passed.');
} catch (error) {
    for (let index = 0; index < contexts.length; index++) for (const page of contexts[index].pages()) {
        if (!page.isClosed()) {
            await page.screenshot({ path: `test-results/failure-${index}.png`, fullPage: true }).catch(() => {});
            console.error(`PAGE ${index}:`, (await page.locator('body').innerText()).slice(-3500));
        }
    }
    console.error('Browser errors:', errors, consoleErrors); throw error;
} finally { await browser.close(); await app.close(); }
