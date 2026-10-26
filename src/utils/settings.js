export function defaultSignalUrl() {
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/signal`;
}
export function loadSettings() {
    try {
        return {
            username: localStorage.getItem('mystic_username') || localStorage.getItem('ghostlink_username') || 'Guest',
            signalUrl: localStorage.getItem('mystic_signalUrl') || defaultSignalUrl()
        };
    } catch { return { username: 'Guest', signalUrl: defaultSignalUrl() }; }
}
export function validateSignalUrl(value) {
    const url = new URL(value);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Enter a valid WebSocket URL.');
    if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('Use a secure wss:// URL with HTTPS.');
    return url.href;
}
