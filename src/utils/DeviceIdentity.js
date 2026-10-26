let fallback;
export function deviceIdentity() {
    try {
        let id = localStorage.getItem('mystic_device_id');
        if (!/^[0-9a-f-]{36}$/i.test(id || '')) { id = crypto.randomUUID(); localStorage.setItem('mystic_device_id', id); }
        return { id, name: (localStorage.getItem('mystic_username') || `Device ${id.slice(0,4)}`).slice(0, 40) };
    } catch { return fallback ||= { id: crypto.randomUUID(), name: 'Device' }; }
}
