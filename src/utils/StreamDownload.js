let registration;
export function prepareStreamDownloads() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker || typeof TransformStream === 'undefined') return Promise.resolve(null);
    return registration ||= navigator.serviceWorker.register('/download-worker.js', {scope:'/',updateViaCache:'none'}).then(async () => navigator.serviceWorker.ready).catch(() => null);
}
export async function streamBrowserDownload({name, source}) {
    const registration = await prepareStreamDownloads();
    if (!registration?.active) return false;
    const stream = new TransformStream(), channel = new MessageChannel(), token = crypto.randomUUID();
    let timer;
    const ready = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('The browser could not start a streaming download. Try Chrome or Edge on a computer.')), 10000);
        channel.port1.onmessage = ({data}) => { clearTimeout(timer); data?.type === 'READY' && data.path === `/local-download/${token}` ? resolve(data.path) : reject(new Error('Invalid local download response.')); };
    });
    ready.catch(()=>{});
    try { registration.active.postMessage({type:'MYSTIC_SAVE',token,name,stream:stream.readable}, [stream.readable, channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); channel.port2.close(); return false; }
    let frame;
    try {
        const path = await ready;
        frame = document.createElement('iframe'); frame.hidden = true; frame.src = path; document.body.appendChild(frame);
        const writer = stream.writable.getWriter();
        try { for await (const chunk of source()) await writer.write(chunk); await writer.close(); }
        catch (error) { await writer.abort(error).catch(()=>{}); throw error || new DOMException('Download cancelled.', 'AbortError'); }
        return true;
    } finally { clearTimeout(timer); channel.port1.close(); if(frame)setTimeout(()=>frame.remove(),60000); }
}
