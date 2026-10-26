import Component from '../Component.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
export default class FileTree extends Component {
    static watch = ['files'];
    template() {
        const files = this.props.store.state.files || [];
        return `<div class="file-tree">${files.length ? `<div class="file-tree-count">${files.length} ready to send <button class="text-button" data-action="clear">Clear</button></div><ul>${files.map((file, index) => `<li><div class="file-label">${escapeHtml(file.webkitRelativePath || file.fullPath || file.name)}<small>${formatBytes(file.size)}</small></div><button class="icon-button" data-index="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button></li>`).join('')}</ul>` : '<div class="file-tree-empty">Files you choose will appear here.</div>'}</div>`;
    }
    events() {
        return [
            { type: 'click', selector: '[data-index]', handler: e => this.props.onRemove(Number(e.currentTarget.dataset.index)) },
            { type: 'click', selector: '[data-action="clear"]', handler: () => this.props.onClear() }
        ];
    }
}
