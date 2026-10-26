import Component from '../Component.js';
import { handleDroppedItems } from '../../helpers/FileSystemHelper.js';
export default class DropZone extends Component {
    static watch = ['ui', 'files'];
    template() {
        const { files, ui } = this.props.store.state;
        return `<div class="drop-zone">
            <div class="drop-zone__inner">
                <span class="eyebrow">YOUR FILES. A DIRECT ROUTE.</span>
                <div class="drop-icon" aria-hidden="true">↥</div>
                <h1>Big ideas.<br>Meet instant sharing.</h1>
                <p>Drop files or a folder here. Send directly to another device, with no cloud upload.</p>
                <div class="drop-zone__cta">
                    <button class="btn btn-primary" data-action="browse">Choose files</button>
                    <button class="btn" data-action="folder">Choose folder</button>
                </div>
                <input type="file" id="file-picker" multiple hidden aria-label="Choose files to share" />
                <input type="file" id="folder-picker" webkitdirectory multiple hidden aria-label="Choose a folder to share" />
                <div class="drop-zone__tags"><span>Encrypted in transit</span><span>Direct to device</span><span>No account needed</span></div>
                ${files.length ? `<button class="btn btn-primary send-staged" data-action="send" ${ui.dataChannelStatus === 'open' ? '' : 'disabled'}>Send ${files.length} selected file${files.length === 1 ? '' : 's'}</button>` : ''}
                <p class="drop-zone__hint">${ui.dataChannelStatus === 'open' ? 'Your peer is connected. Ready when you are.' : 'Create a room and invite your other device to start.'}</p>
            </div>
        </div>`;
    }
    events() {
        return [
            { type: 'click', selector: '[data-action="browse"]', handler: () => this.element.querySelector('#file-picker').click() },
            { type: 'click', selector: '[data-action="folder"]', handler: () => this.element.querySelector('#folder-picker').click() },
            { type: 'click', selector: '[data-action="send"]', handler: () => this.props.onSend() },
            { type: 'change', selector: 'input[type="file"]', handler: e => this.props.onFiles([...e.target.files]) },
            { type: 'dragover', handler: e => { e.preventDefault(); this.element.classList.add('active-drag'); } },
            { type: 'dragleave', handler: e => { if (!this.element.contains(e.relatedTarget)) this.element.classList.remove('active-drag'); } },
            { type: 'drop', handler: async e => {
                e.preventDefault(); this.element.classList.remove('active-drag');
                try { const pending = handleDroppedItems(e.dataTransfer); this.props.onFiles(await pending); }
                catch (error) { this.props.onError(error); }
            } }
        ];
    }
}
