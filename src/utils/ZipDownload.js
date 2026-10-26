import { safePath } from './FileLibrary.js';
const table = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    return value >>> 0;
});
async function checksum(blob) {
    let crc = 0xffffffff;
    const reader = blob.stream().getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const byte of value) crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
        }
    } finally { reader.releaseLock(); }
    return (crc ^ 0xffffffff) >>> 0;
}
function archivePath(path) {
    return safePath(path).split('/').map(part => {
        let value = part.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '') || 'unnamed';
        if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = '_' + value;
        return value;
    }).join('/');
}
export async function createZip(entries, { maxBytes = 268435456 } = {}) {
    if (!entries.length || entries.length > 500) throw new Error('Choose between 1 and 500 files.');
    if (entries.reduce((sum, item) => sum + item.size, 0) > maxBytes) throw new Error('Choose fewer files for this folder download (256 MB maximum).');
    const pieces = [], directory = [], names = new Set();
    let offset = 0;
    for (const entry of entries) {
        const path = archivePath(entry.path);
        if (names.has(path.toLowerCase())) throw new Error('Two files have the same folder path. Rename one before downloading.');
        names.add(path.toLowerCase());
        const name = new TextEncoder().encode(path);
        const blob = await entry.getBlob();
        if (blob.size !== entry.size) throw new Error('A file changed while preparing the download. Try again.');
        const crc = await checksum(blob);
        const local = new Uint8Array(30 + name.length), localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x800, true);
        localView.setUint16(12, 0x21, true); localView.setUint32(14, crc, true);
        localView.setUint32(18, blob.size, true); localView.setUint32(22, blob.size, true); localView.setUint16(26, name.length, true);
        local.set(name, 30);
        const central = new Uint8Array(46 + name.length), centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x800, true);
        centralView.setUint16(14, 0x21, true); centralView.setUint32(16, crc, true);
        centralView.setUint32(20, blob.size, true); centralView.setUint32(24, blob.size, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true);
        central.set(name, 46);
        pieces.push(local, blob); directory.push(central);
        offset += local.byteLength + blob.size;
    }
    const directorySize = directory.reduce((sum, item) => sum + item.byteLength, 0);
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true);
    view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
    return new Blob([...pieces, ...directory, end], { type: 'application/zip' });
}
