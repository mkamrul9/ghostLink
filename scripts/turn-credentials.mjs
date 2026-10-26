import { createHmac, randomUUID } from 'node:crypto';
export function turnCredentials({urls,secret,ttl=3600},now=Date.now()) {
    if(!Array.isArray(urls) || !urls.length || urls.some(url=>typeof url!=='string' || !/^turns?:[^\s]+$/i.test(url)))throw new Error('TURN_URLS must be a JSON array of turn: or turns: URLs.');
    if(typeof secret!=='string' || secret.length<32)throw new Error('TURN_SECRET must contain at least 32 characters.');
    if(!Number.isInteger(ttl) || ttl<300 || ttl>86400)throw new Error('TURN_TTL must be from 300 to 86400 seconds.');
    const expiresAt=Math.floor(now/1000)+ttl, username=`${expiresAt}:${randomUUID()}`;
    return { server:{urls,username,credential:createHmac('sha1',secret).update(username).digest('base64')}, expiresAt };
}
