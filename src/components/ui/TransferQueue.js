import Component from '../Component.js';

export default class TransferQueue extends Component {
    template() {
        const transfers = this.props.store.state.transfers || [];
        if (transfers.length === 0) {
            return `<div class="queue-empty">No active transfers yet. Drop a file to begin.</div>`;
        }

        const items = transfers.map((transfer) => this.renderItem(transfer)).join('');
        return `<div class="transfer-queue">${items}</div>`;
    }

    renderItem(transfer) {
        const progress = Math.min(100, Math.max(0, Math.round(transfer.progress || 0)));
        const status = transfer.status || 'queued';
        const direction = transfer.direction || 'send';
        const statusLabel = this.formatStatus(status);
        const directionLabel = direction === 'receive' ? 'Receiving' : 'Sending';
        const sizeLabel = transfer.size ? this.formatBytes(transfer.size) : 'Unknown size';
        const speedLabel = transfer.speed ? `${this.formatBytes(transfer.speed)}/s` : '0 B/s';

        return `
      <div class="transfer-card">
        <div class="transfer-header">
          <div>
            <div class="transfer-name">${transfer.name || 'Untitled file'}</div>
            <div class="transfer-sub">${directionLabel} • ${sizeLabel}</div>
          </div>
          <span class="transfer-status status-${status}">${statusLabel}</span>
        </div>
        <div class="transfer-progress">
          <div class="transfer-progress-bar" style="width: ${progress}%;"></div>
        </div>
        <div class="transfer-footer">
          <span>${progress}%</span>
          <span>${speedLabel}</span>
        </div>
      </div>
    `;
    }

    formatStatus(status) {
        switch (status) {
            case 'sending':
                return 'Sending';
            case 'receiving':
                return 'Receiving';
            case 'complete':
                return 'Complete';
            case 'failed':
                return 'Failed';
            default:
                return 'Queued';
        }
    }

    formatBytes(bytes) {
        if (!bytes || Number.isNaN(bytes)) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }
}
