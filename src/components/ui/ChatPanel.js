import Component from '../Component.js';

export default class ChatPanel extends Component {
    template() {
        const messages = this.props.store.state.chat || [];
        const ui = this.props.store.state.ui || {};
        const channelStatus = ui.dataChannelStatus || 'closed';
        const canSend = channelStatus === 'open';
        const statusLabel = canSend ? 'Channel open' : 'Channel closed';
        const content = messages.length === 0
            ? '<div class="chat-empty">No messages yet. Say hello.</div>'
            : messages.map((message) => this.renderMessage(message)).join('');

        const banner = !canSend 
            ? '<div class="chat-banner offline">Connect to a peer to start chatting</div>' 
            : '';

        return `
      <div class="chat-panel">
        ${banner}
        <div class="chat-list">${content}</div>
        <div class="chat-status ${canSend ? 'online' : 'offline'}">${statusLabel}</div>
        <form class="chat-form">
          <input class="chat-input" type="text" placeholder="${canSend ? 'Type a message...' : 'Connect a peer to chat'}" maxlength="500" ${canSend ? '' : 'disabled'} />
          <button class="btn btn-chat" type="submit" ${canSend ? '' : 'disabled'}>Send</button>
        </form>
      </div>
    `;
    }

    events() {
        return [
            { type: 'submit', selector: '.chat-form', handler: this.handleSend }
        ];
    }

    handleSend(e) {
        e.preventDefault();
        const ui = this.props.store.state.ui || {};
        const canSend = ui.dataChannelStatus === 'open';
        if (!canSend) return;
        const input = this.element.querySelector('.chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        if (typeof this.props.onSend === 'function') {
            this.props.onSend(text);
        }
        input.value = '';
    }

    renderMessage(message) {
        const origin = message.origin || 'peer';
        const author = this.escapeHtml(message.author || (origin === 'self' ? 'You' : 'Peer'));
        const time = message.ts ? this.formatTime(message.ts) : '';
        const text = this.escapeHtml(message.text || '');

        return `
      <div class="chat-message ${origin}">
        <div class="chat-meta">
          <span>${author}</span>
          <span>${time}</span>
        </div>
        <div class="chat-bubble">${text}</div>
      </div>
    `;
    }

    formatTime(ts) {
        const date = new Date(ts);
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
