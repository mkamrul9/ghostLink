import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
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
    for (const resource of ['/assets/mystic-mark.svg', '/index.js', '/styles.css', '/manifest.webmanifest', '/src/index.html', '/help', '/received', '/settings', '/transfers']) assert.equal((await fetch(app.url + resource)).status, 200, resource);
    assert.equal((await (await fetch(app.url + '/api/config')).json()).maxFileSize, Number.MAX_SAFE_INTEGER);
    assert.equal((await (await fetch(app.url + '/healthz')).json()).status, 'ok');
    for (const resource of ['/.env', '/.git/config', '/server.js', '/%2e%2e%5cpackage.json', '/missing.js']) assert.equal((await fetch(app.url + resource)).status, 404, resource);
    assert.equal((await fetch(app.url, { method: 'POST' })).status, 405);
});
test('assigns roles, honors a two-device cap, isolates rooms and cleans up membership', async t => {
    const app = await fixture(t, {maxRoomPeers:2});
    const a = await client(app.wsUrl), b = await client(app.wsUrl), c = await client(app.wsUrl);
    const host = await join(a, 'private-room-one'); assert.equal(host.initiator, true);
    const peer = message(a, 'PEER_JOINED');
    assert.equal((await join(b, 'private-room-one')).initiator, false);
    await peer;
    const full = message(c, 'ERROR'); c.send(JSON.stringify({ type: 'JOIN', roomId: 'private-room-one' }));
    assert.match((await full).message, /two devices/);
    await join(c, 'private-room-two');
    const offer = message(b, 'OFFER');
    a.send(JSON.stringify({ type: 'OFFER', sdp: { type: 'offer', sdp: 'example' }, secret: 'strip-this' }));
    assert.deepEqual(await offer, { type: 'OFFER', sdp: { type: 'offer', sdp: 'example' }, from: host.peerId });
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

test('group signaling targets only the chosen room member and strips spoofed sender identities', async t => {
    const app = await fixture(t, {maxRoomPeers:3}), a=await client(app.wsUrl), b=await client(app.wsUrl), c=await client(app.wsUrl), outsider=await client(app.wsUrl);
    const aa=await join(a,'group-room-one'), bb=await join(b,'group-room-one'), cc=await join(c,'group-room-one'), dd=await join(outsider,'separate-room');
    assert.deepEqual(cc.members.map(peer=>peer.id).sort(),[aa.peerId,bb.peerId].sort());
    const received=[]; c.on('message',raw=>received.push(JSON.parse(raw)));
    const offer=message(b,'OFFER');a.send(JSON.stringify({type:'OFFER',to:bb.peerId,from:cc.peerId,sdp:{type:'offer',sdp:'target-only'},rawKey:[1,2]}));
    assert.deepEqual(await offer,{type:'OFFER',sdp:{type:'offer',sdp:'target-only'},from:aa.peerId});
    a.send(JSON.stringify({type:'OFFER',to:dd.peerId,sdp:{type:'offer',sdp:'outside'}}));
    a.send(JSON.stringify({type:'OFFER',sdp:{type:'offer',sdp:'ambiguous-broadcast'}}));
    const barrier=message(c,'ICE_CANDIDATE');a.send(JSON.stringify({type:'ICE_CANDIDATE',to:cc.peerId,candidate:null}));await barrier;
    assert.equal(received.some(item=>item.type==='OFFER'),false);
    const full=message(outsider,'ERROR');outsider.send(JSON.stringify({type:'JOIN',roomId:'group-room-one'}));assert.match((await full).message,/full/);
    const left=message(a,'PEER_LEFT');c.close();assert.equal((await left).peerId,cc.peerId);
});


test('optional TURN credentials are time limited and never expose the relay shared secret', async t => {
 const secret='test-relay-secret-'.repeat(3), app=await fixture(t,{iceServers:[],turn:{urls:['turn:relay.example:3478','turns:relay.example:5349'],secret,ttl:600}});
 const response=await fetch(app.url+'/api/config'), config=await response.json(), relay=config.iceServers[0];
 assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(config.iceExpiresAt> Date.now()/1000+590 && config.iceExpiresAt<Date.now()/1000+610);
 assert.equal(relay.credential,createHmac('sha1',secret).update(relay.username).digest('base64'));assert.equal(JSON.stringify(config).includes(secret),false);
 const next=await (await fetch(app.url+'/api/config')).json();assert.notEqual(next.iceServers[0].username,relay.username);
 assert.throws(()=>createApp({turn:{urls:['https://invalid'],secret,ttl:600}}),/TURN_URLS/);
});
