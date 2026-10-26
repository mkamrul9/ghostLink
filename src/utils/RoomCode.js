const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function createRoomCode() {
    const characters = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => alphabet[byte & 31]).join('');
    return characters.match(/.{4}/g).join('-');
}
export function normalizeRoomCode(value) {
    const canonical = value.trim().toUpperCase().replaceAll('O', '0').replace(/[IL]/g, '1');
    return /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(canonical) ? canonical : value.trim();
}
