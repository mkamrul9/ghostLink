// Cache only the public application shell. File streams, room messages,
// connection credentials and user content never enter this cache.
importScripts('/pwa-assets.js');
self.addEventListener('install',event=>event.waitUntil(caches.open(MYSTIC_CACHE).then(cache=>cache.addAll(MYSTIC_ASSETS))));
const downloads = new Map();
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('mystic-shell-') && key!==MYSTIC_CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message', event => {
    const data = event.data, port = event.ports[0];
    if(data?.type==='MYSTIC_UPDATE' && event.source?.url && new URL(event.source.url).origin===self.location.origin){event.waitUntil(self.skipWaiting());return;}
    if (data?.type !== 'MYSTIC_SAVE' || !port || !data.stream || !/^[0-9a-f-]{36}$/.test(data.token || '') || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
    const name = String(data.name || 'Mystic-file').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g, '_').slice(0, 255);
    const path = `/local-download/${data.token}`;
    const timer = setTimeout(() => { const entry = downloads.get(path); if (entry) { downloads.delete(path); entry.stream.cancel().catch(() => {}); } }, 30000);
    downloads.set(path, {stream:data.stream, name, timer});
    port.postMessage({type:'READY', path}); port.close();
});
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/local-download/')) return;
    const entry = downloads.get(url.pathname);
    if (!entry || event.request.method !== 'GET') { event.respondWith(new Response('This download has expired. Start it again in Mystic.', {status:404})); return; }
    downloads.delete(url.pathname); clearTimeout(entry.timer);
    const encoded = encodeURIComponent(entry.name).replace(/['()*]/g, value=>`%${value.charCodeAt(0).toString(16)}`);
    event.respondWith(new Response(entry.stream, {headers:{
        'Content-Type':'application/octet-stream',
        'Content-Disposition':`attachment; filename*=UTF-8''${encoded}`,
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'", 'Cross-Origin-Resource-Policy':'same-origin'
    }}));
});

const appRoutes=new Set(['/','/messages','/received','/transfers','/help','/settings']);
self.addEventListener('fetch',event=>{
    const url=new URL(event.request.url);
    if(url.origin!==self.location.origin || event.request.method!=='GET' || url.pathname.startsWith('/local-download/'))return;
    const path=event.request.mode==='navigate' && appRoutes.has(url.pathname)?'/index.html':url.pathname;
    if(!MYSTIC_ASSETS.includes(path))return;
    event.respondWith(caches.open(MYSTIC_CACHE).then(async cache=>(await cache.match(path)) || fetch(event.request)));
});
