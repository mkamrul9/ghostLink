import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

const publicRoot = fileURLToPath(new URL('./src/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const defaultIceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

export function createApp(options = {}) {
    const rooms = new Map();
    const iceServers = options.iceServers ?? JSON.parse(process.env.ICE_SERVERS || JSON.stringify(defaultIceServers));
    if (!Array.isArray(iceServers)) throw new Error('ICE_SERVERS must be a JSON array.');
    const maxClients = options.maxClients ?? Number(process.env.MAX_CLIENTS || 10000);
    const maxFileSize = options.maxFileSize ?? Number(process.env.MAX_FILE_SIZE || 268435456);
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    const server = http.createServer(async (req, res) => {
        const headers = {
            'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            'Cache-Control': 'no-cache'
        };
        if (req.headers['x-forwarded-proto'] === 'https') headers['Strict-Transport-Security'] = 'max-age=31536000';
        const respond = (status, body, type = 'application/json') => {
            res.writeHead(status, { ...headers, 'Content-Type': `${type}; charset=utf-8` });
            res.end(req.method === 'HEAD' ? undefined : body);
        };
        if (!['GET', 'HEAD'].includes(req.method)) return respond(405, '{"error":"Method not allowed"}');
        try {
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname === '/healthz') return respond(200, JSON.stringify({ status: 'ok', connections: wss.clients.size, rooms: rooms.size }));
            if (url.pathname === '/api/config') {
                headers['Cache-Control'] = 'no-store';
                return respond(200, JSON.stringify({ iceServers, maxFileSize }));
            }
            let requested = decodeURIComponent(url.pathname);
            if (requested.startsWith('/src/')) requested = requested.slice(4);
            if (requested === '/') requested = '/index.html';
            if (requested.includes('\\') || requested.includes('\0') || requested.split('/').some(part => part.startsWith('.'))) return respond(404, '{"error":"Not found"}');
            const target = path.resolve(publicRoot, `.${requested}`);
            const type = types[path.extname(target)];
            if (!target.startsWith(publicRoot) || !type) return respond(404, '{"error":"Not found"}');
            respond(200, await readFile(target), type);
        } catch (error) {
            respond(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400, '{"error":"Invalid or missing resource"}');
        }
    });
    const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
    const send = (ws, data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > 262144) return ws.close(1013, 'Slow connection');
        ws.send(JSON.stringify(data));
    };
    const leave = ws => {
        if (!ws.roomId) return;
        const members = rooms.get(ws.roomId);
        members?.delete(ws);
        members?.forEach(peer => send(peer, { type: 'PEER_LEFT' }));
        if (!members?.size) rooms.delete(ws.roomId);
        ws.roomId = null;
    };
    server.on('upgrade', (req, socket, head) => {
        const origin = req.headers.origin;
        let permitted = !origin;
        try { permitted ||= new URL(origin).host === req.headers.host || allowedOrigins.includes(origin); } catch { /* invalid origin */ }
        if (req.url !== '/signal' || !permitted || wss.clients.size >= maxClients) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
        }
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
    });
    wss.on('connection', ws => {
        ws.alive = true;
        ws.tokens = 120;
        ws.refilledAt = Date.now();
        const joinTimer = setTimeout(() => { if (!ws.roomId) ws.close(1008, 'Join a room first'); }, 15000);
        joinTimer.unref();
        ws.on('pong', () => { ws.alive = true; });
        ws.on('error', () => {});
        ws.on('message', (raw, binary) => {
            ws.tokens = Math.min(120, ws.tokens + (Date.now() - ws.refilledAt) / 100);
            ws.refilledAt = Date.now();
            if (--ws.tokens < 0) return ws.close(1008, 'Rate limit exceeded');
            let data;
            try { if (binary) throw new Error(); data = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'ERROR', message: 'Invalid signaling message.' }); }
            if (!data || typeof data !== 'object') return;
            if (data.type === 'JOIN') {
                if (typeof data.roomId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(data.roomId)) return send(ws, { type: 'ERROR', message: 'Use a room code with 8-64 letters, numbers, dashes or underscores.' });
                if (ws.roomId === data.roomId) return;
                const members = rooms.get(data.roomId) || new Set();
                if (members.size >= 2) return send(ws, { type: 'ERROR', message: 'This room already has two peers.' });
                leave(ws);
                ws.roomId = data.roomId;
                const initiator = members.size === 0;
                members.add(ws);
                rooms.set(data.roomId, members);
                clearTimeout(joinTimer);
                send(ws, { type: 'JOINED', initiator, peers: members.size - 1 });
                members.forEach(peer => { if (peer !== ws) send(peer, { type: 'PEER_JOINED' }); });
                return;
            }
            // File contents, names and encryption keys are never accepted by the relay.
            if (!ws.roomId || !['OFFER', 'ANSWER', 'ICE_CANDIDATE'].includes(data.type)) return;
            const relay = data.type === 'ICE_CANDIDATE'
                ? { type: data.type, candidate: data.candidate }
                : { type: data.type, sdp: data.sdp };
            if (data.type !== 'ICE_CANDIDATE' && (typeof data.sdp?.sdp !== 'string' || data.sdp.type !== data.type.toLowerCase())) return;
            rooms.get(ws.roomId)?.forEach(peer => { if (peer !== ws) send(peer, relay); });
        });
        ws.on('close', () => { clearTimeout(joinTimer); leave(ws); });
    });
    const heartbeat = setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.alive) return ws.terminate();
            ws.alive = false;
            ws.ping();
        });
    }, 30000);
    heartbeat.unref();
    return {
        server, wss, rooms,
        async close() {
            clearInterval(heartbeat);
            wss.clients.forEach(ws => ws.terminate());
            await new Promise(resolve => wss.close(resolve));
            await new Promise(resolve => server.close(resolve));
        }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const app = createApp();
    app.server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0', () => console.log(`Mystic listening on port ${app.server.address().port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
        const deadline = setTimeout(() => process.exit(1), 10000).unref();
        app.close().then(() => { clearTimeout(deadline); process.exit(0); });
    });
}
