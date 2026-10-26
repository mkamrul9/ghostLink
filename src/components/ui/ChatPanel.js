import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export default class ChatPanel extends Component {
    static watch = ['chat', 'ui', 'session'];
    template() {
        const { chat, ui, session } = this.props.store.state;
        const messages = chat.filter(message => message.roomId === session.roomId);
        const connected = ui.dataChannelStatus === 'open';
        return `<div class="chat-panel"><div class="chat-list" role="log" aria-label="Messages" aria-live="polite">${messages.length ? messages.map(message => `<div class="chat-message ${message.origin === 'self' ? 'self' : 'peer'}"><div class="chat-meta"><span>${escapeHtml(message.origin === 'self' ? 'You' : message.author || 'Other device')}</span><span>${new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div class="chat-bubble">${escapeHtml(message.text)}</div></div>`).join('') : `<p class="empty-state">${connected ? 'Say hello to the other person.' : 'Connect another device to chat.'}</p>`}</div><form class="chat-form"><input aria-label="Message" data-preserve="chat" class="chat-input" type="text" placeholder="Write a message" maxlength="500" ${connected ? '' : 'disabled'} /><button class="btn btn-primary" type="submit" aria-label="Send message" ${connected ? '' : 'disabled'}>${icon('arrow')}</button></form></div>`;
    }
    events() { return [{ type: 'submit', selector: 'form', handler: event => { event.preventDefault(); const input = this.element.querySelector('input'); const text = input.value.trim(); if (!text || this.props.store.state.ui.dataChannelStatus !== 'open') return; input.value = ''; this.props.onSend(text); } }]; }
}
