import Store from './store/Store.js';
import DropZone from './components/ui/DropZone.js';
import DashboardShell from './components/ui/DashboardShell.js';
import FileTree from './components/ui/FileTree.js';
import TransferQueue from './components/ui/TransferQueue.js';
import { createChunkGenerator } from './helpers/FileChunker.js';
import WorkerManager from './worker/WorkerManager.js';
import DBManager from './DB/DBManager.js';
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

const addTransfer = (transfer) => {
    const current = globalStore.state.transfers || [];
    globalStore.state.transfers = [...current, transfer];
};

const updateTransfer = (id, patch) => {
    const current = globalStore.state.transfers || [];
    const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
    globalStore.state.transfers = next;
};
// Mount the dashboard shell and UI widgets
const appRoot = document.getElementById('app');
const shell = new DashboardShell();
shell.mount(appRoot);

const dropZoneMount = document.getElementById('drop-zone-slot');
const fileTreeMount = document.getElementById('file-tree-slot');
const speedGraphMount = document.getElementById('speed-graph-slot');
const queueMount = document.getElementById('queue-slot');

const dropZone = new DropZone({ store: globalStore });
dropZone.mount(dropZoneMount);

const fileTree = new FileTree({ store: globalStore });
fileTree.mount(fileTreeMount);

const transferQueue = new TransferQueue({ store: globalStore });
transferQueue.mount(queueMount);

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

        // Example of saving metadata when a new file is dropped
        const fileId = 101;
        const key = await generateEncryptionKey();

        await dbManager.saveMetadata(fileId, 'massive_video.mp4', 1500, key);
        console.log('Metadata and CryptoKey safely stored in IndexedDB.');
    } catch (err) {
        console.error('DB startup failed', err);
    }
}

startup();

// P2P initialization using Signaling + WebRTC
async function initP2P() {
    const signal = new SignalingChannel('ws://localhost:8080');
    await signal.connect('ghostlink-room-42');

    const isInitiator = window.location.search.includes('init=true');
    const webrtc = new WebRTCConnection(signal, isInitiator);
    window.webrtc = webrtc;

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

    // --- SENDER: called after data channel is open and a file is ready ---
    window.sendFiles = async (files) => {
        if (!files || files.length === 0) {
            console.warn('No files to send.');
            return;
        }

        if (!webrtc.dataChannel || webrtc.dataChannel.readyState !== 'open') {
            console.warn('Data channel not open yet. Wait for "🟢 RTCDataChannel OPEN!" before sending.');
            return;
        }

        for (const file of files) {
            const fileId = Date.now(); // Simple unique ID
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
            signal.send({
                type: 'FILE_META',
                fileId,
                fileName: file.name,
                mimeType,
                totalChunks,
                fileSize: file.size,
                rawKey: Array.from(new Uint8Array(rawKey))
            });
            console.log(`Sent FILE_META for "${file.name}" (${totalChunks} chunks)`);

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
            const streamer = new FileStreamer(webrtc.dataChannel);
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
}

initP2P(); // Auto-start P2P (open two tabs; one with ?init=true)