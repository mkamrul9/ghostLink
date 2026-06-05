import Component from '../Component.js';

export default class ConnectionList extends Component {
    template() {
        const peers = this.props.store.state.peers || [];
        if (peers.length === 0) {
            return '<div class="connections-empty">No connections yet.</div>';
        }

        const items = peers.map((peer) => this.renderPeer(peer)).join('');
        return `<div class="connections-list">${items}</div>`;
    }

    renderPeer(peer) {
        const name = this.escapeHtml(peer.label || 'Peer');
        const roomId = this.escapeHtml(peer.roomId || '');
        const status = peer.status || 'offline';
        const lastSeen = peer.lastSeen ? this.formatTime(peer.lastSeen) : '—';

        return `
      <div class="connection-card">
        <div>
          <div class="connection-name">${name}</div>
          <div class="connection-meta">Room: ${roomId}</div>
          <div class="connection-meta">Last seen: ${lastSeen}</div>
        </div>
        <div class="connection-actions">
          <span class="connection-status status-${status}">${status}</span>
          <button class="btn btn-small" data-action="reconnect" data-room="${roomId}">Reconnect</button>
        </div>
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

    events() {
        return [
            { type: 'click', selector: '[data-action="reconnect"]', handler: this.handleReconnect }
        ];
    }

    handleReconnect(e) {
        const room = e.target.getAttribute('data-room');
        if (room && typeof this.props.onReconnect === 'function') {
            this.props.onReconnect(room);
        }
    }
}
