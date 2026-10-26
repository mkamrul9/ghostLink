import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp } from '../server.js';
async function fixture(t, options) {
    const app = createApp(options);
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    return { ...app, url: `http://127.0.0.1:${app.server.address().port}`, wsUrl: `ws://127.0.0.1:${app.server.address().port}/signal` };
}
function message(ws, type) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { ws.off('message', handler); reject(new Error(`Missing ${type}`)); }, 3000);
        const handler = raw => { const data = JSON.parse(raw); if (data.type === type) { clearTimeout(timer); ws.off('message', handler); resolve(data); } };
        ws.on('message', handler);
    });
}
async function client(url) { const ws = new WebSocket(url); await once(ws, 'open'); return ws; }
async function join(ws, roomId) { const response = message(ws, 'JOINED'); ws.send(JSON.stringify({ type: 'JOIN', roomId })); return response; }
test('serves the app, assets, config and health with security headers', async t => {
    const app = await fixture(t);
    const root = await fetch(app.url);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Mystic/);
    assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
    assert.match(root.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const resource of ['/assets/mystic-mark.svg', '/index.js', '/styles.css', '/manifest.webmanifest', '/src/index.html']) assert.equal((await fetch(app.url + resource)).status, 200, resource);
    assert.equal((await (await fetch(app.url + '/api/config')).json()).maxFileSize, 268435456);
    assert.equal((await (await fetch(app.url + '/healthz')).json()).status, 'ok');
    for (const resource of ['/.env', '/.git/config', '/server.js', '/%2e%2e%5cpackage.json', '/missing.js']) assert.equal((await fetch(app.url + resource)).status, 404, resource);
    assert.equal((await fetch(app.url, { method: 'POST' })).status, 405);
});
test('assigns roles, limits rooms to two, isolates rooms and cleans up membership', async t => {
    const app = await fixture(t);
    const a = await client(app.wsUrl), b = await client(app.wsUrl), c = await client(app.wsUrl);
    assert.equal((await join(a, 'private-room-one')).initiator, true);
    const peer = message(a, 'PEER_JOINED');
    assert.equal((await join(b, 'private-room-one')).initiator, false);
    await peer;
    const full = message(c, 'ERROR'); c.send(JSON.stringify({ type: 'JOIN', roomId: 'private-room-one' }));
    assert.match((await full).message, /two peers/);
    await join(c, 'private-room-two');
    const offer = message(b, 'OFFER');
    a.send(JSON.stringify({ type: 'OFFER', sdp: { type: 'offer', sdp: 'example' }, secret: 'strip-this' }));
    assert.deepEqual(await offer, { type: 'OFFER', sdp: { type: 'offer', sdp: 'example' } });
    const left = message(a, 'PEER_LEFT'); await join(b, 'private-room-two'); await left;
    assert.equal(app.rooms.get('private-room-one').size, 1);
    const oldLeft = message(c, 'PEER_LEFT'); b.close(); await oldLeft;
    assert.equal(app.rooms.get('private-room-two').size, 1);
});
test('malformed JSON cannot crash the server and file keys never relay', async t => {
    const app = await fixture(t);
    const a = await client(app.wsUrl), b = await client(app.wsUrl);
    const invalid = message(a, 'ERROR'); a.send('{'); await invalid;
    const badRoom = message(a, 'ERROR'); a.send(JSON.stringify({ type: 'JOIN', roomId: '<bad>' })); await badRoom;
    await join(a, 'test-room-secure'); await join(b, 'test-room-secure');
    const received = []; b.on('message', data => received.push(JSON.parse(data)));
    a.send(JSON.stringify({ type: 'FILE_META', rawKey: [1, 2, 3], fileName: 'secret' }));
    const barrier = message(b, 'ICE_CANDIDATE'); a.send(JSON.stringify({ type: 'ICE_CANDIDATE', candidate: null })); await barrier;
    assert.equal(received.some(data => data.type === 'FILE_META'), false);
    assert.equal((await fetch(app.url + '/healthz')).status, 200);
});
test('rejects cross-origin sockets and caps global connections', async t => {
    const app = await fixture(t, { maxClients: 1 });
    const rejected = new WebSocket(app.wsUrl, { origin: 'https://attacker.example' });
    const [error] = await once(rejected, 'error'); assert.match(error.message, /403/);
    await client(app.wsUrl);
    const overflow = new WebSocket(app.wsUrl); const [limit] = await once(overflow, 'error'); assert.match(limit.message, /403/);
});
test('rate limits signaling floods', async t => {
    const app = await fixture(t);
    const ws = await client(app.wsUrl);
    const closed = once(ws, 'close');
    for (let i = 0; i < 130; i++) ws.send('{}');
    const [code] = await closed;
    assert.equal(code, 1008);
});
