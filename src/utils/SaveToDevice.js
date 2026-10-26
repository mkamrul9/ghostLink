import { downloadBlob } from './format.js';
import { streamBrowserDownload } from './StreamDownload.js';
import { archivePath, archiveEntries } from './ZipDownload.js';
export const MEMORY_SAVE_LIMIT = 256 * 1024 * 1024;
async function writeStream({ name, size, source, type = 'application/octet-stream' }) {
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        // Choose the destination before any asynchronous reads, preserving user activation.
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const writer = await handle.createWritable();
        try { for await (const chunk of source()) await writer.write(chunk); await writer.close(); }
        catch (error) { await writer.abort().catch(() => {}); throw error; }
        return 'disk';
    }
    if (await streamBrowserDownload({name, source})) return 'stream';
    if (size > MEMORY_SAVE_LIMIT) throw new Error('This browser cannot save a file this large without loading it into memory. Use Chrome or Edge on a computer for direct saving.');
    const chunks = []; let bytes = 0;
    for await (const chunk of source()) { bytes += chunk.byteLength; if (bytes > MEMORY_SAVE_LIMIT + 16 * 1024 * 1024) throw new Error('This download is too large for this browser. Use direct saving on a computer.'); chunks.push(chunk); }
    downloadBlob(new Blob(chunks, { type }), name); return 'download';
}
async function writeFolder(entries) {
    entries = archiveEntries(entries);
    if (!window.showDirectoryPicker) throw new Error('Use Download selected to save these files as a ZIP in this browser.');
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    const parent = await root.getDirectoryHandle(`Mystic-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, { create: true });
    const paths = new Set();
    for (const entry of entries) {
        const path = archivePath(entry.path); if (paths.has(path.toLowerCase())) throw new Error('Two files have the same destination. Rename one first.'); paths.add(path.toLowerCase());
        const parts = path.split('/'); let directory = parent;
        for (const part of parts.slice(0, entry.directory ? undefined : -1)) directory = await directory.getDirectoryHandle(part, { create: true });
        if (entry.directory) continue;
        const file = await directory.getFileHandle(parts.at(-1), { create: true }), writer = await file.createWritable();
        try { for await (const chunk of entry.getChunks()) await writer.write(chunk); await writer.close(); }
        catch (error) { await writer.abort().catch(() => {}); throw error; }
    }
    return parent.name;
}

export let activeSaves = 0;
async function trackSave(action) {
    activeSaves++;
    if (typeof window !== 'undefined') window.dispatchEvent?.(new Event('mystic-save-state'));
    try { return await action(); }
    finally { activeSaves--; if (typeof window !== 'undefined') window.dispatchEvent?.(new Event('mystic-save-state')); }
}
export function saveStream(options) { return trackSave(() => writeStream(options)); }
export function saveFolderToDevice(entries) { return trackSave(() => writeFolder(entries)); }
