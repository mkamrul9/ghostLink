import { escapeHtml } from './format.js';
import { icon } from './icons.js';
export function inviteUrl(room, base = location.href) {
    const url = new URL(base); url.pathname = '/'; url.search = ''; url.hash = new URLSearchParams({ room }).toString(); return url.href;
}
export function shareTargets(room, url) {
    const message = `Join my Mystic room: ${room}\n${url}`;
    return [
        { label: 'WhatsApp', icon: 'chat', url: `https://wa.me/?text=${encodeURIComponent(message)}` },
        { label: 'Telegram', icon: 'chat', url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Mystic room: ${room}`)}` },
        { label: 'Email', icon: 'mail', url: `mailto:?subject=${encodeURIComponent('Join my Mystic room')}&body=${encodeURIComponent(message)}` }
    ];
}
export function showShareRoom(room, toast) {
    const url = inviteUrl(room);
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog share-dialog'; dialog.setAttribute('aria-label', 'Share room');
    dialog.innerHTML = `<div class="drawer-heading"><h2>Share room</h2><button class="icon-button" data-close aria-label="Close sharing">${icon('close')}</button></div><label>Room code<input readonly value="${escapeHtml(room)}" /></label><label>Invite link<input readonly value="${escapeHtml(url)}" /></label><div class="share-copy-actions"><button class="btn" data-copy="code">${icon('copy')}Copy code</button><button class="btn" data-copy="link">${icon('link')}Copy link</button></div><div class="share-targets">${shareTargets(room, url).map(target => `<a class="btn" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">${icon(target.icon)}${target.label}</a>`).join('')}</div>${navigator.share ? `<button class="btn btn-primary native-share">${icon('share')}More apps</button>` : ''}${['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? '<p class="muted">This is a local preview. Use the published website to connect another device.</p>' : '<p class="muted">Share this invite only with the person you want to connect.</p>'}`;
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.oncancel = event => { event.preventDefault(); close(); }; dialog.querySelector('[data-close]').onclick = close;
    dialog.querySelectorAll('[data-copy]').forEach(button => { button.onclick = async () => {
        try { await navigator.clipboard.writeText(button.dataset.copy === 'code' ? room : url); toast.show(button.dataset.copy === 'code' ? 'Room code copied.' : 'Invite link copied.', 'success'); }
        catch { toast.show('Select the text above and copy it.', 'info'); }
    }; });
    const native = dialog.querySelector('.native-share');
    if (native) native.onclick = async () => { try { await navigator.share({ title: 'Mystic room', text: `Join my room: ${room}`, url }); } catch (error) { if (error.name !== 'AbortError') toast.show('Choose an app above, or copy the invite link.', 'info'); } };
    document.body.appendChild(dialog); dialog.showModal();
    return dialog;
}
