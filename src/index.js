import Store from './store/Store.js';
import DashboardShell from './components/ui/DashboardShell.js';
import DropZone from './components/ui/DropZone.js';
import FileTree from './components/ui/FileTree.js';
import TransferQueue from './components/ui/TransferQueue.js';
import ChatPanel from './components/ui/ChatPanel.js';
import SessionControls from './components/ui/SessionControls.js';
import SessionSummary from './components/ui/SessionSummary.js';
import SessionStatus from './components/ui/SessionStatus.js';
import ConnectionList from './components/ui/ConnectionList.js';
import VaultPanel from './components/ui/VaultPanel.js';
import SettingsPanel from './components/ui/SettingsPanel.js';
import SpeedGraph from './components/ui/SpeedGraph.js';
import ToastNotification from './components/ui/ToastNotification.js';
import DBManager from './DB/DBManager.js';
import HistoryDB from './DB/HistoryDB.js';
import SignalingChannel from './utils/SignalingChannel.js';
import WebRTCConnection from './utils/WebRTCConnection.js';
import TransferManager from './utils/TransferManager.js';
import { loadSettings, validateSignalUrl } from './utils/settings.js';
import { downloadBlob, formatBytes } from './utils/format.js';

const store = new Store({ initialState: {
    files: [], transfers: [], chat: [], peers: [], vault: [],
    ui: { ...loadSettings(), view: 'dashboard', connectionStatus: 'idle', dataChannelStatus: 'closed', booting: true, error: '' },
    session: { roomId: '', role: 'idle', peers: 0 }
} });
const db = new DBManager();
const historyDb = new HistoryDB();
const toast = new ToastNotification();
let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], maxFileSize: 268435456 };
let rtc = null;
let signal = null;
let transfers = null;
let generation = 0;
let handshakeTimer;
let reconnectTimer;
let reconnectAttempt = 0;
let retryFiles = new Map();
let progressTicks = new Map();
let persistenceWarning = false;
const ui = patch => { store.state.ui = { ...store.state.ui, ...patch }; };
const report = error => toast.show(error.message || String(error), 'error');
const save = promise => promise.catch(() => {
    if (!persistenceWarning) { persistenceWarning = true; toast.show('Browser history could not be saved. Your live session still works.', 'warning'); }
});
const refreshVault = async () => {
    try { store.state.vault = (await db.getAllMetadata()).map(({ cryptoKey, ...metadata }) => metadata).sort((a, b) => b.createdAt - a.createdAt); }
    catch { /* startup reports storage availability */ }
};
const addTransfer = (transfer, file) => {
    if (file) retryFiles.set(transfer.id, file);
    store.state.transfers = [...store.state.transfers.slice(-199), transfer];
    save(historyDb.saveTransfer(transfer));
};
const updateTransfer = (id, patch) => {
    const terminal = ['complete', 'failed', 'cancelled', 'interrupted'].includes(patch.status);
    const now = performance.now();
    if (!terminal && now - (progressTicks.get(id) || 0) < 200) return;
    progressTicks.set(id, now);
    let changed;
    store.state.transfers = store.state.transfers.map(item => item.id === id ? (changed = { ...item, ...patch }) : item);
    if (changed && terminal) save(historyDb.saveTransfer(changed));
};
const addChat = message => {
    store.state.chat = [...store.state.chat.slice(-199), message];
    save(historyDb.saveChat(message));
};
function updatePeer(status) {
    const roomId = store.state.session.roomId;
    if (!roomId) return;
    const peer = { id: roomId, roomId, label: 'Private room', status, lastSeen: Date.now() };
    store.state.peers = [peer, ...store.state.peers.filter(item => item.roomId !== roomId)].slice(0, 20);
    save(historyDb.savePeer(peer));
}
function teardown() {
    generation++;
    clearTimeout(handshakeTimer);
    clearTimeout(reconnectTimer);
    transfers?.close();
    rtc?.close();
    signal?.close();
    transfers = rtc = signal = null;
    store.state.session = { ...store.state.session, peers: 0 };
    ui({ dataChannelStatus: 'closed' });
}
function roomFromInput(value) {
    let room = String(value || '').trim();
    if (/^https?:\/\//i.test(room)) {
        const url = new URL(room);
        room = new URLSearchParams(url.hash.slice(1)).get('room') || url.searchParams.get('room') || '';
    }
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(room)) throw new Error('Paste a valid invite link or room code (8-64 characters).');
    return room;
}
function writeRoomUrl(room) {
    const url = new URL(location.href);
    url.searchParams.delete('room'); url.searchParams.delete('init');
    url.hash = room ? new URLSearchParams({ room }).toString() : '';
    history.replaceState(null, '', url);
}
function startHandshakeTimeout(token) {
    clearTimeout(handshakeTimer);
    handshakeTimer = setTimeout(() => {
        if (token !== generation || rtc?.dataChannel?.readyState === 'open') return;
        ui({ connectionStatus: 'failed', error: 'The devices could not connect. Retry, or try a different network.' });
    }, 35000);
}
function setupRtc(initiator, token) {
    const currentSignal = signal;
    const currentRtc = new WebRTCConnection(currentSignal, initiator, config.iceServers);
    rtc = currentRtc;
    const isCurrent = () => token === generation && rtc === currentRtc;
    transfers = new TransferManager(currentRtc, db, {
        maxFileSize: config.maxFileSize,
        onAdd: addTransfer,
        onProgress: updateTransfer,
        onError: error => { if (isCurrent()) report(error); },
        onVaultChange: refreshVault,
        onReceived: async () => { await refreshVault(); toast.show('File received. Download it from Transfers or your vault.', 'success'); }
    });
    currentRtc.onDataChannelOpen = () => {
        if (!isCurrent()) return;
        clearTimeout(handshakeTimer);
        reconnectAttempt = 0;
        ui({ connectionStatus: 'connected', dataChannelStatus: 'open', error: '' });
        store.state.session = { ...store.state.session, peers: 1 };
        updatePeer('online');
        toast.show('Your peer is connected. You can both send files and chat.', 'success');
    };
    currentRtc.onDataChannelClose = () => {
        if (!isCurrent()) return;
        transfers?.close();
        ui({ connectionStatus: 'disconnected', dataChannelStatus: 'closed', error: 'Your peer disconnected. Reconnect to continue.' });
        store.state.session = { ...store.state.session, peers: 0 };
        updatePeer('offline');
    };
    currentRtc.onConnectionStateChange = status => {
        if (!isCurrent()) return;
        if (status === 'failed') {
            transfers?.close();
            ui({ connectionStatus: 'failed', dataChannelStatus: 'closed', error: 'The peer connection failed. Retry, or try another network.' });
            store.state.session = { ...store.state.session, peers: 0 };
            updatePeer('offline');
        }
    };
    currentRtc.onError = error => { if (isCurrent()) report(error); };
    currentRtc.onChatMessage = message => {
        if (!isCurrent()) return;
        addChat({ id: crypto.randomUUID(), text: message.text, author: String(message.author || 'Peer').slice(0, 40), ts: Date.now(), origin: 'peer', roomId: store.state.session.roomId });
    };
    return currentRtc;
}
async function connectRoom(input, automatic = false) {
    try {
        await ready;
        if (!window.isSecureContext || !crypto.subtle || !window.RTCPeerConnection) throw new Error('Use HTTPS and a browser with WebRTC support to transfer files.');
        const room = roomFromInput(input);
        const serverUrl = validateSignalUrl(store.state.ui.signalUrl);
        if (!automatic) reconnectAttempt = 0;
        teardown();
        const token = generation;
        store.state.session = { roomId: room, role: 'idle', peers: 0 };
        writeRoomUrl(room);
        ui({ connectionStatus: 'connecting', dataChannelStatus: 'connecting', error: '' });
        const channel = new SignalingChannel(serverUrl);
        signal = channel;
        let pending = [];
        const handle = async message => {
            if (token !== generation) return;
            if (!rtc) { pending.push(message); return; }
            switch (message.type) {
                case 'PEER_JOINED':
                    // The surviving peer initiates a fresh connection, regardless of its old role.
                    transfers?.close(); rtc.close();
                    setupRtc(true, token);
                    store.state.session = { ...store.state.session, role: 'host', peers: 1 };
                    ui({ connectionStatus: 'connecting', error: '' });
                    startHandshakeTimeout(token);
                    await rtc.createOffer();
                    break;
                case 'OFFER': await rtc.handleOffer(message.sdp); break;
                case 'ANSWER': await rtc.handleAnswer(message.sdp); break;
                case 'ICE_CANDIDATE': await rtc.handleIceCandidate(message.candidate); break;
                case 'PEER_LEFT':
                    transfers?.close(); rtc.close();
                    setupRtc(true, token);
                    store.state.session = { ...store.state.session, role: 'host', peers: 0 };
                    ui({ connectionStatus: 'waiting', dataChannelStatus: 'closed', error: '' });
                    clearTimeout(handshakeTimer);
                    updatePeer('offline');
                    toast.show('Your peer left. Keep this room open to connect again.', 'info');
                    break;
            }
        };
        channel.onMessage(handle);
        channel.onError = error => { if (token === generation) report(error); };
        channel.onClose = () => {
            if (token !== generation) return;
            if (rtc?.dataChannel?.readyState === 'open') {
                toast.show('The connection server disconnected. Your current peer session can continue.', 'warning');
                return;
            }
            ui({ connectionStatus: 'disconnected', error: 'The connection server disconnected. ReconnectingÃ¢â‚¬Â¦' });
            if (reconnectAttempt < 3) reconnectTimer = setTimeout(() => { reconnectAttempt++; connectRoom(room, true); }, Math.min(10000, 1000 * 2 ** reconnectAttempt) + Math.random() * 500);
            else ui({ error: 'Unable to reconnect. Check your network and try again.' });
        };
        const joined = await channel.connect(room);
        if (token !== generation) { channel.close(); return; }
        setupRtc(joined.initiator, token);
        store.state.session = { roomId: room, role: joined.initiator ? 'host' : 'guest', peers: joined.peers };
        ui({ connectionStatus: joined.peers ? 'connecting' : 'waiting', dataChannelStatus: joined.peers ? 'connecting' : 'closed' });
        if (joined.peers) startHandshakeTimeout(token);
        const backlog = pending; pending = [];
        for (const message of backlog) await handle(message);
    } catch (error) {
        ui({ connectionStatus: 'failed', dataChannelStatus: 'closed', error: error.message });
        report(error);
    }
}
async function sendStaged() {
    if (!transfers || rtc?.dataChannel?.readyState !== 'open') return report(new Error('Connect to a peer first.'));
    const selected = store.state.files;
    store.state.files = [];
    await transfers.sendFiles(selected);
}
async function vaultAction(action, id) {
    try {
        if (action === 'delete') {
            if (!await toast.confirm('Delete this received file from this browser?')) return;
            await db.deleteFile(id);
            await refreshVault();
            toast.show('File deleted from this device.', 'success');
        } else {
            toast.show('Preparing your downloadÃ¢â‚¬Â¦', 'info');
            const { blob, name } = await db.getFileBlob(id);
            downloadBlob(blob, name);
        }
    } catch (error) { report(error); }
}
new DashboardShell({ store }).mount(document.getElementById('app'));
function mount(Component, slot, props = {}) { const component = new Component({ store, ...props }); component.mount(document.getElementById(slot)); return component; }
mount(DropZone, 'drop-zone-slot', {
    onFiles: files => {
        const accepted = files.filter(file => file.size <= config.maxFileSize);
        if (accepted.length !== files.length) toast.show(`Files above ${formatBytes(config.maxFileSize)} were skipped.`, 'warning');
        const totalSelected = store.state.files.length + accepted.length;
        store.state.files = [...store.state.files, ...accepted].slice(0, 500);
        if (totalSelected > 500) toast.show('Select up to 500 files at a time.', 'warning');
    }, onSend: sendStaged, onError: report
});
mount(FileTree, 'file-tree-slot', { onRemove: index => { store.state.files = store.state.files.filter((_, i) => i !== index); }, onClear: () => { store.state.files = []; } });
mount(TransferQueue, 'queue-slot', {
    canRetry: id => retryFiles.has(id),
    onAction: (action, id) => {
        if (action === 'cancel') transfers?.cancel(id);
        else if (action === 'retry') { const file = retryFiles.get(id); if (file && transfers) transfers.sendFiles([file]); }
        else vaultAction(action, id);
    }
});
mount(ChatPanel, 'chat-slot', { onSend: text => {
    try {
        const message = { id: crypto.randomUUID(), text, ts: Date.now(), author: store.state.ui.username };
        rtc.sendChat(message);
        addChat({ ...message, origin: 'self', roomId: store.state.session.roomId });
    } catch (error) { report(error); }
} });
mount(SessionControls, 'session-controls-slot', {
    onCreate: () => connectRoom(`mystic-${crypto.randomUUID().replaceAll('-', '')}`),
    onJoin: connectRoom,
    onRetry: () => connectRoom(store.state.session.roomId),
    onCopy: async () => {
        try {
            const url = new URL(location.href);
            url.search = ''; url.hash = new URLSearchParams({ room: store.state.session.roomId });
            await navigator.clipboard.writeText(url.href);
            toast.show('Invite copied. Share it with your other device.', 'success');
        } catch { report(new Error('Clipboard access was blocked. Copy the invite from the address bar.')); }
    },
    onLeave: () => { updatePeer('offline'); teardown(); store.state.session = { roomId: '', role: 'idle', peers: 0 }; writeRoomUrl(''); ui({ connectionStatus: 'idle', error: '' }); }
});
mount(SessionStatus, 'session-status-slot');
mount(SessionSummary, 'session-summary-slot', {
    onExport: () => downloadBlob(new Blob([JSON.stringify({ app: 'Mystic', exportedAt: new Date().toISOString(), chat: store.state.chat, transfers: store.state.transfers, peers: store.state.peers }, null, 2)], { type: 'application/json' }), `mystic-session-${Date.now()}.json`),
    onClear: async () => {
        if (store.state.transfers.some(item => ['sending', 'receiving'].includes(item.status))) return toast.show('Wait for active transfers to finish before clearing history.', 'warning');
        if (!await toast.confirm('Clear chat, transfer and connection history on this device? Vault files are kept separately.')) return;
        try { await historyDb.clear(); store.state.chat = []; store.state.transfers = []; store.state.peers = []; retryFiles.clear(); toast.show('History cleared.', 'success'); }
        catch (error) { report(error); }
    }
});
mount(ConnectionList, 'connections-slot', { onReconnect: connectRoom });
mount(VaultPanel, 'vault-slot', { onAction: vaultAction });
mount(SettingsPanel, 'settings-slot', { onSave: (name, serverUrl) => {
    try {
        const username = name.trim();
        if (!username || username.length > 40) throw new Error('Use a display name with 1-40 characters.');
        const signalUrl = validateSignalUrl(serverUrl.trim());
        localStorage.setItem('mystic_username', username);
        localStorage.setItem('mystic_signalUrl', signalUrl);
        ui({ username, signalUrl });
        toast.show('Preferences saved.', 'success');
    } catch (error) { report(error); }
} });
const graph = mount(SpeedGraph, 'speed-graph-slot');
const graphTimer = setInterval(() => graph.addSpeedData(store.state.transfers.filter(item => ['sending', 'receiving'].includes(item.status)).reduce((sum, item) => sum + (item.speed || 0), 0)), 1000);
const ready = (async () => {
    const results = await Promise.allSettled([
        db.init().then(refreshVault),
        historyDb.init().then(async () => {
            const [chat, savedTransfers, peers] = await Promise.all([historyDb.loadChat(200), historyDb.loadTransfers(200), historyDb.loadPeers()]);
            store.state.chat = chat;
            store.state.transfers = savedTransfers.map(item => ['sending', 'receiving'].includes(item.status) ? { ...item, status: 'interrupted', speed: 0, error: 'The previous session ended. Select this file again to resend.' } : item);
            store.state.peers = peers.map(peer => ({ ...peer, status: 'offline' }));
        }),
        fetch('/api/config').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(value => { config = value; })
    ]);
    if (results[0].status === 'rejected') toast.show('Browser file storage is unavailable. Enable site storage to receive files.', 'warning', 7000);
    if (results[1].status === 'rejected') toast.show('Browser history is unavailable for this session.', 'warning');
    if (results[2].status === 'rejected') toast.show('Server settings could not load. Using default connection settings.', 'warning');
    ui({ booting: false });
})();
function joinFromUrl() {
    const room = new URLSearchParams(location.hash.slice(1)).get('room') || new URLSearchParams(location.search).get('room');
    if (room && room !== store.state.session.roomId) connectRoom(room);
}
ready.then(joinFromUrl);
window.addEventListener('hashchange', joinFromUrl);
window.addEventListener('offline', () => ui({ error: 'You are offline. Check your internet connection.' }));
window.addEventListener('online', () => { if (store.state.session.roomId && rtc?.dataChannel?.readyState !== 'open') connectRoom(store.state.session.roomId); else ui({ error: '' }); });
window.addEventListener('beforeunload', event => {
    if (store.state.transfers.some(item => ['sending', 'receiving'].includes(item.status))) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => { teardown(); clearInterval(graphTimer); graph.unmount(); });
