import Component from '../Component.js';

export default class VaultPanel extends Component {
    initialState() {
        return {
            files: [],
            isLoading: true
        };
    }

    async onMount() {
        if (window.dbManager) {
            try {
                const metadata = await window.dbManager.getAllMetadata();
                this.setState({ files: metadata, isLoading: false });
            } catch (err) {
                console.error("Failed to load vault metadata", err);
                this.setState({ isLoading: false });
            }
        }
    }

    template() {
        if (this.state.isLoading) {
            return `<div class="vault-empty">Loading vault...</div>`;
        }

        if (!this.state.files || this.state.files.length === 0) {
            return `
                <div class="vault-empty">
                    <p>Your local vault is empty.</p>
                    <p style="color: var(--text-2); font-size: 0.85rem; margin-top: 8px;">Received files are stored securely in your browser's IndexedDB.</p>
                </div>
            `;
        }

        const listItems = this.state.files.map(file => {
            const sizeLabel = file.fileSize ? this.formatBytes(file.fileSize) : 'Unknown size';
            // Provide a download/reassemble button
            return `
                <div class="vault-card">
                    <div class="vault-file-info">
                        <div class="vault-file-name">${file.fileName}</div>
                        <div class="vault-file-meta">${file.totalChunks} chunks • ${sizeLabel}</div>
                    </div>
                    <div class="vault-actions">
                        <button class="btn btn-small" data-action="download" data-id="${file.fileId}">Download</button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="vault-list">
                ${listItems}
            </div>
        `;
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
        return `${value.toFixed(1)} ${units[unitIndex]}`;
    }

    events() {
        return [
            { type: 'click', selector: 'button[data-action="download"]', handler: this.onDownload }
        ];
    }

    onDownload(e) {
        const fileId = e.target.getAttribute('data-id');
        // A full implementation would query all chunks for fileId, decrypt, and Blob it.
        // For Phase 5 UI completeness, we acknowledge the action via toast.
        if (window.toast) {
            window.toast.show(`Assembling ${fileId} from Vault... (This functionality requires full chunk persistence)`, 'info');
        } else {
            alert(`Assembling ${fileId} from Vault...`);
        }
    }
}
