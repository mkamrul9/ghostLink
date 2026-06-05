import Store from './store/Store.js';
import DropZone from './components/ui/DropZone.js';
import DashboardShell from './components/ui/DashboardShell.js';
import FileTree from './components/ui/FileTree.js';
import TransferQueue from './components/ui/TransferQueue.js';
import ChatPanel from './components/ui/ChatPanel.js';
import SessionStatus from './components/ui/SessionStatus.js';
import SessionControls from './components/ui/SessionControls.js';
import SessionSummary from './components/ui/SessionSummary.js';
import ConnectionList from './components/ui/ConnectionList.js';
import { createChunkGenerator } from './helpers/FileChunker.js';
import WorkerManager from './worker/WorkerManager.js';
import DBManager from './DB/DBManager.js';
import HistoryDB from './DB/HistoryDB.js';
import { generateEncryptionKey, encryptChunk, importKeyFromRaw } from './utils/CryptoVault.js';
import { packEncryptedChunk } from './utils/BinaryPacker.js';
import FileReceiver from './utils/FileReceiver.js';
import FileStreamer from './utils/FileStreamer.js';
import SignalingChannel from './utils/SignalingChannel.js';
import WebRTCConnection from './utils/WebRTCConnection.js';
import SpeedGraph from './components/ui/SpeedGraph.js';

const globalStore = new Store({
    initialState: {
        files: [],
        transfers: [],
        chat: [],
        ui: {
            view: 'dashboard',
            connectionStatus: 'idle'
        },
        session: {
            roomId: 'ghostlink-room-42',
            role: 'receiver',
            peers: 0
        }
    }
});

const historyDb = new HistoryDB();

const addTransfer = async (transfer) => {
    const current = globalStore.state.transfers || [];
    globalStore.state.transfers = [...current, transfer];
    try { await historyDb.saveTransfer(transfer); } catch (e) { console.error(e); }
};

const updateTransfer = async (id, patch) => {
    const current = globalStore.state.transfers || [];
    let updatedItem = null;
    const next = current.map((item) => {
        if (item.id === id) {
            updatedItem = { ...item, ...patch };
            return updatedItem;
        }
        return item;
    });
    globalStore.state.transfers = next;
    if (updatedItem) {
        try { await historyDb.saveTransfer(updatedItem); } catch (e) { console.error(e); }
    }
};

const addChatMessage = async (message) => {
    const current = globalStore.state.chat || [];
    globalStore.state.chat = [...current, message];
    try { await historyDb.saveChat(message); } catch (e) { console.error(e); }
};

const savePeer = async (peer) => {
    const current = globalStore.state.peers || [];
    const index = current.findIndex(p => p.roomId === peer.roomId);
    let next = [...current];
    if (index >= 0) {
        next[index] = { ...next[index], ...peer };
    } else {
        next.push(peer);
    }
    globalStore.state.peers = next;
    try { await historyDb.savePeer(peer); } catch (e) { console.error(e); }
};

let activeWebRTC = null;
let activeSignal = null;

window.sendFiles = async (files) => {
    if (!files || files.length === 0) {
        console.warn('No files to send.');
        return;
    }

    if (!activeWebRTC || !activeWebRTC.dataChannel || activeWebRTC.dataChannel.readyState !== 'open') {
        console.warn('Data channel not open yet. Connect to a peer first.');
        return;
    }

    for (const file of files) {
        const fileId = Date.now() + Math.floor(Math.random() * 1000); // Simple unique ID
        const mimeType = file.type || 'application/octet-stream';
        const totalChunks = Math.ceil(file.size / (64 * 1024));

        addTransfer({
            id: fileId,
            name: file.name,
            size: file.size,
            progress: 0,
            speed: 0,
            status: 'sending',
            direction: 'send',
            totalChunks,
            startedAt: Date.now()
        });

        // 1. Generate a fresh AES-256-GCM key for this file
        const cryptoKey = await generateEncryptionKey();

        // 2. Export the raw key bytes so we can send them to the receiver via signaling
        const rawKey = await crypto.subtle.exportKey('raw', cryptoKey);

        // 3. Send file metadata + raw key to the receiver via signaling BEFORE streaming
        if (activeSignal) {
            activeSignal.send({
                type: 'FILE_META',
                fileId,
                fileName: file.name,
                mimeType,
                totalChunks,
                fileSize: file.size,
                rawKey: Array.from(new Uint8Array(rawKey))
            });
            console.log(`Sent FILE_META for "${file.name}" (${totalChunks} chunks)`);
        }

        // 5. Give the receiver a short moment to register the FileReceiver
        await new Promise(r => setTimeout(r, 300));

        // 6. Build an async generator that reads, encrypts and packs each chunk
        async function* encryptedPacketGenerator() {
            const chunkGen = createChunkGenerator(file);
            let chunkIndex = 0;
            let bytesSinceTick = 0;
            let lastTick = typeof performance !== 'undefined' ? performance.now() : Date.now();
            for await (const { buffer } of chunkGen) {
                const { iv, encryptedBuffer } = await encryptChunk(cryptoKey, buffer);
                const packet = packEncryptedChunk(fileId, chunkIndex, iv, encryptedBuffer);
                chunkIndex++;
                bytesSinceTick += buffer.byteLength;
                const progress = Math.round((chunkIndex / totalChunks) * 100);
                updateTransfer(fileId, { progress, status: 'sending' });

                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (now - lastTick >= 1000) {
                    const speed = Math.round((bytesSinceTick * 1000) / (now - lastTick));
                    updateTransfer(fileId, { speed });
                    bytesSinceTick = 0;
                    lastTick = now;
                }
                yield packet;
            }
        }

        // 7. Stream all encrypted packets over the data channel
        console.log(`Streaming "${file.name}"...`);
        const streamer = new FileStreamer(activeWebRTC.dataChannel);
        await streamer.stream(encryptedPacketGenerator());
        console.log(`Done streaming "${file.name}"`);
        updateTransfer(fileId, {
            progress: 100,
            status: 'complete',
            speed: 0,
            completedAt: Date.now()
        });
    }
};

const sendChat = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (!activeWebRTC || !activeWebRTC.dataChannel || activeWebRTC.dataChannel.readyState !== 'open') {
        return; // UI now handles the disabled state, no need for system message here
    }

    const message = {
        id: Date.now(),
        text: trimmed,
        ts: Date.now(),
        author: 'You'
    };
    addChatMessage({ ...message, origin: 'self' });
    try {
        activeWebRTC.sendChat(message);
    } catch (e) {
        console.error('Failed to send message', e);
    }
};
// Mount the dashboard shell and UI widgets
const appRoot = document.getElementById('app');
const shell = new DashboardShell();
shell.mount(appRoot);

const dropZoneMount = document.getElementById('drop-zone-slot');
const fileTreeMount = document.getElementById('file-tree-slot');
const speedGraphMount = document.getElementById('speed-graph-slot');
const queueMount = document.getElementById('queue-slot');
const chatMount = document.getElementById('chat-slot');

const dropZone = new DropZone({ store: globalStore });
dropZone.mount(dropZoneMount);

const fileTree = new FileTree({ store: globalStore });
fileTree.mount(fileTreeMount);

const transferQueue = new TransferQueue({ store: globalStore });
transferQueue.mount(queueMount);

const chatPanel = new ChatPanel({
    store: globalStore,
    onSend: (text) => sendChat(text)
});
chatPanel.mount(chatMount);

const sessionControlsMount = document.getElementById('session-controls-slot');
const connectionsMount = document.getElementById('connections-slot');

const sessionControls = new SessionControls({
    store: globalStore,
    onCreate: () => {
        const newRoom = 'room-' + Math.random().toString(36).substr(2, 8);
        const url = new URL(window.location.href);
        url.searchParams.set('init', 'true');
        url.searchParams.set('room', newRoom);
        history.replaceState(null, '', url.toString());
        initP2P(newRoom, true);
        return newRoom;
    },
    onJoin: (room) => {
        const url = new URL(window.location.href);
        url.searchParams.set('room', room);
        url.searchParams.delete('init');
        history.replaceState(null, '', url.toString());
        initP2P(room, false);
    },
    onCopy: (room) => {
        const url = new URL(window.location.href);
        url.searchParams.set('room', room);
        url.searchParams.delete('init');
        navigator.clipboard.writeText(url.toString()).then(() => alert('Invite link copied!'));
    }
});
if (sessionControlsMount) sessionControls.mount(sessionControlsMount);

const connectionList = new ConnectionList({
    store: globalStore,
    onReconnect: (room) => {
        const url = new URL(window.location.href);
        url.searchParams.set('room', room);
        url.searchParams.delete('init');
        history.replaceState(null, '', url.toString());
        initP2P(room, false);
    }
});
if (connectionsMount) connectionList.mount(connectionsMount);

const sessionStatusMount = document.getElementById('session-status-slot');
const sessionSummaryMount = document.getElementById('session-summary-slot');

const sessionStatus = new SessionStatus({ store: globalStore });
if (sessionStatusMount) sessionStatus.mount(sessionStatusMount);

const sessionSummary = new SessionSummary({
    store: globalStore,
    onExport: () => {
        const data = {
            chat: globalStore.state.chat,
            transfers: globalStore.state.transfers,
            peers: globalStore.state.peers
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ghostlink-session-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },
    onClear: async () => {
        if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
            // Re-initialize DB to clear it (lazy way is to just delete and recreate, but we can also just clear object stores)
            const db = historyDb.db;
            if (db) {
                const tx = db.transaction(['chat', 'transfers', 'peers'], 'readwrite');
                tx.objectStore('chat').clear();
                tx.objectStore('transfers').clear();
                tx.objectStore('peers').clear();
                tx.oncomplete = () => {
                    globalStore.state.chat = [];
                    globalStore.state.transfers = [];
                    globalStore.state.peers = [];
                    alert('History cleared.');
                };
            }
        }
    }
});
if (sessionSummaryMount) sessionSummary.mount(sessionSummaryMount);

// Mount the throughput graph and expose it globally for reporting
const speedGraph = new SpeedGraph({ store: globalStore });
speedGraph.mount(speedGraphMount);
window.speedGraph = speedGraph;

// Debug helpers: expose store and log mount status so you can diagnose in DevTools
window.globalStore = globalStore;
console.log('App mounted: dashboard shell, drop zone, file tree, and speed graph.');

// Worker manager for off-main-thread chunk processing
const workerBoss = new WorkerManager();
window.workerBoss = workerBoss;
// Example usage (uncomment to run):
// workerBoss.processFile(someFile, (progress) => {
//   console.log(`Processing: ${progress}%`);
//   globalStore.state.progress = progress;
// });

// a dummy function to simulate processing a file
async function processFile(file) {
    console.log(`Starting to read: ${file.name}`);

    // Initialize the generator
    const chunkStream = createChunkGenerator(file);

    let chunkCount = 0;

    // The 'for await...of' loop is specifically designed to consume async generators
    for await (const chunk of chunkStream) {
        chunkCount++;
        console.log(`Read chunk ${chunkCount} at offset ${chunk.offset}. Size: ${chunk.buffer.byteLength} bytes`);

        // If this was a 10GB file, we are only holding 64KB in RAM right now!

        if (chunk.isDone) {
            console.log(`Finished reading ${file.name} in ${chunkCount} chunks.`);
        }
    }
}

// trigger this manually in the browser console for testing, 
// or hook it up to a button in your DropZone component!
window.testChunker = processFile;

// Initialize the database and store an example file metadata + CryptoKey
const dbManager = new DBManager();

async function startup() {
    try {
        await dbManager.init();
        await historyDb.init();

        const oldChat = await historyDb.loadChat(50);
        const oldTransfers = await historyDb.loadTransfers(50);
        const oldPeers = await historyDb.loadPeers();

        globalStore.state.chat = oldChat;
        globalStore.state.transfers = oldTransfers;
        globalStore.state.peers = oldPeers;

        // Auto-join from URL if room is provided
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl) {
            globalStore.state.session = { ...globalStore.state.session, roomId: roomFromUrl };
            initP2P(roomFromUrl, params.has('init'));
        }

        console.log('App Startup Complete. History loaded.');
    } catch (err) {
        console.error('App startup failed', err);
    }
}

startup();

// P2P initialization using Signaling + WebRTC
async function initP2P(roomId, isInitiator) {
    if (activeWebRTC) {
        console.warn('Closing existing connection...');
        // Should ideally cleanly close old WebRTC if it exists
    }

    globalStore.state.session = {
        ...globalStore.state.session,
        roomId,
        role: isInitiator ? 'sender' : 'receiver'
    };

    const signalUrl = globalStore.state.ui?.signalUrl || 'ws://localhost:8080';
    const signal = new SignalingChannel(signalUrl);
    activeSignal = signal;
    await signal.connect(roomId);

    const webrtc = new WebRTCConnection(signal, isInitiator);
    activeWebRTC = webrtc;
    window.webrtc = webrtc;
    window.ghostlinkRtc = webrtc;

    savePeer({
        id: roomId,
        roomId: roomId,
        label: isInitiator ? 'Sender Peer' : 'Receiver Peer',
        status: 'online',
        lastSeen: Date.now()
    });

    webrtc.onChatMessage = (msg) => {
        addChatMessage({
            id: msg.id || Date.now(),
            text: msg.text || '',
            ts: msg.ts || Date.now(),
            author: msg.author || 'Peer',
            origin: 'peer'
        });
    };

    // Route incoming signaling messages to WebRTC + file metadata
    signal.onMessage(async (msg) => {
        switch (msg.type) {
            case 'OFFER':
                if (!isInitiator) webrtc.handleOffer(msg.sdp);
                break;
            case 'ANSWER':
                if (isInitiator) webrtc.handleAnswer(msg.sdp);
                break;
            case 'ICE_CANDIDATE':
                webrtc.handleIceCandidate(msg.candidate);
                break;

            // Receiver gets file metadata + raw key from sender via signaling
            case 'FILE_META':
                console.log('[FILE_META] received, isInitiator:', isInitiator, msg.fileName);
                addTransfer({
                    id: msg.fileId,
                    name: msg.fileName,
                    size: msg.fileSize || null,
                    progress: 0,
                    speed: 0,
                    status: 'receiving',
                    direction: 'receive',
                    totalChunks: msg.totalChunks,
                    startedAt: Date.now()
                });
                // The server never echoes back to the sender, so receiving FILE_META
                // always means this tab is the receiver — no isInitiator guard needed.
                try {
                    const rawKey = new Uint8Array(msg.rawKey);
                    const cryptoKey = await importKeyFromRaw(rawKey);
                    webrtc.fileReceiver = new FileReceiver(
                        cryptoKey,
                        msg.totalChunks,
                        msg.fileName,
                        msg.mimeType || 'application/octet-stream',
                        {
                            onProgress: (progress, stats) => {
                                updateTransfer(msg.fileId, {
                                    progress,
                                    status: 'receiving',
                                    speed: stats.speed || 0,
                                    receivedChunks: stats.receivedChunks
                                });
                            },
                            onComplete: () => {
                                updateTransfer(msg.fileId, {
                                    progress: 100,
                                    status: 'complete',
                                    speed: 0,
                                    completedAt: Date.now()
                                });
                            }
                        }
                    );
                    window.webrtc = webrtc;
                    console.log(`✅ FileReceiver ready for "${msg.fileName}" (${msg.totalChunks} chunks)`);
                } catch (e) {
                    console.error('Failed to set up FileReceiver from FILE_META', e);
                }
                break;
        }
    });

    if (isInitiator) {
        setTimeout(() => webrtc.createOffer(), 2000);
    }
}