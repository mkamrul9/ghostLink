import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
export default class SessionControls extends Component {
    static watch = ['session', 'ui'];
    initialState() { return { roomInput: '' }; }
    template() {
        const { session, ui } = this.props.store.state;
        const busy = ui.booting || ui.connectionStatus === 'connecting';
        const room = this.state.roomInput || session.roomId || '';
        return `<div class="session-controls">
            <p class="section-description">One private room. Two connected devices.</p>
            <button class="btn btn-primary" data-action="create" ${busy ? 'disabled' : ''}>+ Create a room</button>
            <div class="input-divider">or join with an invite</div>
            <label class="session-label" for="room-code">Room code or invite link</label>
            <input id="room-code" class="session-input" type="text" value="${escapeHtml(room)}" placeholder="Paste a code or link" autocomplete="off" spellcheck="false" data-preserve="room" />
            <div class="session-actions">
                <button class="btn" data-action="join" ${busy ? 'disabled' : ''}>Join room</button>
                <button class="btn" data-action="copy" ${session.roomId ? '' : 'disabled'}>Copy invite</button>
            </div>
            ${session.roomId ? '<button class="btn btn-small" data-action="leave">Leave room</button>' : ''}
            <p class="session-hint">Share invites only with people you trust. Keep both tabs open during a transfer.</p>
            ${ui.error ? `<p class="inline-error" role="alert">${escapeHtml(ui.error)}</p><button class="btn btn-small" data-action="retry">Reconnect</button>` : ''}
        </div>`;
    }
    update() {
        const room = this.props.store.state.session.roomId;
        if (room !== this.lastRoom) {
            this.lastRoom = room;
            this.state.roomInput = room;
            const input = this.element?.querySelector('#room-code');
            if (input) input.value = room;
        }
        super.update();
    }
    events() {
        return [
            { type: 'input', selector: '#room-code', handler: e => { this.state.roomInput = e.target.value; } },
            { type: 'keydown', selector: '#room-code', handler: e => { if (e.key === 'Enter') this.props.onJoin(this.state.roomInput); } },
            ...['create', 'join', 'copy', 'leave', 'retry'].map(action => ({ type: 'click', selector: `[data-action="${action}"]`, handler: () => {
                if (action === 'join') this.props.onJoin(this.state.roomInput || this.props.store.state.session.roomId);
                else if (action === 'create') { this.state.roomInput = ''; this.props.onCreate(); }
                else this.props[`on${action[0].toUpperCase() + action.slice(1)}`]?.();
            } }))
        ];
    }
}
