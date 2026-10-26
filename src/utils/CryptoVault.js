/**
 * Generates a new, random AES-256-GCM key.
 * This key will eventually be shared with the receiver via a secure channel.
 */
export async function generateEncryptionKey() {
    return await crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true, // extractable (so we can export it to share with the peer later)
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts a raw ArrayBuffer payload.
 * @param {CryptoKey} key - The AES-GCM key.
 * @param {ArrayBuffer} chunkBuffer - The raw file chunk.
 * @returns {Promise<{iv: Uint8Array, encryptedBuffer: ArrayBuffer}>}
 */
export async function encryptChunk(key, chunkBuffer) {
    // AES-GCM requires a unique 12-byte Initialization Vector (IV) for every encryption operation
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Perform the actual encryption
    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        chunkBuffer
    );

    return { iv, encryptedBuffer };
}

/**
 * Imports a raw AES-GCM key (ArrayBuffer or Uint8Array) into a CryptoKey usable by SubtleCrypto.
 * @param {ArrayBuffer|Uint8Array} rawKey
 * @returns {Promise<CryptoKey>}
 */
export async function importKeyFromRaw(rawKey) {
    const keyData = rawKey;
    return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Decrypts an encrypted ArrayBuffer payload using AES-GCM.
 * @param {CryptoKey} key
 * @param {Uint8Array} iv
 * @param {ArrayBuffer} encryptedBuffer
 * @returns {Promise<ArrayBuffer>} decrypted plain ArrayBuffer
 */
export async function decryptChunk(key, iv, encryptedBuffer) {
    const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encryptedBuffer
    );
    return dec;
}