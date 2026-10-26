import { browserOptions } from './browser-runtime.js';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server.js';
const app = createApp({ iceServers: [] });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch(await browserOptions());
await mkdir('test-results/mobile', { recursive: true });
const errors = [];
async function noOverflow(page) {
    const widths = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(widths.content <= widths.viewport + 1, `Horizontal clipping: ${JSON.stringify(widths)}`);
    const clipped = await page.locator('.panel, .file-list, .folder-children').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 1).map(node => ({ className: node.className, width: node.clientWidth, content: node.scrollWidth })));
    assert.deepEqual(clipped, [], 'Content overflows inside a panel');
}
async function inside(page, locator) {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `Outside viewport: ${JSON.stringify({ box, viewport })}`);
}
try {
    for (const [width, height] of [[320,568], [360,640], [390,844], [430,932], [768,1024], [844,390]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true, reducedMotion: 'reduce' });
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.waitForFunction(() => !document.querySelector('[data-action="create"]').disabled);
        await noOverflow(page);
        const pet = page.getByRole('button', { name: 'Ask Pip', exact: true });
        await inside(page, pet);
        const nav = page.locator('.nav-list');
        const buttons = await nav.locator('button').all();
        for (let index = 0; index < buttons.length - 1; index++) {
            const a = await buttons[index].boundingBox(), b = await buttons[index + 1].boundingBox();
            assert.ok(a.x + a.width <= b.x + 1 || a.y + a.height <= b.y + 1, 'Navigation buttons overlap');
        }
        await page.getByRole('button', { name: 'Create a room', exact: true }).tap();
        await page.locator('.status-waiting').waitFor();
        const roomFits = await page.getByLabel('Your room code', { exact: true }).evaluate(input => {
            const style = getComputedStyle(input), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
            ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            return ctx.measureText(input.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) <= input.clientWidth + 1;
        });
        assert.ok(roomFits, 'Room code is visually cut off');
        await page.getByRole('button', { name: 'Share room', exact: true }).tap();
        const share = page.getByRole('dialog', { name: 'Share room' });
        await inside(page, share); await noOverflow(page);
        for (const label of ['WhatsApp', 'Telegram', 'Email']) {
            const link = share.getByRole('link', { name: label });
            await link.scrollIntoViewIfNeeded(); await inside(page, link);
        }
        await share.getByRole('button', { name: 'Close sharing' }).tap();
        await page.locator('#file-picker').setInputFiles([
            { name: 'A-long-but-readable-file-name-for-a-small-mobile-screen.pdf', mimeType: 'application/pdf', buffer: Buffer.from('document') },
            { name: 'picture.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('picture') }
        ]);
        await noOverflow(page);
        await page.getByRole('button', { name: 'Move to folder', exact: true }).tap();
        const move = page.getByRole('dialog', { name: 'Move to folder' });
        await inside(page, move);
        await move.getByLabel('Folder name', { exact: true }).fill('Holiday/Nested folder/One more folder');
        await move.getByRole('button', { name: 'Move files', exact: true }).tap();
        await noOverflow(page);
        const send = page.getByRole('button', { name: 'Send 2 selected files', exact: true });
        await send.scrollIntoViewIfNeeded(); await inside(page, send);
        const petBox = await pet.boundingBox(), sendBox = await send.boundingBox();
        assert.ok(!petBox || !sendBox || petBox.y + petBox.height <= sendBox.y || sendBox.y + sendBox.height <= petBox.y || petBox.x + petBox.width <= sendBox.x || sendBox.x + sendBox.width <= petBox.x, 'Pip overlaps Send');
        await pet.scrollIntoViewIfNeeded(); await pet.tap();
        const helper = page.getByRole('dialog', { name: 'Pip helper' });
        await inside(page, helper); await noOverflow(page);
        await page.getByLabel('Ask the helper', { exact: true }).fill('send all files');
        await page.getByRole('button', { name: 'Ask helper', exact: true }).tap();
        assert.equal(await helper.locator('.helper-review li').count(), 2);
        await inside(page, helper.locator('.assistant-form'));
        assert.equal(await pet.locator('.pip-eyes').evaluate(node => getComputedStyle(node).animationName), 'none');
        if (width <= 430) {
            await page.setViewportSize({ width, height: 320 });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await inside(page, helper);
            await inside(page, helper.locator('.assistant-form'));
            await page.getByRole('button', { name: 'Ask helper', exact: true }).focus();
            await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close helper');
            await page.setViewportSize({ width, height });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        await page.getByRole('button', { name: 'Close helper' }).tap();
        assert.equal(await page.locator('.app-body').evaluate(node => node.inert), false);
        await page.getByRole('button', { name: 'Messages', exact: true }).tap();
        const messages = page.getByRole('dialog', { name: 'Messages', exact: true });
        await inside(page, messages); await inside(page, messages.locator('form'));
        await page.getByRole('button', { name: 'Close messages' }).tap();
        await nav.getByRole('button', { name: 'Help', exact: true }).tap();
        await page.locator('[data-tour="send"]').tap();
        const tutorial = page.getByRole('dialog', { name: 'Mystic tutorial' });
        await inside(page, tutorial);
        for (let index = 0; index < 4; index++) await tutorial.getByRole('button', { name: 'Next', exact: true }).tap();
        await tutorial.getByRole('button', { name: 'Done', exact: true }).tap();
        await nav.getByRole('button', { name: 'Send files', exact: true }).tap();
        await noOverflow(page);
        await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); document.activeElement?.blur(); window.scrollTo(0,0); document.querySelector('.toast-container').replaceChildren(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        await page.screenshot({ path: `test-results/mobile/${width}x${height}.png`, fullPage: true });
        await context.close();
        console.log(`PASS: ${width}x${height} layout, room code, share menu, nested files, Pip, messages, keyboard space and tutorial`);
    }
    assert.deepEqual(errors, []);
} finally { await browser.close(); await app.close(); }
