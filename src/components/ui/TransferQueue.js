import Component from '../Component.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
export default class TransferQueue extends Component {
    static watch = ['transfers', 'ui'];
    template() {
        const { transfers, ui } = this.props.store.state;
        if (!transfers.length) return '<div class="queue-empty"><strong>A clear runway.</strong><p>Your transfer activity will appear here.</p></div>';
        return `<div class="transfer-queue">${[...transfers].reverse().map(transfer => {
            const progress = Math.min(100, Math.max(0, Math.round(transfer.progress || 0)));
            const status = ['sending', 'receiving', 'complete', 'failed', 'cancelled', 'interrupted', 'queued'].includes(transfer.status) ? transfer.status : 'queued';
            const active = ['sending', 'receiving'].includes(status);
            const cancellable = active || status === 'queued';
            return `<article class="transfer-card">
                <div class="transfer-header"><div class="transfer-info"><div class="transfer-name">${escapeHtml(transfer.name)}</div><div class="transfer-sub">${transfer.direction === 'receive' ? 'Received' : 'Sent'} Â· ${formatBytes(transfer.size)}</div></div><span class="transfer-status status-${status}">${status}</span></div>
                <div class="transfer-progress" role="progressbar" aria-label="${escapeHtml(transfer.name)} progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="transfer-progress-bar" style="width:${progress}%"></div></div>
                <div class="transfer-footer"><span>${progress}%</span><span>${active ? formatBytes(transfer.speed || 0) + '/s' : status === 'complete' ? 'Delivered' : status === 'queued' ? 'Waiting' : 'Stopped'}</span></div>
                ${transfer.error ? `<p class="inline-error">${escapeHtml(transfer.error)}</p>` : ''}
                <div class="transfer-actions">${cancellable ? `<button class="btn btn-small" data-action="cancel" data-id="${transfer.id}">Cancel</button>` : ''}${['failed', 'cancelled', 'interrupted'].includes(status) && transfer.direction === 'send' && this.props.canRetry(transfer.id) ? `<button class="btn btn-small" data-action="retry" data-id="${transfer.id}" ${ui.dataChannelStatus === 'open' ? '' : 'disabled'}>Retry</button>` : ''}${status === 'complete' && transfer.direction === 'receive' ? `<button class="btn btn-small" data-action="download" data-id="${transfer.id}">Download</button>` : ''}</div>
            </article>`;
        }).join('')}</div>`;
    }
    events() { return [{ type: 'click', selector: '[data-action]', handler: e => this.props.onAction(e.currentTarget.dataset.action, Number(e.currentTarget.dataset.id)) }]; }
}
