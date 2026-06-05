import Component from '../Component.js';

export default class SessionSummary extends Component {
    template() {
        const session = this.props.store.state.session || {};
        const ui = this.props.store.state.ui || {};
        const roomId = session.roomId || 'Not set';
        const role = session.role || 'idle';
        const peers = session.peers || 0;
        const status = ui.connectionStatus || 'idle';

        return `
      <div class="stat-grid">
        <div class="stat">
          <span class="stat-label">Room</span>
          <span class="stat-value">${roomId}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Role</span>
          <span class="stat-value">${this.formatRole(role)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Peers</span>
          <span class="stat-value">${peers}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Status</span>
          <span class="stat-value">${this.formatStatus(status)}</span>
        </div>
      </div>
      <div class="session-actions-footer" style="margin-top: 10px; display: flex; gap: 8px;">
        <button class="btn btn-small" data-action="export">Export Session</button>
        <button class="btn btn-small btn-danger" data-action="clear">Clear History</button>
      </div>
    `;
    }

    formatRole(role) {
        if (role === 'host') return 'Host';
        if (role === 'guest') return 'Guest';
        return 'Idle';
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

    events() {
        return [
            { type: 'click', selector: '[data-action="export"]', handler: this.handleExport },
            { type: 'click', selector: '[data-action="clear"]', handler: this.handleClear }
        ];
    }

    handleExport() {
        if (typeof this.props.onExport === 'function') {
            this.props.onExport();
        }
    }

    handleClear() {
        if (typeof this.props.onClear === 'function') {
            this.props.onClear();
        }
    }
}
