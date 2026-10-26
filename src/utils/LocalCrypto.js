export const utf8 = value => new TextEncoder().encode(value);
export const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
export async function digest(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', value))); }
export async function passwordKey(password, salt, iterations = 600000) {
    const material = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealBytes(key, bytes, context) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(context) }, key, bytes);
    return { iv: [...iv], cipher };
}
export function openBytes(key, record, context) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv), additionalData: utf8(context) }, key, record.cipher); }
export async function serializeMetadata(metadata) {
    const result = { ...metadata };
    if (result.cryptoKey) { result.rawKey = [...new Uint8Array(await crypto.subtle.exportKey('raw', result.cryptoKey))]; delete result.cryptoKey; }
    return result;
}
export async function deserializeMetadata(metadata) {
    const result = { ...metadata };
    if (result.rawKey) {
        result.cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(result.rawKey), 'AES-GCM', true, ['encrypt', 'decrypt']);
        delete result.rawKey;
    }
    return result;
}
