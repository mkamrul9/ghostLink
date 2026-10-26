const types = {
    photos: /\.(png|jpe?g|gif|webp|heic|avif|svg|bmp)$/i,
    images: /\.(png|jpe?g|gif|webp|heic|avif|svg|bmp)$/i,
    pdfs: /\.pdf$/i,
    documents: /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|odt)$/i,
    videos: /\.(mp4|mov|webm|mkv|avi)$/i,
    music: /\.(mp3|wav|ogg|flac|m4a)$/i
};
export function matchFiles(query, files, selected = []) {
    let target = query.trim().replace(/[.!?]$/, '').replace(/^the\s+/i, '').replace(/^(?:files?\s+(?:called|named)\s+|files?\s+)/i, '').trim();
    target = target.replace(/^['"]|['"]$/g, '').trim();
    const lower = target.toLowerCase();
    if (['all', 'everything', 'all files', 'all of them'].includes(lower)) return { files };
    if (['selected', 'selected files', 'these', 'these files'].includes(lower)) return { files: files.filter(file => selected.includes(file.id)) };
    const category = lower.replace(/^all\s+/, '').replace(/\s+files$/, '');
    if (types[category]) return { files: files.filter(file => types[category].test(file.name)) };
    if (/^all\s+\.?[a-z0-9]+s?(?:\s+files)?$/i.test(lower)) {
        const extension = lower.replace(/^all\s+\.?/, '').replace(/\s+files$/, '').replace(/s$/, '');
        return { files: files.filter(file => file.name.toLowerCase().endsWith(`.${extension}`)) };
    }
    const folder = target.replace(/^(?:the\s+)?folder\s+/i, '').replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
    const folderMatches = files.filter(file => file.path.toLowerCase().startsWith(`${folder.toLowerCase()}/`));
    if (folderMatches.length && (/^folder\s/i.test(target) || !files.some(file => file.path.toLowerCase() === lower))) return { files: folderMatches };
    const exactPath = files.filter(file => file.path.toLowerCase() === lower);
    if (exactPath.length) return { files: exactPath };
    const exactName = files.filter(file => file.name.toLowerCase() === lower);
    if (exactName.length > 1) return { files: [], ambiguous: exactName };
    if (exactName.length) return { files: exactName };
    return { files: [] };
}
export function assistantReply(input, { files = [], selected = [], connected = false } = {}) {
    const text = String(input).trim().slice(0, 500);
    const lower = text.toLowerCase();
    const send = text.match(/^(?:please\s+)?send\s+(.+)$/i);
    const find = text.match(/^(?:please\s+)?(?:find|select)\s+(.+)$/i);
    if (send || find) {
        if (!files.length) return { text: 'Add the files first. I can only use files you choose in Mystic.', action: { type: 'choose', label: 'Add files' } };
        const result = matchFiles((send || find)[1], files, selected);
        if (result.ambiguous) return { text: 'More than one file has that name. Include the folder, for example: send Reports/report.pdf.' };
        if (!result.files.length) return { text: 'I could not find that in your added files. Use the full file name, a folder name, or a group such as "send all photos".', action: { type: 'view', view: 'dashboard', label: 'See added files' } };
        if (find) return { text: `I found ${result.files.length} file${result.files.length === 1 ? '' : 's'}.`, action: { type: 'select', ids: result.files.map(file => file.id), label: 'Select these files' } };
        return { text: connected ? 'Review these files, then press Send.' : 'Review these files. Connect the other device before sending.', action: { type: 'send', ids: result.files.map(file => file.id), label: `Send ${result.files.length} file${result.files.length === 1 ? '' : 's'}` } };
    }
    if (/^(?:please\s+)?(?:create|make|start)\s+(?:a\s+)?room\b/.test(lower)) return { text: 'Create a room, then share its invite with the other person.', action: { type: 'create', label: 'Create a room' } };
    if (/tutorial|show me|walk.*through|step.by.step/.test(lower)) return { text: 'Here is a short walkthrough. You can stop or repeat it at any time.', action: { type: 'tutorial', label: 'Start tutorial' } };
    if (/receiv|where.*(?:files|download)|download/.test(lower)) return { text: 'Open the invite link or join with the room code. When the sender finishes, open Received files and download what you need. A folder download keeps its layout in a ZIP.', action: { type: 'view', view: 'vault', label: 'Open received files' } };
    if (/share|invite|whatsapp|telegram|email|room code/.test(lower)) return { text: 'Create a room, then choose Share room. Pick an app or copy the invite link or room code. A localhost link only works on this computer.', action: { type: 'share', label: 'Share room' } };
    if (/rename|move|organiz|folder/.test(lower)) return { text: 'Select files, then choose Move to folder. Use the pencil beside a file to rename it. Original files on your computer stay unchanged. To download a received folder, use its download icon.', action: { type: 'view', view: 'dashboard', label: 'Organize files' } };
    if (/not.*connect|cannot.*connect|can.t.*connect|disconnect|fail|stuck|retry|try again/.test(lower)) return { text: 'Keep both devices online and use the same website and room code. Rooms hold up to six devices by default. Choose recipients in Send to. Choose Try again, or try a different network. If you refreshed, add the original file again to resume the saved part.', action: { type: 'view', view: 'transfers', label: 'Check transfers' } };
    if (/size|large|limit|500|256/.test(lower)) return { text: 'Transfers use available device storage, with no fixed 256 MB or 500-file cap. Mystic streams large downloads through a native save picker or the browser download system where supported. Older browsers use a memory download limited to 256 MiB. Keep Mystic open until downloads finish.' };
    if (/local folder|browser data|browser storage|disk|quota/.test(lower)) return { text: 'In Settings, choose a local folder in desktop Chrome or Edge. Received files stay encrypted there, outside browser storage. Choose that same folder and enter its passphrase to recover it after clearing website data. Browser-only copies still need a download or backup.', action: { type:'view', view:'settings', label:'Choose file storage' } };
    if (/backup|passphrase|unlock|protect|resume|checksum|verified/.test(lower)) return { text: 'Settings lets you protect saved files and save or restore an encrypted backup on your own drive. Keep both devices online to send. After an interruption, reconnect and add the same file; Mystic checks saved chunks and sends the missing part. Verified match means the full file checksums agree.', action: { type: 'view', view: 'settings', label: 'Open settings' } };
    if (/privacy|safe|secure|cloud|stored|storage|private/.test(lower)) return { text: 'Files travel through an encrypted connection between devices. Received copies stay in this browser until deleted. Clearing website data removes them. The helper works on this device and does not read file contents.' };
    if (/send|start|how.*work|hello|^hi\b|help/.test(lower)) return { text: 'Create a room and share the invite. Once the other device connects, add files, tick the ones you want, and press Send. I can also find added files: try "send report.pdf".', action: { type: 'tutorial', label: 'Show me how' } };
    if (/can you|what.*(?:do|are)|\bai\b|assistant/.test(lower)) return { text: 'I am Pip, a free built-in helper, not a general AI chatbot. I can explain Mystic, open a tutorial, and find files you have added. Try "send report.pdf", "send all photos", or "how do I receive files?"' };
    return { text: 'I can help with sending, receiving, rooms, or folders. Try "how do I send files?" or "send report.pdf" for a file you have added.', action: { type: 'view', view: 'help', label: 'Open help' } };
}
