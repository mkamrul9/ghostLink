import Component from '../Component.js';
import { handleDroppedItems, readDirectoryHandle } from '../../helpers/FileSystemHelper.js';
import { icon } from '../../utils/icons.js';
export default class DropZone extends Component {
    static watch = [];
    template() {
        return `<div class="drop-zone"><div class="drop-zone__inner"><div class="drop-icon">${icon('upload')}</div><h2>Choose files to send</h2><p>Drop files or a folder here.</p><div class="drop-zone__cta"><button class="btn btn-primary" data-action="browse">${icon('plus')}Add files</button><button class="btn" data-action="folder">${icon('folder')}Add folder</button><button class="btn" data-action="empty">${icon('plus')}New empty folder</button></div><input type="file" id="file-picker" multiple hidden aria-label="Add files" /><input type="file" id="folder-picker" webkitdirectory multiple hidden aria-label="Add folder" /></div></div>`;
    }
    events() {
        return [
            { type: 'click', selector: '[data-action="browse"]', handler: () => this.chooseFiles() },
            { type: 'click', selector: '[data-action="folder"]', handler: () => this.chooseFolder() },
            { type: 'click', selector: '[data-action="empty"]', handler: () => this.props.onEmptyFolder() },
            { type: 'change', selector: 'input[type="file"]', handler: event => { this.props.onFiles([...event.target.files]); event.target.value = ''; } },
            { type: 'dragover', handler: event => { event.preventDefault(); this.element.classList.add('active-drag'); } },
            { type: 'dragleave', handler: event => { if (!this.element.contains(event.relatedTarget)) this.element.classList.remove('active-drag'); } },
            { type: 'drop', handler: async event => { event.preventDefault(); this.element.classList.remove('active-drag'); try { const pending = handleDroppedItems(event.dataTransfer); this.props.onFiles(await pending); } catch (error) { this.props.onError(error); } } }
        ];
    }
    chooseFiles() { this.element.querySelector('#file-picker').click(); }
    async chooseFolder() {
        if (!window.showDirectoryPicker) { this.element.querySelector('#folder-picker').click(); return; }
        try { const directory = await window.showDirectoryPicker({ mode: 'read' }); this.props.onFiles(await readDirectoryHandle(directory)); }
        catch (error) { if (error.name !== 'AbortError') this.props.onError(error); }
    }
}
