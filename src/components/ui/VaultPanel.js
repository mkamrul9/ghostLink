import Component from '../Component.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
export default class VaultPanel extends Component {
    static watch = ['vault'];
    template() {
        const files = this.props.store.state.vault || [];
        return `<div class="vault-content"><h2>Received. Kept local.</h2><p class="section-description">Download received files again, or delete them to free browser storage. Incomplete files can be removed and sent again.</p>${files.length ? `<div class="vault-list">${files.map(file => `<article class="vault-card"><div class="vault-file-info"><div class="vault-file-name">${escapeHtml(file.fileName)}</div><div class="vault-file-meta">${formatBytes(file.fileSize)} · ${file.complete ? 'Ready to download' : 'Incomplete'}${file.relativePath && file.relativePath !== file.fileName ? `<br>${escapeHtml(file.relativePath)}` : ''}</div></div><div class="vault-actions"><button class="btn btn-small" data-action="download" data-id="${file.fileId}" ${file.complete ? '' : 'disabled'}>Download</button><button class="btn btn-small btn-danger" data-action="delete" data-id="${file.fileId}">Delete</button></div></article>`).join('')}</div>` : '<div class="vault-empty">Your vault is empty. Files received from a peer will appear here.</div>'}</div>`;
    }
    events() { return [{ type: 'click', selector: '[data-action]', handler: e => this.props.onAction(e.currentTarget.dataset.action, Number(e.currentTarget.dataset.id)) }]; }
}
