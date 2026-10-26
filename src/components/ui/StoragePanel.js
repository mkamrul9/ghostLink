import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export default class StoragePanel extends Component {
    static watch=['vaultState','transfers'];
    template() {
        const state=this.props.store.state.vaultState,folder=state.storageKind==='folder',busy=state.busy||state.saving||this.props.store.state.transfers.some(item=>['queued','sending','receiving'].includes(item.status));
        return `<div class="storage-panel"><h3>Where files are saved</h3><p>${folder?`${icon('folder')} <strong>${escapeHtml(state.folderName)}</strong>`:'This browser'}${state.needsFolder?' - reconnect your saved folder to receive files.':''}</p><div class="security-actions">${state.needsFolder?`<button class="btn btn-primary" data-storage="reconnect-folder" ${busy?'disabled':''}>Reconnect saved folder</button>`:''}${window.showDirectoryPicker?`<button class="btn" data-storage="folder" ${busy?'disabled':''}>${icon('folder')}${folder?'Open another local folder':'Choose local folder'}</button>`:''}${folder||state.needsFolder?`<button class="btn btn-small" data-storage="browser-storage" ${busy?'disabled':''}>Use browser storage</button>`:''}</div><p class="muted">${folder?'Encrypted files stay in this folder even if you clear website data. Reopen the folder with its passphrase to recover them. Earlier browser copies stay in browser storage.':'Browser files can be removed when website data is cleared. A local folder in desktop Chrome or Edge keeps encrypted copies outside browser storage.'}</p></div>`;
    }
    events(){return [{type:'click',selector:'[data-storage]',handler:event=>this.props.onAction(event.currentTarget.dataset.storage)}];}
}
