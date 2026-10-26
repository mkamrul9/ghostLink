import { safePath } from './FileLibrary.js';
const table = Uint32Array.from({ length: 256 }, (_, value) => { for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0; });
const LIMIT32 = 0xffffffff;
export function archivePath(path) {
    return safePath(path).split('/').map(part => { let value = part.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '') || 'unnamed'; if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = '_' + value; return value; }).join('/');
}
function buffer(size) { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)]; }
function u64(view, offset, value) { view.setBigUint64(offset, BigInt(value), true); }
async function* entryChunks(entry) {
    if (entry.directory) return;
    if (entry.getChunks) { yield* entry.getChunks(); return; }
    const blob = await entry.getBlob(), reader = blob.stream().getReader();
    try { while (true) { const { done, value } = await reader.read(); if (done) break; yield value; } } finally { reader.releaseLock(); }
}
export async function* createZipStream(entries) {
    if (!entries.length) throw new Error('Choose files or folders first.');
    const centralRecords = [], names = new Set(); let offset = 0;
    for (const entry of entries) {
        if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('Invalid file size.');
        const path = archivePath(entry.path) + (entry.directory ? '/' : '');
        if (names.has(path.toLowerCase())) throw new Error('Two files have the same folder path. Rename one before downloading.');
        names.add(path.toLowerCase());
        const name = new TextEncoder().encode(path); if (name.length > 65535) throw new Error('A folder path is too long for ZIP.');
        const large = entry.size >= LIMIT32, extraSize = large ? 20 : 0;
        const [local, localView] = buffer(30 + name.length + extraSize);
        localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, large ? 45 : 20, true); localView.setUint16(6, 0x808, true); localView.setUint16(12, 0x21, true);
        if (large) { localView.setUint32(18, LIMIT32, true); localView.setUint32(22, LIMIT32, true); }
        localView.setUint16(26, name.length, true); localView.setUint16(28, extraSize, true); local.set(name, 30);
        if (large) { const start = 30 + name.length; localView.setUint16(start, 1, true); localView.setUint16(start + 2, 16, true); u64(localView, start + 4, entry.size); u64(localView, start + 12, entry.size); }
        const localOffset = offset; yield local; offset += local.length;
        let crc = 0xffffffff, size = 0;
        for await (const chunk of entryChunks(entry)) { size += chunk.length; for (const byte of chunk) crc = table[(crc ^ byte) & 255] ^ crc >>> 8; yield chunk; offset += chunk.length; }
        if (size !== entry.size) throw new Error('A file changed while preparing the download. Try again.');
        crc = (crc ^ 0xffffffff) >>> 0;
        const [descriptor, descriptorView] = buffer(large ? 24 : 16); descriptorView.setUint32(0, 0x08074b50, true); descriptorView.setUint32(4, crc, true);
        if (large) { u64(descriptorView, 8, size); u64(descriptorView, 16, size); } else { descriptorView.setUint32(8, size, true); descriptorView.setUint32(12, size, true); }
        yield descriptor; offset += descriptor.length;
        const largeOffset = localOffset >= LIMIT32, centralExtraLength = (large ? 16 : 0) + (largeOffset ? 8 : 0);
        const [central, centralView] = buffer(46 + name.length + (centralExtraLength ? centralExtraLength + 4 : 0));
        centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 45, true); centralView.setUint16(6, large || largeOffset ? 45 : 20, true); centralView.setUint16(8, 0x808, true); centralView.setUint16(14, 0x21, true); centralView.setUint32(16, crc, true);
        centralView.setUint32(20, large ? LIMIT32 : size, true); centralView.setUint32(24, large ? LIMIT32 : size, true); centralView.setUint16(28, name.length, true); centralView.setUint16(30, centralExtraLength ? centralExtraLength + 4 : 0, true); centralView.setUint32(38, entry.directory ? 0x10 : 0, true); centralView.setUint32(42, largeOffset ? LIMIT32 : localOffset, true); central.set(name, 46);
        if (centralExtraLength) { let position = 46 + name.length; centralView.setUint16(position, 1, true); centralView.setUint16(position + 2, centralExtraLength, true); position += 4; if (large) { u64(centralView, position, size); u64(centralView, position + 8, size); position += 16; } if (largeOffset) u64(centralView, position, localOffset); }
        centralRecords.push(central);
    }
    const directoryOffset = offset, directorySize = centralRecords.reduce((sum, item) => sum + item.length, 0);
    for (const record of centralRecords) { yield record; offset += record.length; }
    const zip64 = entries.length >= 65535 || directoryOffset >= LIMIT32 || directorySize >= LIMIT32;
    if (zip64) {
        const [end64, view] = buffer(56); view.setUint32(0, 0x06064b50, true); u64(view, 4, 44); view.setUint16(12, 45, true); view.setUint16(14, 45, true); u64(view, 24, entries.length); u64(view, 32, entries.length); u64(view, 40, directorySize); u64(view, 48, directoryOffset); yield end64;
        const [locator, location] = buffer(20); location.setUint32(0, 0x07064b50, true); u64(location, 8, offset); location.setUint32(16, 1, true); yield locator;
    }
    const [end, view] = buffer(22); view.setUint32(0, 0x06054b50, true); view.setUint16(8, zip64 ? 65535 : entries.length, true); view.setUint16(10, zip64 ? 65535 : entries.length, true); view.setUint32(12, zip64 ? LIMIT32 : directorySize, true); view.setUint32(16, zip64 ? LIMIT32 : directoryOffset, true); yield end;
}
export async function createZip(entries, { maxBytes = 256 * 1024 * 1024 } = {}) {
    if (entries.reduce((sum, item) => sum + item.size, 0) > maxBytes) throw new Error('Use direct saving in a supported browser for this large folder.');
    const chunks = []; for await (const chunk of createZipStream(entries)) chunks.push(chunk); return new Blob(chunks, { type: 'application/zip' });
}
