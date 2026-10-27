import { escapeHtml } from './format.js';
export const MESSAGE_LIMIT = 4000;
export function messageHtml(text) {
    return String(text).split(/(https?:\/\/[^\s<>]+)/gi).map((part,index) => {
        if (index % 2 === 0) return escapeHtml(part);
        try { const url = new URL(part); if (!['http:','https:'].includes(url.protocol)) return escapeHtml(part); }
        catch { return escapeHtml(part); }
        return `<a href="${escapeHtml(part)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(part)}</a>`;
    }).join('');
}
export function deliveryLabel(message) {
    const {delivery,deliveredCount=0,recipientCount=1}=message;
    if (delivery === 'delivered') return recipientCount === 1 ? 'Delivered' : `Delivered to ${deliveredCount} devices`;
    if (delivery === 'incomplete') return `Delivered ${deliveredCount} of ${recipientCount}. A device disconnected or could not receive it.`;
    if (delivery === 'unconfirmed') return 'Delivery unconfirmed';
    if (delivery === 'sent') return deliveredCount ? `Delivered ${deliveredCount} of ${recipientCount}` : 'Sent';
    return 'Sent';
}
