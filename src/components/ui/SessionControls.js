import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export default class SessionControls extends Component {
    static watch = ['session', 'ui'];
    initialState() { return { roomInput: '' }; }
    template() {
        const { session, ui } = this.props.store.state;
        const busy = ui.booting || ui.connectionStatus === 'connecting';
        return `<div class="session-controls">${session.roomId ? `<div class="room-code-heading"><label class="session-label" for="active-room-code">Room code</label><button class="icon-button" data-action="copyCode" aria-label="Copy room code" title="Copy room code">${icon('copy')}</button></div><div class="room-code-row"><input id="active-room-code" readonly value="${escapeHtml(session.roomId)}" aria-label="Your room code" /></div><button class="btn btn-primary" data-action="share">${icon('share')}Share room</button><button class="btn btn-small" data-action="leave">${icon('leave')}Leave room</button>` : `<p class="muted">Connect two devices with a room.</p><button class="btn btn-primary" data-action="create" ${busy ? 'disabled' : ''}>${icon('plus')}Create a room</button><div class="input-divider">or</div><label class="session-label" for="room-code">Room code or invite link</label><input id="room-code" class="session-input" type="text" value="${escapeHtml(this.state.roomInput)}" placeholder="Paste a code or link" autocomplete="off" spellcheck="false" data-preserve="room" /><button class="btn" data-action="join" ${busy ? 'disabled' : ''}>${icon('arrow')}Join room</button>`}${ui.error ? `<p class="inline-error" role="alert">${escapeHtml(ui.error)}</p>${session.roomId ? `<button class="btn btn-small" data-action="retry">${icon('refresh')}Try again</button>` : ''}` : ''}</div>`;
    }
    events() {
        return [
            { type: 'input', selector: '#room-code', handler: event => { this.state.roomInput = event.target.value; } },
            { type: 'keydown', selector: '#room-code', handler: event => { if (event.key === 'Enter' && !this.props.store.state.ui.booting) this.props.onJoin(this.state.roomInput); } },
            ...['create', 'join', 'copy', 'copyCode', 'share', 'leave', 'retry'].map(action => ({ type: 'click', selector: `[data-action="${action}"]`, handler: () => {
                if (action === 'join') this.props.onJoin(this.state.roomInput);
                else this.props[`on${action[0].toUpperCase() + action.slice(1)}`]?.();
            } }))
        ];
    }
}
