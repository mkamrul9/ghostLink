import Component from '../Component.js';

export default class FileTree extends Component {
    template() {
        const files = this.props.store.state.files || [];
        if (files.length === 0) {
            return `<div class="file-tree-empty">No files selected yet.</div>`;
        }

        const listItems = files
            .map((file) => `<li>${file.fullPath} <span>${(file.size / 1024).toFixed(2)} KB</span></li>`)
            .join('');

        return `
      <div class="file-tree">
        <div class="file-tree-count">${files.length} file(s) staged</div>
        <ul>${listItems}</ul>
      </div>
    `;
    }
}
