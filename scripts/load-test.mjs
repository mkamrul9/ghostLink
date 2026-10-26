import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp } from '../server.js';
const count = Number(process.env.LOAD_CLIENTS || 1000);
if (!Number.isInteger(count) || count < 2 || count > 10000 || count % 2) throw new Error('LOAD_CLIENTS must be an even number from 2 to 10000.');
const app = createApp({ maxClients: count + 2 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const url = `ws://127.0.0.1:${app.server.address().port}/signal`;
const clients = [];
const latencies = [];
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const started = performance.now();
function next(ws, type) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${type}`)); }, 15000);
        const handler = raw => { const message = JSON.parse(raw); if (message.type === type) { cleanup(); resolve(message); } };
        const cleanup = () => { clearTimeout(timer); ws.off('message', handler); };
        ws.on('message', handler);
    });
}
try {
    for (let offset = 0; offset < count; offset += 100) {
        await Promise.all(Array.from({ length: Math.min(100, count - offset) }, async (_, i) => {
            const index = offset + i;
            const ws = new WebSocket(url);
            clients[index] = ws;
            await once(ws, 'open');
            const joined = next(ws, 'JOINED');
            ws.send(JSON.stringify({ type: 'JOIN', roomId: `load-room-${Math.floor(index / 2)}` }));
            await joined;
        }));
    }
    await Promise.all(Array.from({ length: count / 2 }, async (_, i) => {
        const sender = clients[i * 2];
        const receiver = clients[i * 2 + 1];
        const start = performance.now();
        const received = next(receiver, 'OFFER');
        sender.send(JSON.stringify({ type: 'OFFER', sdp: { type: 'offer', sdp: 'load-test' } }));
        await received;
        latencies.push(performance.now() - start);
    }));
    latencies.sort((a, b) => a - b);
    console.log(JSON.stringify({ clients: clients.length, rooms: app.rooms.size, delivered: latencies.length, setupAndRelayMs: Math.round(performance.now() - started), relayP95Ms: Math.round(latencies[Math.floor(latencies.length * .95)]), serverAndClientsRssMB: Math.round(process.memoryUsage().rss / 1024 / 1024), eventLoopP99Ms: Math.round(eventLoop.percentile(99) / 1e6), scope: 'Local signaling only; not an internet WebRTC, TURN or hosting capacity test.' }, null, 2));
} finally {
    clients.forEach(ws => ws.terminate());
    eventLoop.disable();
    await app.close();
}
