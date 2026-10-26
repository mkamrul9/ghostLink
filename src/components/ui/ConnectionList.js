import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export default class ConnectionList extends Component {
    static watch = ['peers'];
    template() {
        const peers = this.props.store.state.peers;
        return `<div class="connections-list">${peers.length ? peers.map(peer => `<div class="connection-card"><div class="connection-name">${escapeHtml(peer.roomId)}</div><div class="connection-meta">${new Date(peer.lastSeen).toLocaleString()}</div><div class="connection-actions"><span class="connection-status">${peer.status === 'online' ? 'Connected' : 'Not connected'}</span><button class="btn btn-small" data-room="${escapeHtml(peer.roomId)}">${icon('refresh')}Join again</button></div></div>`).join('') : '<p class="muted">No recent rooms.</p>'}</div>`;
    }
    events() { return [{ type: 'click', selector: '[data-room]', handler: event => this.props.onReconnect(event.currentTarget.dataset.room) }]; }
}
