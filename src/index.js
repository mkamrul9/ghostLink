import { compactOverlay } from './utils/viewport.js';
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
import SettingsPanel from './components/ui/SettingsPanel.js';
import ToastNotification from './components/ui/ToastNotification.js';
import DBManager from './DB/DBManager.js';
import HistoryDB from './DB/HistoryDB.js';
import SignalingChannel from './utils/SignalingChannel.js';
import WebRTCConnection from './utils/WebRTCConnection.js';
import TransferManager from './utils/TransferManager.js';
import { loadSettings, validateSignalUrl } from './utils/settings.js';
import { downloadBlob, formatBytes } from './utils/format.js';
import HelpPanel from './components/ui/HelpPanel.js';
import AssistantPanel from './components/ui/AssistantPanel.js';
import showTutorial from './components/ui/Tutorial.js';
import { showShareRoom, inviteUrl } from './utils/ShareRoom.js';
import { addFiles, filePath, namedFile, movePaths, renamedPath, safePath } from './utils/FileLibrary.js';
import { createZip } from './utils/ZipDownload.js';
import { textDialog } from './utils/dialogs.js';
import { createRoomCode, normalizeRoomCode } from './utils/RoomCode.js';

const store = new Store({ initialState: {
    files: [], fileSelection: [], receivedSelection: [], transfers: [], chat: [], peers: [], vault: [],
    ui: { ...loadSettings(), view: ({ '/received': 'vault', '/transfers': 'transfers', '/help': 'help', '/settings': 'settings' })[location.pathname] || 'dashboard', chatOpen: false, assistantOpen: false, connectionStatus: 'idle', dataChannelStatus: 'closed', booting: true, error: '' },
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
    try { store.state.vault = (await db.getAllMetadata()).map(({ cryptoKey, ...metadata }) => metadata).sort((a, b) => b.createdAt - a.createdAt);
        store.state.receivedSelection = store.state.receivedSelection.filter(id => store.state.vault.some(file => String(file.fileId) === id)); }
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
    if (!patch.status && now - (progressTicks.get(id) || 0) < 200) return;
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
    room = normalizeRoomCode(room);
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
        onReceived: async () => { await refreshVault(); toast.show('File received. Open Received files to download it.', 'success'); }
    });
    currentRtc.onDataChannelOpen = () => {
        if (!isCurrent()) return;
        clearTimeout(handshakeTimer);
        reconnectAttempt = 0;
        ui({ connectionStatus: 'connected', dataChannelStatus: 'open', error: '' });
        store.state.session = { ...store.state.session, peers: 1 };
        updatePeer('online');
        toast.show('The other device is connected.', 'success');
    };
    currentRtc.onDataChannelClose = () => {
        if (!isCurrent()) return;
        transfers?.close();
        ui({ connectionStatus: 'disconnected', dataChannelStatus: 'closed', error: 'The other device disconnected. Choose Try again.' });
        store.state.session = { ...store.state.session, peers: 0 };
        updatePeer('offline');
    };
    currentRtc.onConnectionStateChange = status => {
        if (!isCurrent()) return;
        if (status === 'failed') {
            transfers?.close();
            ui({ connectionStatus: 'failed', dataChannelStatus: 'closed', error: 'The devices lost their connection. Try again or use another network.' });
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
    let token;
    try {
        await ready;
        if (!window.isSecureContext || !crypto.subtle || !window.RTCPeerConnection) throw new Error('Use HTTPS and a browser with WebRTC support to transfer files.');
        const room = roomFromInput(input);
        const serverUrl = validateSignalUrl(store.state.ui.signalUrl);
        if (!automatic) reconnectAttempt = 0;
        teardown();
        token = generation;
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
                    toast.show('The other device left. This room is still open.', 'info');
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
            ui({ connectionStatus: 'disconnected', error: 'Connection lost. Trying again...' });
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
        if (token !== undefined && token !== generation) return;
        if (token === undefined) { ui({ error: error.message }); report(error); return; }
        signal?.close();
        ui({ connectionStatus: 'failed', dataChannelStatus: 'closed', error: error.message });
        report(error);
    }
}
const viewPaths = { dashboard: '/', vault: '/received', transfers: '/transfers', help: '/help', settings: '/settings' };
function changeView(view, target) {
    if (!viewPaths[view]) return;
    ui({ view });
    const url = new URL(location.href); url.pathname = viewPaths[view];
    if (url.href !== location.href) history.pushState(null, '', url);
    requestAnimationFrame(() => {
        const element = target ? document.querySelector(`[data-guide="${target}"]`) : document.getElementById('main-content');
        element?.focus({ preventScroll: true });
        if (!target && innerWidth <= 760) element?.scrollIntoView({ block: 'start', behavior: 'instant' });
        if (target) { element?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); element?.classList.add('guide-highlight'); setTimeout(() => element?.classList.remove('guide-highlight'), 4500); }
    });
}
function tutorial(type = 'send') { showTutorial(type, changeView); }
function createRoom() { return connectRoom(createRoomCode()); }
function openAssistant() { ui({ assistantOpen: true, chatOpen: false }); }
function shareRoom() {
    if (!store.state.session.roomId) { toast.show('Create a room first.', 'info'); return; }
    showShareRoom(store.state.session.roomId, toast);
}
function stageIncoming(incoming) {
    try {
        const accepted = incoming.filter(file => file.size <= config.maxFileSize);
        if (accepted.length !== incoming.length) toast.show(`Files above ${formatBytes(config.maxFileSize)} were skipped.`, 'warning');
        const additions = addFiles(store.state.files, accepted);
        const available = Math.max(0, 500 - store.state.files.length);
        const added = additions.slice(0, available);
        if (added.length !== additions.length) toast.show('You can add up to 500 files at a time.', 'warning');
        store.state.files = [...store.state.files, ...added];
        store.state.fileSelection = [...store.state.fileSelection, ...added.map(file => file.mysticId)];
    } catch (error) { report(error); }
}
function sendSelected(ids = store.state.fileSelection) {
    if (!transfers || rtc?.dataChannel?.readyState !== 'open') { report(new Error('Connect another device first.')); return false; }
    const chosen = store.state.files.filter(file => ids.includes(file.mysticId));
    if (!chosen.length) { toast.show('Add and select the files you want to send.', 'info'); return false; }
    const sending = new Set(chosen.map(file => file.mysticId));
    store.state.files = store.state.files.filter(file => !sending.has(file.mysticId));
    store.state.fileSelection = store.state.fileSelection.filter(id => !sending.has(id));
    transfers.sendFiles(chosen).catch(report);
    changeView('transfers');
    return true;
}
function entriesFor(mode) {
    return mode === 'received'
        ? store.state.vault.map(file => ({ id: String(file.fileId), path: file.relativePath || file.fileName, size: file.fileSize, complete: file.complete }))
        : store.state.files.map(file => ({ id: file.mysticId, path: filePath(file), size: file.size, complete: true }));
}
async function updatePaths(mode, changes) {
    if (mode === 'send') {
        store.state.files = store.state.files.map(file => { const change = changes.find(item => item.id === file.mysticId); return change ? namedFile(file, change.path) : file; });
    } else {
        for (const change of changes) {
            const metadata = await db.getMetadata(Number(change.id));
            if (!metadata?.complete) throw new Error('Wait until this file finishes arriving before renaming or moving it.');
            await db.saveMetadata({ ...metadata, fileName: change.path.split('/').at(-1), relativePath: change.path });
        }
        await refreshVault();
    }
}
async function downloadReceived(ids, folder = false) {
    const selected = entriesFor('received').filter(entry => ids.includes(entry.id));
    if (!selected.length) return;
    if (selected.some(entry => !entry.complete)) throw new Error('Wait until the selected files finish arriving.');
    if (selected.length === 1 && !folder) {
        const { blob, name } = await db.getFileBlob(Number(selected[0].id)); downloadBlob(blob, name); return;
    }
    toast.show('Preparing your folder download...', 'info');
    const blob = await createZip(selected.map(entry => ({ ...entry, getBlob: async () => (await db.getFileBlob(Number(entry.id))).blob })));
    downloadBlob(blob, 'Mystic-files.zip');
}
async function libraryAction(mode, action, ids) {
    try {
        const entries = entriesFor(mode);
        const selected = entries.filter(entry => ids.includes(entry.id));
        if (action === 'send') return sendSelected(ids);
        if (!selected.length) return;
        if (action === 'rename') {
            const entry = selected[0];
            const name = await textDialog({ title: 'Rename file', label: 'File name', value: entry.path.split('/').at(-1), button: 'Rename', validate: value => {
                const path = renamedPath(entry.path, value);
                if (entries.some(other => other.id !== entry.id && other.path.toLowerCase() === path.toLowerCase())) throw new Error('A file already has that name in this folder.');
            } });
            if (name !== null) await updatePaths(mode, [{ id: entry.id, path: renamedPath(entry.path, name) }]);
        } else if (action === 'move') {
            const destination = await textDialog({ title: 'Move to folder', label: 'Folder name', hint: 'Use / for folders inside folders. Leave empty to move to the top level.', button: 'Move files', allowEmpty: true, validate: value => { if (value) safePath(value); } });
            if (destination !== null) await updatePaths(mode, movePaths(entries, ids, destination));
        } else if (action === 'remove') {
            if (mode === 'send') {
                store.state.files = store.state.files.filter(file => !ids.includes(file.mysticId));
                store.state.fileSelection = store.state.fileSelection.filter(id => !ids.includes(id));
            } else {
                if (!await toast.confirm(`Delete ${selected.length === 1 ? 'this file' : `${selected.length} files`} from this browser?`)) return;
                selected.forEach(entry => transfers?.cancel(Number(entry.id)));
                await rtc?.incoming;
                await Promise.all(selected.map(entry => db.deleteFile(Number(entry.id))));
                await refreshVault();
                toast.show('Files deleted.', 'success');
            }
        } else if (action.startsWith('download')) await downloadReceived(ids, action === 'download-folder');
    } catch (error) { report(error); }
}
const shell = new DashboardShell({ store, onView: changeView, onChat: () => ui({ chatOpen: !store.state.ui.chatOpen, assistantOpen: false }), onTutorial: tutorial });
shell.mount(document.getElementById('app'));
function mount(Component, slot, props = {}) { const component = new Component({ store, ...props }); component.mount(document.getElementById(slot)); return component; }
const dropZone = mount(DropZone, 'drop-zone-slot', { onFiles: stageIncoming, onError: report });
mount(FileTree, 'file-tree-slot', { mode: 'send', onSelect: ids => { store.state.fileSelection = ids; }, onAction: (action, ids) => libraryAction('send', action, ids) });
mount(FileTree, 'vault-slot', { mode: 'received', onSelect: ids => { store.state.receivedSelection = ids; }, onAction: (action, ids) => libraryAction('received', action, ids) });
mount(TransferQueue, 'queue-slot', {
    canRetry: id => retryFiles.has(id),
    onAction: (action, id) => {
        if (action === 'cancel') transfers?.cancel(id);
        else if (action === 'retry') { const file = retryFiles.get(id); if (file && transfers) transfers.sendFiles([file]).catch(report); }
        else libraryAction('received', 'download', [String(id)]);
    }
});
mount(ChatPanel, 'chat-slot', { onSend: text => {
    try { const message = { id: crypto.randomUUID(), text, ts: Date.now(), author: store.state.ui.username }; rtc.sendChat(message); addChat({ ...message, origin: 'self', roomId: store.state.session.roomId }); }
    catch (error) { report(error); }
} });
mount(SessionControls, 'session-controls-slot', {
    onCreate: createRoom, onJoin: connectRoom, onRetry: () => connectRoom(store.state.session.roomId), onShare: shareRoom,
    onCopy: async () => { try { await navigator.clipboard.writeText(inviteUrl(store.state.session.roomId)); toast.show('Invite link copied.', 'success'); } catch { report(new Error('Copy the invite from Share room.')); } },
    onCopyCode: async () => { try { await navigator.clipboard.writeText(store.state.session.roomId); toast.show('Room code copied.', 'success'); } catch { report(new Error('Select and copy the room code above.')); } },
    onLeave: () => { updatePeer('offline'); teardown(); store.state.session = { roomId: '', role: 'idle', peers: 0 }; writeRoomUrl(''); ui({ connectionStatus: 'idle', error: '' }); }
});
mount(SessionStatus, 'session-status-slot');
mount(SessionSummary, 'session-summary-slot', {
    onExport: () => downloadBlob(new Blob([JSON.stringify({ app: 'Mystic', exportedAt: new Date().toISOString(), chat: store.state.chat, transfers: store.state.transfers, peers: store.state.peers }, null, 2)], { type: 'application/json' }), `Mystic-history-${Date.now()}.json`),
    onClear: async () => {
        if (store.state.transfers.some(item => ['queued', 'sending', 'receiving'].includes(item.status))) return toast.show('Wait until your transfers finish before clearing history.', 'info');
        if (!await toast.confirm('Clear messages and transfer history on this device? Received files will stay.')) return;
        try { await historyDb.clear(); store.state.chat = []; store.state.transfers = []; store.state.peers = []; retryFiles.clear(); toast.show('History cleared.', 'success'); }
        catch (error) { report(error); }
    }
});
mount(ConnectionList, 'connections-slot', { onReconnect: connectRoom });
mount(SettingsPanel, 'settings-slot', { onSave: (name, serverUrl) => {
    try {
        const username = name.trim();
        if (!username || username.length > 40) throw new Error('Use a name with 1 to 40 characters.');
        const signalUrl = validateSignalUrl(serverUrl.trim());
        localStorage.setItem('mystic_username', username); localStorage.setItem('mystic_signalUrl', signalUrl);
        ui({ username, signalUrl }); toast.show('Settings saved.', 'success');
    } catch (error) { report(error); }
} });
mount(HelpPanel, 'help-slot', { onTutorial: tutorial, onAssistant: openAssistant });
mount(AssistantPanel, 'assistant-slot', { onToggle: () => ui({ assistantOpen: !store.state.ui.assistantOpen, chatOpen: false }), onAction: action => {
    if (action.type !== 'send') ui({ assistantOpen: false });
    if (action.type === 'send') return sendSelected(action.ids.filter(id => store.state.files.some(file => file.mysticId === id)));
    if (action.type === 'select') { store.state.fileSelection = action.ids.filter(id => store.state.files.some(file => file.mysticId === id)); changeView('dashboard'); }
    else if (action.type === 'choose') { changeView('dashboard'); dropZone.chooseFiles(); }
    else if (action.type === 'view') changeView(action.view);
    else if (action.type === 'tutorial') tutorial();
    else if (action.type === 'create') createRoom();
    else if (action.type === 'share') shareRoom();
    return false;
} });
const ready = (async () => {
    const results = await Promise.allSettled([
        db.init().then(refreshVault),
        historyDb.init().then(async () => {
            const [chat, savedTransfers, peers] = await Promise.all([historyDb.loadChat(200), historyDb.loadTransfers(200), historyDb.loadPeers()]);
            store.state.chat = chat;
            store.state.transfers = savedTransfers.map(item => ['queued', 'sending', 'receiving'].includes(item.status) ? { ...item, status: 'interrupted', speed: 0, error: 'The previous session ended. Select this file again to resend.' } : item);
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
    if (store.state.transfers.some(item => ['queued', 'sending', 'receiving'].includes(item.status))) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', teardown);
window.addEventListener('popstate', () => { const view = Object.entries(viewPaths).find(([, path]) => path === location.pathname)?.[0] || 'dashboard'; ui({ view }); joinFromUrl(); });
window.addEventListener('keydown', event => { if (event.key === 'Escape' && store.state.ui.chatOpen) ui({ chatOpen: false }); });

document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('main-content').focus();
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

function updateVisibleViewport() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--visible-height', `${viewport?.height || innerHeight}px`);
    document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
}
updateVisibleViewport();
window.visualViewport?.addEventListener('resize', updateVisibleViewport);
window.visualViewport?.addEventListener('scroll', updateVisibleViewport);
window.addEventListener('resize', () => { updateVisibleViewport(); shell.update(); });
window.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !compactOverlay() || document.querySelector('dialog[open]')) return;
    const panel = store.state.ui.assistantOpen ? document.getElementById('assistant-panel') : store.state.ui.chatOpen ? document.getElementById('message-drawer') : null;
    if (!panel) return;
    const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) return;
    if (!panel.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
});
