import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createApp } from '../server.js';
const app = createApp({ iceServers: [] });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
const errors = [];
const pageErrors = [];
let contexts = [];
await mkdir('test-results', { recursive: true });
async function device(viewport = { width: 1440, height: 1100 }) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    contexts.push(context);
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    page.on('pageerror', error => { pageErrors.push(error.message); console.error('PAGE ERROR:', error.message); });
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base);
    console.log('Device loaded:', await page.title());
    await page.getByRole('button', { name: '+ Create a room', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-action="create"]').disabled);
    return page;
}
async function connected(page) { await page.locator('.status-pill.status-connected').waitFor({ timeout: 45000 }); }
async function completed(page, count) { await page.waitForFunction(count => document.querySelectorAll('.transfer-status.status-complete').length >= count, count, { timeout: 45000 }); }
const hash = data => createHash('sha256').update(data).digest('hex');
try {
    const host = await device();
    const guest = await device();
    await host.getByRole('button', { name: '+ Create a room', exact: true }).click();
    await host.locator('.status-pill.status-waiting').waitFor();
    const invite = host.url();
    assert.equal(await host.locator('#room-code').inputValue(), new URLSearchParams(new URL(invite).hash.slice(1)).get('room'));
    await guest.goto(invite);
    await Promise.all([connected(host), connected(guest)]);
    console.log('PASS: invitation connects two isolated browser profiles');
    await host.locator('#room-code').fill('bad');
    await host.getByRole('button', { name: 'Join room', exact: true }).click();
    await host.getByText('Paste a valid invite link or room code (8-64 characters).', { exact: true }).first().waitFor();
    await connected(host);
    console.log('PASS: invalid join does not interrupt an active session');

    const third = await device();
    await third.goto(invite);
    await third.getByText('This room already has two peers.', { exact: true }).first().waitFor();
    await third.context().close();
    console.log('PASS: third peer rejected');

    await host.getByRole('button', { name: /Preferences/ }).click();
    await host.getByLabel('Display name', { exact: true }).fill('Morgan <Studio>');
    await host.getByRole('button', { name: 'Save preferences' }).click();
    await host.getByRole('button', { name: /Overview/ }).click();
    await guest.locator('.chat-input').fill('draft survives incoming updates');
    const message = '<img src=x onerror="window.__xss=1"> Hello from Mystic';
    await host.locator('.chat-input').fill(message);
    await host.locator('.chat-form').getByRole('button', { name: 'Send', exact: true }).click();
    await guest.getByText(message, { exact: true }).waitFor();
    assert.equal(await guest.locator('.chat-input').inputValue(), 'draft survives incoming updates');
    assert.equal(await host.locator('.chat-input').inputValue(), '');
    assert.equal(await guest.evaluate(() => window.__xss), undefined);
    await guest.getByText('Morgan <Studio>', { exact: true }).waitFor();
    console.log('PASS: private chat, saved display name, draft/focus preservation and HTML escaping');

    const payload = Buffer.alloc(786543); for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
    await host.locator('#file-picker').setInputFiles([
        { name: 'design-notes.bin', mimeType: 'application/octet-stream', buffer: payload },
        { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }
    ]);
    await host.getByRole('button', { name: 'Send 2 selected files', exact: true }).click();
    await Promise.all([completed(host, 2), completed(guest, 2)]);
    console.log('PASS: sequential encrypted transfers including zero-byte file');
    await guest.getByRole('button', { name: /Local vault/ }).click();
    assert.equal(await guest.locator('.vault-card').count(), 2);
    const fileCard = guest.locator('.vault-card').filter({ hasText: 'design-notes.bin' });
    const [download] = await Promise.all([guest.waitForEvent('download'), fileCard.getByRole('button', { name: 'Download' }).click()]);
    assert.equal(hash(await readFile(await download.path())), hash(payload));
    console.log('PASS: vault download content matches source SHA-256');

    await guest.reload();
    await Promise.all([connected(host), connected(guest)]);
    await guest.getByRole('button', { name: /Local vault/ }).click();
    assert.equal(await guest.locator('.vault-card').count(), 2);
    const [emptyDownload] = await Promise.all([guest.waitForEvent('download'), guest.locator('.vault-card').filter({ hasText: 'empty.txt' }).getByRole('button', { name: 'Download' }).click()]);
    assert.equal((await readFile(await emptyDownload.path())).length, 0);
    console.log('PASS: reconnect and persisted vault after reload');

    const reverse = Buffer.from('A reply from the other device.');
    await guest.getByRole('button', { name: /Overview/ }).click();
    await guest.locator('#file-picker').setInputFiles({ name: 'reply.txt', mimeType: 'text/plain', buffer: reverse });
    await guest.getByRole('button', { name: 'Send 1 selected file', exact: true }).click();
    await Promise.all([completed(host, 3), completed(guest, 3)]);
    console.log('PASS: both peers send and receive');

    await host.locator('#file-picker').setInputFiles({ name: 'cancel-and-retry.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4 * 1024 * 1024, 31) });
    await host.getByRole('button', { name: 'Send 1 selected file', exact: true }).click();
    const cancelled = host.locator('.transfer-card').filter({ hasText: 'cancel-and-retry.bin' }).first();
    await cancelled.getByRole('button', { name: 'Cancel', exact: true }).click();
    await cancelled.locator('.status-cancelled').waitFor();
    await cancelled.getByRole('button', { name: 'Retry', exact: true }).click();
    await Promise.all([completed(host, 4), completed(guest, 4)]);
    console.log('PASS: cancellation and retry');

    const [exported] = await Promise.all([host.waitForEvent('download'), host.getByRole('button', { name: 'Export Session' }).click()]);
    const history = JSON.parse(await readFile(await exported.path(), 'utf8'));
    assert.equal(history.app, 'Mystic'); assert.ok(history.transfers.length >= 4);
    await guest.getByRole('button', { name: 'Clear History' }).click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await guest.getByRole('button', { name: /Local vault/ }).click();
    assert.ok(await guest.locator('.vault-card').count() >= 3);
    await guest.locator('.vault-card').filter({ hasText: 'empty.txt' }).getByRole('button', { name: 'Delete', exact: true }).click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await guest.waitForFunction(() => ![...document.querySelectorAll('.vault-card')].some(node => node.textContent.includes('empty.txt')));
    console.log('PASS: session export, clear history, independent vault deletion');

    await host.locator('.chat-input').fill('All set. Your files are ready.');
    await host.locator('.chat-form').getByRole('button', { name: 'Send', exact: true }).click();
    await host.evaluate(() => { document.activeElement?.blur(); document.querySelector('.toast-container').replaceChildren(); });
    await host.screenshot({ path: 'test-results/mystic-desktop.png', fullPage: true });
    const mobile = await device({ width: 390, height: 844 });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.getByRole('button', { name: /Preferences/ }).click();
    await mobile.getByLabel('Display name', { exact: true }).fill('Mobile Mystic');
    await mobile.getByRole('button', { name: 'Save preferences' }).click();
    await mobile.reload();
    await mobile.getByRole('button', { name: /Preferences/ }).click();
    assert.equal(await mobile.getByLabel('Display name', { exact: true }).inputValue(), 'Mobile Mystic');
    await mobile.getByRole('button', { name: /Overview/ }).click();
    await mobile.screenshot({ path: 'test-results/mystic-mobile.png', fullPage: true });
    console.log('PASS: mobile navigation, preferences persistence and no horizontal overflow');

    assert.deepEqual(pageErrors, [], 'Uncaught browser errors');
    // Expected failed requests: rejected room joins are application messages, not browser errors.
    assert.deepEqual(errors, [], 'Browser console errors');
    console.log('Browser acceptance suite passed. Screenshots: test-results/mystic-{desktop,mobile}.png');
} catch (error) {
    for (let index = 0; index < contexts.length; index++) for (const page of contexts[index].pages()) {
        if (!page.isClosed()) {
            await page.screenshot({ path: `test-results/failure-${index}.png`, fullPage: true }).catch(() => {});
            console.error(`PAGE ${index}:`, (await page.locator('body').innerText()).slice(-3500));
        }
    }
    console.error('Browser errors:', pageErrors, errors);
    throw error;
} finally {
    await browser.close();
    await app.close();
}
