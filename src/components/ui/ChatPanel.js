import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
import { MESSAGE_LIMIT, messageHtml, deliveryLabel } from '../../utils/Messages.js';
export default class ChatPanel extends Component {
    static watch = ['chat', 'ui', 'session'];
    initialState() { return {search:''}; }
    template() {
        const { chat, ui, session } = this.props.store.state;
        const roomMessages = chat.filter(message => message.roomId === session.roomId);
        const messages = roomMessages.filter(message => `${message.author} ${message.text}`.toLowerCase().includes(this.state.search.toLowerCase()));
        const connected = ui.dataChannelStatus === 'open';
        const count = session.members?.filter(peer=>peer.connected).length || 0;
        return `<div class="chat-panel"><div class="chat-room-bar"><p class="muted">${connected ? `To everyone in this room · ${count} connected` : session.roomId ? 'Waiting for another device to connect.' : 'Create or join a room to send messages.'}</p><div class="chat-tools"><button class="icon-button" data-connect aria-label="Room connection">${icon(session.roomId?'share':'plus')}</button><button class="icon-button" data-export aria-label="Save room messages" ${roomMessages.length?'':'disabled'}>${icon('download')}</button><button class="icon-button" data-clear aria-label="Clear room messages on this device" ${roomMessages.length?'':'disabled'}>${icon('trash')}</button></div></div><label class="search-field chat-search">${icon('search')}<input type="search" aria-label="Search messages" placeholder="Search messages" data-preserve="message-search" value="${escapeHtml(this.state.search)}" /></label><div class="chat-list" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text">${messages.length ? messages.map(message => `<article class="chat-message ${message.origin === 'self' ? 'self' : 'peer'}"><div class="chat-meta"><span>${escapeHtml(message.origin === 'self' ? 'You' : message.author || 'Other device')}</span><time>${new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><div class="chat-bubble">${messageHtml(message.text)}</div><div class="chat-message-footer">${message.origin==='self'?`<span class="message-delivery">${escapeHtml(deliveryLabel(message))}</span>`:'<span></span>'}<button class="icon-button" data-copy="${escapeHtml(message.id)}" aria-label="Copy message">${icon('copy')}</button></div></article>`).join('') : `<p class="empty-state">${this.state.search ? 'No messages match your search.' : connected ? 'Send a message, a link, or a note.' : 'Your room messages will appear here.'}</p>`}</div><form class="chat-form"><textarea aria-label="Message" data-preserve="chat" class="chat-input" rows="2" placeholder="Write a message" maxlength="${MESSAGE_LIMIT}" ${connected ? '' : 'disabled'}></textarea><button class="btn btn-primary" type="submit" aria-label="Send message" ${connected ? '' : 'disabled'}>${icon('arrow')}</button></form><p class="chat-note muted">Messages stay on this device. Both devices need to be connected.</p></div>`;
    }
    update() {
        const room=this.props.store.state.session.roomId;
        if(this.renderedRoom!==room){this.state.search='';this.element?.querySelector('textarea') && (this.element.querySelector('textarea').value='');this.element?.querySelector('input') && (this.element.querySelector('input').value='');this.renderedRoom=room;}
        super.update();
    }
    submit() {
        const input=this.element.querySelector('textarea'), text=input.value.trim();
        if(!text || this.props.store.state.ui.dataChannelStatus!=='open')return;
        if(this.props.onSend(text)!==false){this.element.querySelector('textarea').value='';const list=this.element.querySelector('.chat-list');list.scrollTop=list.scrollHeight;}
    }
    events() { return [
        {type:'submit',selector:'form',handler:event=>{event.preventDefault();this.submit();}},
        {type:'keydown',selector:'textarea',handler:event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();this.submit();}}},
        {type:'input',selector:'input',handler:event=>this.setState({search:event.target.value})},
        {type:'click',selector:'[data-copy]',handler:event=>{const message=this.props.store.state.chat.find(item=>item.id===event.currentTarget.dataset.copy);if(message)this.props.onCopy(message.text);}},
        {type:'click',selector:'[data-connect]',handler:()=>this.props.onConnect()},
        {type:'click',selector:'[data-export]',handler:()=>this.props.onExport()},
        {type:'click',selector:'[data-clear]',handler:()=>this.props.onClear()}
    ]; }
}
