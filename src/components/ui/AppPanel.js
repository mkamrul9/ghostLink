import Component from '../Component.js';
import {icon} from '../../utils/icons.js';
export default class AppPanel extends Component {
    static watch=['ui'];
    template(){const {installed,updateAvailable}=this.props.store.state.ui;return `<section class="settings-app"><h2>Mystic on your device</h2><p>${installed?'Mystic is installed.':'Install Mystic for quick access from your home screen or desktop.'} Saved files, messages, and help are available offline after your first visit.</p><div class="security-actions"><button class="btn" data-install ${installed?'disabled':''}>${icon('device')}${installed?'Installed':'Install Mystic'}</button>${updateAvailable?`<button class="btn btn-primary" data-update>${icon('refresh')}Update Mystic</button>`:''}</div><p>Keep Mystic open while sending. Installing does not enable background delivery.</p></section>`;}
    events(){return [{type:'click',selector:'[data-install]',handler:()=>this.props.onInstall()},{type:'click',selector:'[data-update]',handler:()=>this.props.onUpdate()}];}
}
export function installInstructions(){
    const dialog=document.createElement('dialog');dialog.className='app-dialog';dialog.setAttribute('aria-label','Install Mystic');
    dialog.innerHTML='<h2>Install Mystic</h2><ol class="install-steps"><li><strong>iPhone or iPad:</strong> Open Mystic in Safari, choose Share, then Add to Home Screen.</li><li><strong>Android:</strong> Open the browser menu, then choose Install app or Add to Home screen.</li><li><strong>Computer:</strong> Look for Install in the browser address bar or menu.</li></ol><p class="muted">Use the live HTTPS address. Installation options depend on your browser.</p><form method="dialog"><button class="btn btn-primary">Got it</button></form>';
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.appendChild(dialog);dialog.showModal();
}
