import { trimTransferHistory } from './utils/TransferState.js';
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
import RoomSession from './utils/RoomSession.js';
import RoomMembers from './components/ui/RoomMembers.js';
import { loadSettings, validateSignalUrl } from './utils/settings.js';
import { downloadBlob, formatBytes } from './utils/format.js';
import HelpPanel from './components/ui/HelpPanel.js';
import AssistantPanel from './components/ui/AssistantPanel.js';
import showTutorial from './components/ui/Tutorial.js';
import { showShareRoom, inviteUrl } from './utils/ShareRoom.js';
import { addFiles, directoryFile, filePath, namedFile, movePaths, renamedPath, safePath } from './utils/FileLibrary.js';
import { createZipStream } from './utils/ZipDownload.js';
import { saveStream, saveFolderToDevice, activeSaves } from './utils/SaveToDevice.js';
import { backupStream, restoreBackup } from './utils/LocalBackup.js';
import { prepareStreamDownloads } from './utils/StreamDownload.js';
import SecurityPanel from './components/ui/SecurityPanel.js';
import { textDialog } from './utils/dialogs.js';
import { createRoomCode, normalizeRoomCode } from './utils/RoomCode.js';

const store = new Store({ initialState: {
    files: [], fileSelection: [], receivedSelection: [], transfers: [], chat: [], peers: [], vault: [],
    ui: { ...loadSettings(), view: ({ '/received': 'vault', '/transfers': 'transfers', '/help': 'help', '/settings': 'settings' })[location.pathname] || 'dashboard', chatOpen: false, assistantOpen: false, connectionStatus: 'idle', dataChannelStatus: 'closed', booting: true, error: '' },
    vaultState: { protected: false, locked: false, busy: false, persistent: false },
    session: { roomId: '', role: 'idle', peers: 0 }
} });
const db = new DBManager();
const historyDb = new HistoryDB();
const toast = new ToastNotification();
let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], maxFileSize: Number.MAX_SAFE_INTEGER };
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
let selectedInitialPeer = false;
let recipientDevices = new Set();
const ui = patch => { store.state.ui = { ...store.state.ui, ...patch }; };
const report = error => { if (error?.name !== 'AbortError') toast.show(error?.message || String(error), 'error'); };
const save = promise => promise.catch(() => {
    if (!persistenceWarning) { persistenceWarning = true; toast.show('Browser history could not be saved. Your live session still works.', 'warning'); }
});
const refreshVault = async () => {
    store.state.vaultState = { ...store.state.vaultState, protected: Boolean(db.protection), locked: db.locked };
    if (db.locked) { store.state.vault = []; store.state.receivedSelection = []; return; }
    store.state.vault = (await db.getAllMetadata()).map(({ cryptoKey, ...metadata }) => metadata).sort((a, b) => b.createdAt - a.createdAt);
    store.state.receivedSelection = store.state.receivedSelection.filter(id => store.state.vault.some(file => String(file.fileId) === id));
};
const activeTransfers = () => store.state.transfers.some(item => ['queued', 'sending', 'receiving'].includes(item.status));
async function securityAction(action, file) {
    try {
        await ready;
        if (store.state.vaultState.busy) return;
        if (action === 'persist') {
            const persistent = await navigator.storage?.persist?.() || false;
            store.state.vaultState = { ...store.state.vaultState, persistent };
            toast.show(persistent ? 'The browser will keep local files until you clear site data.' : 'The browser did not grant storage protection. Save a backup for important files.', 'info'); return;
        }
        if (['protect','lock','restore','backup'].includes(action) && (activeTransfers() || activeSaves)) throw new Error('Wait until your transfers and downloads finish first.');
        if (action === 'lock') { db.lock(); await refreshVault(); return; }
        let password;
        if (action === 'protect' && db.protection) {
            const current = await textDialog({ title: 'Current passphrase', label: 'Passphrase', secret: true, button: 'Continue' });
            if (current === null) return; await db.unlock(current);
        }
        if (['protect','unlock','backup','restore'].includes(action)) {
            password = await textDialog({ title: ({protect:'Protect your files',unlock:'Unlock your files',backup:'Save an encrypted backup',restore:'Restore your backup'})[action], label: action === 'backup' || action === 'restore' ? 'Backup passphrase' : 'Passphrase', secret: true, confirmSecret: ['protect','backup'].includes(action), hint: ['protect','backup'].includes(action) ? 'Use at least 12 characters. Keep it somewhere safe; there is no reset.' : '', button: ({protect:'Protect files',unlock:'Unlock',backup:'Choose where to save',restore:'Restore'})[action], validate: value => { if (['protect','backup'].includes(action) && value.length < 12) throw new Error('Use at least 12 characters.'); } });
            if (password === null) return;
        }
        if (['protect','lock','restore','backup'].includes(action) && (activeTransfers() || activeSaves)) throw new Error('Wait until your transfers and downloads finish first.');
        // Open the save picker directly from the passphrase dialog's submit activation.
        let operation;
        if (action === 'backup') {
            const entries = store.state.vault;
            operation = saveStream({ name: `Mystic-backup-${Date.now()}.mystic`, size: entries.reduce((n, item) => n + item.fileSize + item.totalChunks * 80 + 4096, 4096), source: () => backupStream(db, entries.map(item => item.fileId), password) });
        }
        store.state.vaultState = { ...store.state.vaultState, busy: true };
        if (action === 'protect') await db.protect(password);
        else if (action === 'unlock') await db.unlock(password);
        else if (action === 'restore') { const count = await restoreBackup(db, file, password); toast.show(`${count} saved items restored.`, 'success'); }
        else if (operation) { await operation; toast.show('Encrypted backup saved. Keep its passphrase safe.', 'success'); }
        await refreshVault();
    } catch (error) { report(error); }
    finally { store.state.vaultState = { ...store.state.vaultState, busy: false }; }
}
const addTransfer = (transfer, file) => {
    if (file) retryFiles.set(transfer.id, {file, deviceId:transfer.remoteDeviceId});
    store.state.transfers = trimTransferHistory([...store.state.transfers.filter(item => item.id !== transfer.id), transfer]);
    save(historyDb.saveTransfer(transfer));
};
const updateTransfer = (id, patch) => {
    const terminal = ['complete', 'failed', 'cancelled', 'interrupted'].includes(patch.status);
    const now = performance.now();
    if (!patch.status && now - (progressTicks.get(id) || 0) < 200) return;
    progressTicks.set(id, now);
    let changed;
    store.state.transfers = trimTransferHistory(store.state.transfers.map(item => item.id === id ? (changed = { ...item, ...patch }) : item));
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
    rtc?.close();
    selectedInitialPeer = false;
    recipientDevices.clear();
    signal?.close();
    transfers = rtc = signal = null;
    store.state.session = { ...store.state.session, peers: 0, members: [], recipientIds: [] };
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
function setupRoom(token) {
    const session = new RoomSession(signal, db, {
        iceServers: config.iceServers, refreshIce: async () => { const response = await fetch('/api/config'); if (!response.ok) throw new Error('Connection settings could not refresh.'); const latest = await response.json(); return latest.iceServers; }, maxFileSize: config.maxFileSize,
        canReceive: () => !store.state.vaultState.busy,
        onAdd: addTransfer, onProgress: updateTransfer, onError: report,
        onVaultChange: refreshVault,
        onReceived: async () => { await refreshVault(); toast.show('File received. Open Received files to save it.', 'success'); },
        onPeers: members => {
            if (token !== generation) return;
            const connected = members.filter(peer => peer.connected);
            let recipientIds = connected.filter(peer => recipientDevices.has(peer.deviceId)).map(peer => peer.id);
            if (!selectedInitialPeer && connected.length) { recipientIds = [connected[0].id]; recipientDevices.add(connected[0].deviceId); selectedInitialPeer = true; }
            store.state.session = { ...store.state.session, members, recipientIds, peers: connected.length };
            ui({ connectionStatus: connected.length ? 'connected' : members.some(peer => !peer.failed) ? 'connecting' : members.length ? 'disconnected' : 'waiting', dataChannelStatus: connected.length ? 'open' : 'closed', error: !connected.length && members.some(peer => peer.failed) ? 'A device disconnected. Choose Try again to reconnect.' : '' });
            updatePeer(connected.length ? 'online' : 'offline');
        },
        onChat: message => addChat({ id: crypto.randomUUID(), text: message.text, author: message.author, ts: Date.now(), origin: 'peer', roomId: store.state.session.roomId })
    });
    rtc = transfers = session;
    return session;
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
            if (token !== generation || message.type === 'JOINED') return;
            if (!rtc) { pending.push(message); return; }
            await rtc.handle(message);
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
        setupRoom(token);
        store.state.session = { roomId: room, role: joined.initiator ? 'host' : 'guest', peers: joined.peers };
        ui({ connectionStatus: joined.peers ? 'connecting' : 'waiting', dataChannelStatus: joined.peers ? 'connecting' : 'closed' });
        await rtc.join(joined);
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
        const added = addFiles(store.state.files, accepted);
        store.state.files = [...store.state.files, ...added];
        store.state.fileSelection = [...store.state.fileSelection, ...added.map(file => file.mysticId)];
    } catch (error) { report(error); }
}
function sendSelected(ids = store.state.fileSelection) {
    if (db.locked || store.state.vaultState.busy) { report(new Error('Unlock your files and finish storage tasks first.')); return false; }
    if (!transfers || rtc?.dataChannel?.readyState !== 'open') { report(new Error('Connect another device first.')); return false; }
    const recipients = store.state.session.recipientIds || [];
    if (!recipients.length) { report(new Error('Choose a receiving device in Send to.')); return false; }
    const chosen = store.state.files.filter(file => ids.includes(file.mysticId));
    if (!chosen.length) { toast.show('Add and select the files you want to send.', 'info'); return false; }
    const sending = new Set(chosen.map(file => file.mysticId));
    store.state.files = store.state.files.filter(file => !sending.has(file.mysticId));
    store.state.fileSelection = store.state.fileSelection.filter(id => !sending.has(id));
    transfers.sendFiles(chosen, recipients).catch(report);
    changeView('transfers');
    return true;
}
function entriesFor(mode) {
    return mode === 'received'
        ? store.state.vault.map(file => ({ id: String(file.fileId), path: file.relativePath || file.fileName, size: file.fileSize, directory: file.kind === 'directory', complete: file.complete }))
        : store.state.files.map(file => ({ id: file.mysticId, path: filePath(file), size: file.size, directory: Boolean(file.mysticDirectory), complete: true }));
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
async function downloadReceived(ids, folder = false, nativeFolder = false) {
    const selected = entriesFor('received').filter(entry => ids.includes(entry.id));
    if (!selected.length) return;
    if (selected.some(entry => !entry.complete)) throw new Error('Wait until the selected files finish arriving.');
    const entries = selected.map(entry => ({ ...entry, getChunks: () => db.fileChunks(Number(entry.id)) }));
    if (nativeFolder) { await saveFolderToDevice(entries); toast.show('Files saved in a new Mystic folder.', 'success'); return; }
    if (entries.length === 1 && !folder && !entries[0].directory) {
        const entry = entries[0];
        await saveStream({ name: entry.path.split('/').at(-1), size: entry.size, source: entry.getChunks }); return;
    }
    await saveStream({ name: 'Mystic-files.zip', size: entries.reduce((n, item) => n + item.size + 512 + item.path.length * 6, 1024), source: () => createZipStream(entries), type: 'application/zip' });
}
async function libraryAction(mode, action, ids) {
    try {
        if (activeSaves) throw new Error('Wait until your download finishes before changing saved files.');
        if (action === 'unlock') return securityAction('unlock');
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
        } else if (action === 'save-folder') await downloadReceived(ids, true, true);
        else if (action.startsWith('download')) await downloadReceived(ids, action === 'download-folder');
    } catch (error) { report(error); }
}
const shell = new DashboardShell({ store, onView: changeView, onChat: () => ui({ chatOpen: !store.state.ui.chatOpen, assistantOpen: false }), onTutorial: tutorial });
shell.mount(document.getElementById('app'));
function mount(Component, slot, props = {}) { const component = new Component({ store, ...props }); component.mount(document.getElementById(slot)); return component; }
mount(RoomMembers, 'recipients-slot', { onSelect: recipientIds => { for (const peer of store.state.session.members || []) { if (!peer.deviceId) continue; recipientIds.includes(peer.id) ? recipientDevices.add(peer.deviceId) : recipientDevices.delete(peer.deviceId); } store.state.session = { ...store.state.session, recipientIds }; } });
const dropZone = mount(DropZone, 'drop-zone-slot', { onFiles: stageIncoming, onError: report, onEmptyFolder: async () => { const name = await textDialog({ title: 'New empty folder', label: 'Folder path', button: 'Add folder', validate: safePath }); if (name !== null) stageIncoming([directoryFile(name)]); } });
mount(FileTree, 'file-tree-slot', { mode: 'send', onSelect: ids => { store.state.fileSelection = ids; }, onAction: (action, ids) => libraryAction('send', action, ids) });
mount(FileTree, 'vault-slot', { mode: 'received', onSelect: ids => { store.state.receivedSelection = ids; }, onAction: (action, ids) => libraryAction('received', action, ids) });
mount(TransferQueue, 'queue-slot', {
    canRetry: id => retryFiles.has(id),
    onAction: (action, id) => {
        if (action === 'cancel') transfers?.cancel(id);
        else if (action === 'retry') { const original = retryFiles.get(id); if (original && transfers) { try { transfers.retry(original.file, original.deviceId).catch(report); } catch (error) { report(error); } } }
        else if (action === 'receipt') { const item = store.state.transfers.find(entry => entry.id === id); if (item?.verified) downloadBlob(new Blob([JSON.stringify({ app: 'Mystic', version: 1, file: item.relativePath || item.name, bytes: item.size, sha256: item.sha256, verifiedAt: item.completedAt || item.updatedAt, direction: item.direction, resumedBytes: item.resumedBytes || 0, note: 'A matching checksum confirms file bytes. It does not verify who sent the file.' }, null, 2)], {type:'application/json'}), 'Mystic-file-receipt.json'); }
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
        ui({ username, signalUrl }); rtc?.updateProfile(username); toast.show('Settings saved.', 'success');
    } catch (error) { report(error); }
} });
mount(SecurityPanel, 'security-slot', { onAction: securityAction });
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
        db.init().then(async () => { await refreshVault(); store.state.vaultState = { ...store.state.vaultState, persistent: await navigator.storage?.persisted?.() || false }; }),
        historyDb.init().then(async () => {
            const [chat, savedTransfers, peers] = await Promise.all([historyDb.loadChat(200), historyDb.loadTransfers(200), historyDb.loadPeers()]);
            store.state.chat = chat;
            store.state.transfers = savedTransfers.map(item => ['queued', 'sending', 'receiving'].includes(item.status) ? { ...item, status: 'interrupted', speed: 0, error: 'The previous session ended. Select this file again to resend.' } : item);
            store.state.peers = peers.map(peer => ({ ...peer, status: 'offline' }));
        }),
        fetch('/api/config').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(value => { config = value; })
    ]);
    if (results[0].status === 'rejected') toast.show(results[0].reason.message || 'Browser file storage is unavailable. Enable site storage to receive files.', 'warning', 10000);
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
    if (activeTransfers() || activeSaves) { event.preventDefault(); event.returnValue = ''; }
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

let wakeLock = null, requestingWakeLock = false;
async function keepAwake() {
    if (!(activeTransfers() || activeSaves) || document.visibilityState !== 'visible') { await wakeLock?.release().catch(() => {}); wakeLock = null; return; }
    if (!wakeLock && !requestingWakeLock && navigator.wakeLock) {
        requestingWakeLock = true;
        try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
        catch { /* Browser or power settings can decline this optional request. */ }
        finally { requestingWakeLock = false; }
    }
}
store.events.subscribe('stateChange', (_state, key) => { if (key === 'transfers') keepAwake(); });
document.addEventListener('visibilitychange', keepAwake);

prepareStreamDownloads();
window.addEventListener('mystic-save-state', () => { store.state.vaultState = {...store.state.vaultState, saving:Boolean(activeSaves)}; keepAwake(); });

let lastActivity = Date.now();
for (const event of ['pointerdown', 'keydown']) document.addEventListener(event, () => { lastActivity = Date.now(); }, {passive:true});
setInterval(() => {
    if (db.protection && !db.locked && !activeTransfers() && !activeSaves && !store.state.vaultState.busy && Date.now() - lastActivity >= 10 * 60 * 1000) {
        db.lock(); refreshVault().catch(report);
    }
}, 30000);
