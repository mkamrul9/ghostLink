import { digest, utf8 } from './LocalCrypto.js';
// A bounded lookup hint, never used as proof that file contents match.
// Resume validates the entire saved prefix; completion verifies full SHA-256.
export async function fileIdentity(file) {
    const pieces = [utf8(JSON.stringify([file.size, Boolean(file.mysticDirectory)]))];
    for (const offset of new Set([0, Math.max(0, Math.floor(file.size / 2) - 32768), Math.max(0, file.size - 65536)])) pieces.push(new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer()));
    const joined = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
    let offset = 0; for (const piece of pieces) { joined.set(piece, offset); offset += piece.length; }
    return digest(joined);
}
