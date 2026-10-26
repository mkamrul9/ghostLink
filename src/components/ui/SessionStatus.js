import Component from '../Component.js';
export default class SessionStatus extends Component {
    static watch = ['ui'];
    template() {
        const status = this.props.store.state.ui.connectionStatus;
        const label = { idle: 'Not connected', connecting: 'Connecting...', waiting: 'Waiting for another device', connected: 'Device connected', disconnected: 'Disconnected', failed: 'Could not connect' }[status] || 'Not connected';
        return `<div class="session-status" role="status"><span class="status-pill status-${status}"><span class="status-dot"></span>${label}</span></div>`;
    }
}
