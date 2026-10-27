import { pathToFileURL } from 'node:url';
export async function inspectDeployment(base,{allowHttp=false,requireRelay=false,fetcher=fetch}={}) {
    const url=new URL(base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP(S) application URL without credentials.');
    const checks=[];
    checks.push({id:'https',ok:url.protocol==='https:'||allowHttp,detail:url.protocol==='https:'?'HTTPS URL supplied':allowHttp?'HTTP allowed for this explicit local check':'Production requires HTTPS'});
    const request=async path=>fetcher(new URL(path,url.origin),{signal:AbortSignal.timeout(10000),redirect:'follow'});
    try {
        const health=await request('/healthz');checks.push({id:'health',ok:health.ok&&(await health.json()).status==='ok',detail:'Health endpoint responds'});
        const page=await request('/');const html=await page.text();checks.push({id:'app',ok:page.ok&&html.includes('<title>Mystic'),detail:'Mystic application is served'});
        checks.push({id:'headers',ok:page.headers.get('x-content-type-options')==='nosniff'&&Boolean(page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")),detail:'Content security and MIME protections are present'});
        if(url.protocol==='https:')checks.push({id:'hsts',ok:Boolean(page.headers.get('strict-transport-security')),detail:'HTTPS origin sends HSTS'});
        const response=await request('/api/config'),config=await response.json();
        const valid=Array.isArray(config.iceServers)&&config.iceServers.every(server=>{const urls=Array.isArray(server.urls)?server.urls:[server.urls];return urls.length>0&&urls.every(value=>typeof value==='string'&&/^(stun|stuns|turn|turns):\S+$/.test(value));})&&Number.isSafeInteger(config.maxFileSize)&&config.maxFileSize>0&&Number.isInteger(config.maxRoomPeers)&&config.maxRoomPeers>=2&&config.maxRoomPeers<=8;
        checks.push({id:'configuration',ok:response.ok&&valid,detail:'Public client settings are valid'});
        const relay=config.iceServers?.some(server=>(Array.isArray(server.urls)?server.urls:[server.urls]).some(value=>/^turns?:/.test(value||'')));
        checks.push({id:'relay',ok:!requireRelay||Boolean(relay),detail:relay?'Relay is configured; cross-network transfer still needs testing':requireRelay?'A relay is required but not configured':'Direct-only configuration; relay was not required for this check'});
        for(const path of ['/index.js','/utils/LocalFolderLibrary.js','/utils/Pwa.js','/components/ui/ChatPanel.js','/manifest.webmanifest','/pwa-assets.js','/assets/mystic-192.png','/assets/mystic-512.png','/download-worker.js']){const asset=await request(path);checks.push({id:path,ok:asset.ok&&(asset.headers.get('content-type')||'').includes(path.endsWith('.png')?'image/png':path.endsWith('.webmanifest')?'application/manifest+json':'javascript'),detail:'Client asset is available'});}
        for(const path of ['/.env','/.git/config','/server.js']){const hidden=await request(path);checks.push({id:path,ok:hidden.status===404,detail:'Private server resource is not served'});}
    }catch(error){checks.push({id:'request',ok:false,detail:`Deployment request failed (${error.name || 'Error'})`});}
    return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    const args=process.argv.slice(2),base=args.find(value=>!value.startsWith('--'));
    if(!base){console.error('Usage: npm run check:deployment -- https://your-site.example [--require-relay] [--allow-http]');process.exitCode=1;}
    else try{const checks=await inspectDeployment(base,{allowHttp:args.includes('--allow-http'),requireRelay:args.includes('--require-relay')});for(const check of checks)console.log(`${check.ok?'PASS':'FAIL'} ${check.id}: ${check.detail}`);process.exitCode=checks.every(check=>check.ok)?0:1;}catch(error){console.error(error.message);process.exitCode=1;}
}
