// Legacy packet format (Phase 1-6):
// Bytes 0-3 : File ID (4 bytes)
// Bytes 4-7 : Chunk Index (4 bytes)
// Bytes 8+  : Raw file chunk data
// Legacy header size (two 32-bit integers)
const LEGACY_HEADER_SIZE = 8;

// Phase 7 encrypted packet format:
// Bytes 0-3  : File ID (4 bytes)
// Bytes 4-7  : Chunk Index (4 bytes)
// Bytes 8-19 : AES-GCM IV (12 bytes)
// Bytes 20+  : Encrypted file chunk payload
const METADATA_SIZE = 8; // File ID + Chunk Index
const IV_SIZE = 12;      // AES-GCM IV
const HEADER_SIZE = METADATA_SIZE + IV_SIZE; // Total 20 bytes

/**
 * Legacy: Packs metadata and raw file chunk into a single ArrayBuffer.
 * Kept for backward compatibility with existing code.
 */
export function packChunk(fileId, chunkIndex, chunkBuffer) {
    const totalLength = LEGACY_HEADER_SIZE + chunkBuffer.byteLength;
    const packetBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(packetBuffer);
    view.setUint32(0, fileId, false);
    view.setUint32(4, chunkIndex, false);
    const payloadView = new Uint8Array(packetBuffer, LEGACY_HEADER_SIZE);
    const sourceView = new Uint8Array(chunkBuffer);
    payloadView.set(sourceView);
    return packetBuffer;
}

/**
 * Legacy: Unpacks the packet back into metadata and the raw file chunk.
 */
export function unpackChunk(packetBuffer) {
    const view = new DataView(packetBuffer);
    const fileId = view.getUint32(0, false);
    const chunkIndex = view.getUint32(4, false);
    const chunkData = packetBuffer.slice(LEGACY_HEADER_SIZE);
    return { fileId, chunkIndex, chunkData };
}

/**
 * Phase 7: Packs metadata, IV and encrypted payload into a single ArrayBuffer.
 * @param {number} fileId
 * @param {number} chunkIndex
 * @param {Uint8Array} iv - 12-byte initialization vector
 * @param {ArrayBuffer} encryptedBuffer - Encrypted payload
 * @returns {ArrayBuffer}
 */
export function packEncryptedChunk(fileId, chunkIndex, iv, encryptedBuffer) {
    if (!Number.isInteger(fileId) || fileId < 0 || fileId > 0xffffffff || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffffffff || iv.byteLength !== 12) throw new Error('Invalid packet header.');
    const totalLength = HEADER_SIZE + encryptedBuffer.byteLength;
    const packetBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(packetBuffer);

    // 1. Write Metadata
    view.setUint32(0, fileId, false);
    view.setUint32(4, chunkIndex, false);

    // 2. Write the IV (starts at byte 8)
    const packetUint8 = new Uint8Array(packetBuffer);
    packetUint8.set(iv, METADATA_SIZE);

    // 3. Write the Encrypted Payload (starts at byte 20)
    const payloadView = new Uint8Array(encryptedBuffer);
    packetUint8.set(payloadView, HEADER_SIZE);

    return packetBuffer;
}

/**
 * Phase 7: Unpacks an encrypted packet into metadata, IV and encrypted payload.
 * @param {ArrayBuffer} packetBuffer
 * @returns {{fileId:number, chunkIndex:number, iv:Uint8Array, encryptedData:ArrayBuffer}}
 */
export function unpackEncryptedChunk(packetBuffer) {
    if (!(packetBuffer instanceof ArrayBuffer) || packetBuffer.byteLength < HEADER_SIZE + 16) throw new Error('Invalid encrypted packet.');
    const view = new DataView(packetBuffer);

    // 1. Extract Metadata (First 8 bytes)
    const fileId = view.getUint32(0, false);
    const chunkIndex = view.getUint32(4, false);

    // 2. Extract IV (Next 12 bytes)
    const packetUint8 = new Uint8Array(packetBuffer);
    const iv = packetUint8.slice(8, 20); // The 12-byte initialization vector

    // 3. Extract the Encrypted Payload (Byte 20 to the end)
    const encryptedPayload = packetBuffer.slice(20);

    return { fileId, chunkIndex, iv, encryptedPayload };
}