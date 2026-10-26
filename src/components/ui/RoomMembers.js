import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export default class RoomMembers extends Component {
    static watch=['session'];
    template() {
        const {members=[],recipientIds=[]}=this.props.store.state.session;
        if(!members.length)return '<div hidden></div>';
        return `<div class="room-recipients"><h2 class="panel-title">Send to</h2><div class="recipient-options">${members.map(peer=>`<label class="recipient-option"><input type="checkbox" data-recipient="${escapeHtml(peer.id)}" aria-label="Send to ${escapeHtml(peer.name)}" ${recipientIds.includes(peer.id)?'checked':''} ${peer.connected?'':'disabled'} />${icon('device')}<span>${escapeHtml(peer.name)}${peer.connected?'':'<small>Connecting...</small>'}</span></label>`).join('')}</div>${members.length>1?'<p class="muted">Choose who gets your files. Each device receives its own copy.</p>':''}</div>`;
    }
    events(){return [{type:'change',selector:'[data-recipient]',handler:event=>{const selected=new Set(this.props.store.state.session.recipientIds || []);event.target.checked?selected.add(event.target.dataset.recipient):selected.delete(event.target.dataset.recipient);this.props.onSelect([...selected]);}}];}
}
