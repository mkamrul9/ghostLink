import Component from '../Component.js';

export default class SessionStatus extends Component {
    template() {
        const ui = this.props.store.state.ui || {};
        const session = this.props.store.state.session || {};
        const status = ui.connectionStatus || 'idle';
        const channel = ui.dataChannelStatus || 'closed';
        const roomId = session.roomId || 'No room';

        return `
      <div class="session-status">
        <span class="status-pill status-${status}">Status: ${this.formatStatus(status)}</span>
        <span class="status-sub">Room: ${roomId}</span>
        <span class="status-sub">Channel: ${this.formatChannel(channel)}</span>
      </div>
    `;
    }

    formatStatus(status) {
        switch (status) {
            case 'connecting':
                return 'Connecting';
            case 'connected':
                return 'Connected';
            case 'failed':
                return 'Failed';
            case 'disconnected':
                return 'Disconnected';
            default:
                return 'Idle';
        }
    }

    formatChannel(channel) {
        switch (channel) {
            case 'open':
                return 'Open';
            case 'connecting':
                return 'Opening';
            default:
                return 'Closed';
        }
    }
}
