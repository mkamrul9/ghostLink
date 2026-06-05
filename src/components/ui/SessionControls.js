import Component from '../Component.js';

export default class SessionControls extends Component {
    initialState() {
        const session = this.props.store.state.session || {};
        const ui = this.props.store.state.ui || {};
        return {
            roomInput: session.roomId || '',
            signalUrl: ui.signalUrl || ''
        };
    }

    template() {
        const session = this.props.store.state.session || {};
        const ui = this.props.store.state.ui || {};
        const roomInput = this.state.roomInput || session.roomId || '';
        const signalUrl = this.state.signalUrl || ui.signalUrl || '';

        return `
      <div class="session-controls">
        <label class="session-label">Room Code</label>
        <input class="session-input" type="text" value="${roomInput}" placeholder="ghostlink-1234" />
        <div class="session-actions">
          <button class="btn btn-primary" data-action="create">Create</button>
          <button class="btn" data-action="join">Join</button>
          <button class="btn" data-action="copy">Copy Link</button>
        </div>

        <label class="session-label">Signaling URL</label>
        <input class="session-input" type="text" value="${signalUrl}" placeholder="ws://localhost:8080" />
        <div class="session-hint">Use a hosted wss:// URL when deployed.</div>
      </div>
    `;
    }

    events() {
        return [
            { type: 'input', selector: '.session-input', handler: this.handleInput },
            { type: 'click', selector: '[data-action="create"]', handler: this.handleCreate },
            { type: 'click', selector: '[data-action="join"]', handler: this.handleJoin },
            { type: 'click', selector: '[data-action="copy"]', handler: this.handleCopy }
        ];
    }

    handleInput(e) {
        const inputs = this.element.querySelectorAll('.session-input');
        const roomValue = inputs[0] ? inputs[0].value : '';
        const signalValue = inputs[1] ? inputs[1].value : '';
        this.setState({ roomInput: roomValue, signalUrl: signalValue });
        if (typeof this.props.onSignalChange === 'function') {
            this.props.onSignalChange(signalValue);
        }
    }

    handleCreate() {
        if (typeof this.props.onCreate !== 'function') return;
        const newRoom = this.props.onCreate();
        if (newRoom) {
            this.setState({ roomInput: newRoom });
        }
    }

    handleJoin() {
        if (typeof this.props.onJoin !== 'function') return;
        const room = this.state.roomInput.trim();
        if (!room) return;
        this.props.onJoin(room);
    }

    handleCopy() {
        if (typeof this.props.onCopy !== 'function') return;
        const room = this.state.roomInput.trim();
        if (!room) return;
        this.props.onCopy(room);
    }
}
