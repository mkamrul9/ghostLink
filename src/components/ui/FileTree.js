import Component from '../Component.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
import { filePath, fileTree, nestedFiles } from '../../utils/FileLibrary.js';
export default class FileTree extends Component {
    static watch = ['files', 'fileSelection', 'vault', 'receivedSelection', 'vaultState', 'ui'];
    initialState() { return { search: '', sort: 'name', visibleCount: 200, closed: new Set() }; }
    get received() { return this.props.mode === 'received'; }
    get entries() {
        return this.received
            ? this.props.store.state.vault.map(file => ({ id: String(file.fileId), name: file.fileName, path: file.relativePath || file.fileName, size: file.fileSize, complete: file.complete, directory: file.kind === 'directory', verified: file.verified, date: file.createdAt }))
            : this.props.store.state.files.map(file => ({ id: file.mysticId, name: file.name, path: filePath(file), size: file.size, complete: true, directory: Boolean(file.mysticDirectory), date: file.lastModified }));
    }
    get selected() { return this.props.store.state[this.received ? 'receivedSelection' : 'fileSelection']; }
    template() {
        if (this.received && this.props.store.state.vaultState?.locked) return `<div class="file-browser received-browser"><div class="empty-state">${icon('lock')}<h2>Your files are locked</h2><button class="btn btn-primary" data-action="unlock">Unlock files</button></div></div>`;
        const all = this.entries;
        if (!all.length) return `<div class="file-browser ${this.received ? 'received-browser' : 'send-browser'}"><div class="empty-state">${icon(this.received ? 'download' : 'files')}<p>${this.received ? 'Files you receive will appear here.' : 'No files added.'}</p></div></div>`;
        const needle = this.state.search.toLowerCase();
        const entries = all.filter(file => file.path.toLowerCase().includes(needle)).sort((a, b) => this.state.sort === 'size' ? b.size - a.size : this.state.sort === 'newest' ? b.date - a.date : a.path.localeCompare(b.path, undefined, { numeric: true }));
        const selected = all.filter(file => this.selected.includes(file.id));
        const total = selected.reduce((sum, file) => sum + (file.size || 0), 0);
        const connected = this.props.store.state.ui.dataChannelStatus === 'open';
        const validDownloads = selected.filter(file => file.complete);
        return `<div class="file-browser ${this.received ? 'received-browser' : 'send-browser'}">
            <div class="file-toolbar"><label class="search-field">${icon('search')}<input type="search" aria-label="Search ${this.received ? 'received' : 'selected'} files" data-preserve="file-search" value="${escapeHtml(this.state.search)}" placeholder="Search files" /></label><select aria-label="Sort files" data-preserve="file-sort"><option value="name" ${this.state.sort === 'name' ? 'selected' : ''}>Name</option><option value="size" ${this.state.sort === 'size' ? 'selected' : ''}>Largest first</option><option value="newest" ${this.state.sort === 'newest' ? 'selected' : ''}>Newest first</option></select></div>
            ${all.length ? `<div class="file-list-heading"><label class="check-label"><input type="checkbox" data-select-all aria-label="Select all files" ${entries.length && entries.every(file => this.selected.includes(file.id)) ? 'checked' : ''} ${entries.length ? '' : 'disabled'} />Name</label><span>Size</span><span class="sr-only">Actions</span></div><div class="file-list" data-scroll="file-list">${entries.length ? this.renderTree(fileTree(entries.slice(0, this.state.visibleCount))) : '<p class="empty-state">No matching files.</p>'}</div>
            ${entries.length > this.state.visibleCount ? `<button class="btn btn-small show-more" data-more>Show more (${this.state.visibleCount} of ${entries.length})</button>` : ''}<div class="selection-bar"><span>${selected.length} selected${selected.length ? ` <span class="muted">(${formatBytes(total)})</span>` : ''}</span><div class="selection-actions"><button class="btn btn-small" data-action="move" ${selected.length ? '' : 'disabled'}>${icon('folder')}Move to folder</button><button class="btn btn-small" data-action="remove" ${selected.length ? '' : 'disabled'}>${icon('trash')}${this.received ? 'Delete' : 'Remove'}</button></div></div>
            <div class="file-primary-actions">${this.received ? `<button class="btn btn-primary" data-action="download-selected" ${validDownloads.length ? '' : 'disabled'}>${icon('download')}Download selected</button>${window.showDirectoryPicker ? `<button class="btn" data-action="save-folder" ${validDownloads.length ? '' : 'disabled'}>${icon('folder')}Save as folders</button>` : ''}<span class="muted">Folder downloads preserve their layout.</span>` : `<button class="btn btn-primary" data-action="send" ${selected.length && connected && !this.props.store.state.vaultState?.locked ? '' : 'disabled'}>${icon('send')}Send ${selected.length} selected file${selected.length === 1 ? '' : 's'}</button>${!connected ? '<span class="muted">Connect another device to send.</span>' : ''}`}</div>` : `<div class="empty-state">${icon(this.received ? 'download' : 'files')}<p>${this.received ? 'Received files will appear here.' : 'Add files or a folder to start.'}</p></div>`}
        </div>`;
    }
    renderTree(node, prefix = '') {
        const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
        return folders.map(folder => {
            const path = prefix ? `${prefix}/${folder.name}` : folder.name;
            const children = nestedFiles(folder);
            const ids = children.map(file => file.id);
            const count = ids.filter(id => this.selected.includes(id)).length;
            return `<details class="folder-group" data-folder="${escapeHtml(path)}" ${this.state.closed.has(path) ? '' : 'open'}><summary><span class="folder-leading">${icon('chevron', 'folder-chevron')}<input type="checkbox" data-folder-check="${escapeHtml(path)}" aria-label="Select folder ${escapeHtml(path)}" ${count === ids.length ? 'checked' : ''} data-partial="${count > 0 && count < ids.length}" />${icon('folder')}<span>${escapeHtml(folder.name)}</span><small>${children.some(file => !file.directory) ? children.filter(file => !file.directory).length + ' files' : 'Empty folder'}</small></span>${this.received ? `<button class="icon-button" data-download-folder="${escapeHtml(path)}" aria-label="Download folder ${escapeHtml(path)}" title="Download folder" ${children.some(file => file.complete) ? '' : 'disabled'}>${icon('download')}</button>` : ''}</summary><div class="folder-children">${this.renderTree(folder, path)}</div></details>`;
        }).join('') + node.files.map(file => `<div class="file-row" data-file-id="${escapeHtml(file.id)}"><label class="file-name"><input type="checkbox" data-file-check="${escapeHtml(file.id)}" aria-label="Select ${escapeHtml(file.path)}" ${this.selected.includes(file.id) ? 'checked' : ''} />${icon(/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name) ? 'image' : 'files')}<span>${escapeHtml(file.name)}<small class="mobile-size">${formatBytes(file.size)}</small>${!file.complete ? '<small>Not finished</small>' : ''}</span></label><span class="file-size">${formatBytes(file.size)}</span><div class="row-actions">${this.received ? `<button class="icon-button" data-download="${escapeHtml(file.id)}" title="Download file" aria-label="Download ${escapeHtml(file.name)}" ${file.complete ? '' : 'disabled'}>${icon('download')}</button>` : ''}<button class="icon-button" data-rename="${escapeHtml(file.id)}" title="Rename file" aria-label="Rename ${escapeHtml(file.name)}" ${this.received && !file.complete ? 'disabled' : ''}>${icon('edit')}</button><button class="icon-button" data-remove="${escapeHtml(file.id)}" title="${this.received ? 'Delete' : 'Remove'} file" aria-label="${this.received ? 'Delete' : 'Remove'} ${escapeHtml(file.name)}">${icon('close')}</button></div></div>`).join('');
    }
    select(ids, checked) {
        const selection = new Set(this.selected);
        for (const id of ids) checked ? selection.add(id) : selection.delete(id);
        this.props.onSelect([...selection]);
    }
    events() {
        const byFolder = path => this.entries.filter(file => file.path.startsWith(`${path}/`) || file.directory && file.path === path).map(file => file.id);
        return [
            { type: 'click', selector: '[data-more]', handler: () => this.setState({ visibleCount: this.state.visibleCount + 200 }) },
            { type: 'input', selector: 'input[type="search"]', handler: event => this.setState({ search: event.target.value }) },
            { type: 'change', selector: 'select', handler: event => this.setState({ sort: event.target.value }) },
            { type: 'change', selector: '[data-file-check]', handler: event => this.select([event.target.dataset.fileCheck], event.target.checked) },
            { type: 'change', selector: '[data-folder-check]', handler: event => this.select(byFolder(event.target.dataset.folderCheck), event.target.checked) },
            { type: 'click', selector: '[data-folder-check]', handler: event => event.stopPropagation() },
            { type: 'change', selector: '[data-select-all]', handler: event => this.select(this.entries.filter(file => file.path.toLowerCase().includes(this.state.search.toLowerCase())).map(file => file.id), event.target.checked) },
            { type: 'toggle', selector: 'details', handler: event => { const path = event.currentTarget.dataset.folder; event.currentTarget.open ? this.state.closed.delete(path) : this.state.closed.add(path); } },
            { type: 'click', selector: '[data-action]', handler: event => this.props.onAction(event.currentTarget.dataset.action, [...this.selected]) },
            ...[['rename', 'rename'], ['remove', 'remove'], ['download', 'download']].map(([attr, action]) => ({ type: 'click', selector: `[data-${attr}]`, handler: event => this.props.onAction(action, [event.currentTarget.dataset[attr]]) })),
            { type: 'click', selector: '[data-download-folder]', handler: event => { event.preventDefault(); event.stopPropagation(); this.props.onAction('download-folder', byFolder(event.currentTarget.dataset.downloadFolder)); } }
        ];
    }
    markPartial() { this.element?.querySelectorAll('[data-partial="true"]').forEach(input => { input.indeterminate = true; }); }
    update() { if (this.element && this.props.store.state.ui.view !== (this.received ? 'vault' : 'dashboard')) return; super.update(); this.markPartial(); }
    onMount() { this.markPartial(); }
}
