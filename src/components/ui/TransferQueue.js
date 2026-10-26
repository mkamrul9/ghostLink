import Component from '../Component.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export default class TransferQueue extends Component {
    static watch = ['transfers', 'ui'];
    template() {
        const { transfers, ui } = this.props.store.state;
        if (!transfers.length) return '<div class="queue-empty">No transfers yet.</div>';
        return `<div class="transfer-queue">${[...transfers].reverse().map(transfer => {
            const progress = Math.min(100, Math.max(0, Math.round(transfer.progress || 0)));
            const status = ['queued', 'sending', 'receiving', 'complete', 'failed', 'cancelled', 'interrupted'].includes(transfer.status) ? transfer.status : 'queued';
            const active = ['sending', 'receiving'].includes(status);
            const label = { queued: 'Waiting', sending: 'Sending', receiving: 'Receiving', complete: 'Done', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Stopped' }[status];
            return `<article class="transfer-card"><div class="transfer-header"><div class="transfer-info"><div class="transfer-name">${escapeHtml(transfer.name)}</div><div class="transfer-sub">${transfer.direction === 'receive' ? 'From' : 'To'} ${escapeHtml(transfer.peerName || 'other device')} &middot; ${formatBytes(transfer.size)}${transfer.relativePath && transfer.relativePath !== transfer.name ? `<br>${escapeHtml(transfer.relativePath)}` : ''}</div></div><span class="transfer-status status-${status}">${label}</span></div><div class="transfer-progress" role="progressbar" aria-label="${escapeHtml(transfer.name)} progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="transfer-progress-bar" style="width:${progress}%"></div></div><div class="transfer-footer"><span>${progress}%</span><span>${active ? formatBytes(transfer.speed || 0) + '/s' : ''}</span></div>${transfer.verified ? `<div class="verified-note">${icon('check')}Verified match${transfer.resumedBytes ? ' - resumed saved data' : ''}</div>` : ''}${transfer.phase ? `<p class="muted">${escapeHtml(transfer.phase)}</p>` : ''}${transfer.error ? `<p class="inline-error">${escapeHtml(transfer.error)}</p>` : ''}<div class="transfer-actions">${status === 'complete' && transfer.verified ? `<button class="btn btn-small" data-action="receipt" data-id="${transfer.id}">${icon('check')}Receipt</button>` : ''}${active || status === 'queued' ? `<button class="btn btn-small" data-action="cancel" data-id="${transfer.id}">${icon('close')}Cancel</button>` : ''}${['failed', 'cancelled', 'interrupted'].includes(status) && transfer.direction === 'send' && this.props.canRetry(transfer.id) ? `<button class="btn btn-small" data-action="retry" data-id="${transfer.id}" ${ui.dataChannelStatus === 'open' ? '' : 'disabled'}>${icon('refresh')}Resume</button>` : ''}${status === 'complete' && transfer.direction === 'receive' ? `<button class="btn btn-small" data-action="download" data-id="${transfer.id}">${icon('download')}Download</button>` : ''}</div></article>`;
        }).join('')}</div>`;
    }
    events() { return [{ type: 'click', selector: '[data-action]', handler: event => this.props.onAction(event.currentTarget.dataset.action, Number(event.currentTarget.dataset.id)) }]; }
}
