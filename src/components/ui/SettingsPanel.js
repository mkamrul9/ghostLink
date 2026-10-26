import Component from '../Component.js';

export default class SettingsPanel extends Component {
    initialState() {
        return {
            username: localStorage.getItem('ghostlink_username') || 'GhostUser',
            signalUrl: localStorage.getItem('ghostlink_signalUrl') || 'ws://localhost:8080'
        };
    }

    template() {
        return `
            <div class="settings-form">
                <div class="form-group">
                    <label>Display Name</label>
                    <input type="text" id="setting-username" value="${this.state.username}" placeholder="Enter your display name" />
                    <small>This name will be shown to peers when you connect.</small>
                </div>
                
                <div class="form-group" style="margin-top: 16px;">
                    <label>Signaling Server URL</label>
                    <input type="text" id="setting-signal" value="${this.state.signalUrl}" placeholder="ws://localhost:8080" />
                    <small>The WebSocket server used to exchange WebRTC handshakes.</small>
                </div>
                
                <div class="form-actions" style="margin-top: 24px;">
                    <button class="btn" id="btn-save-settings">Save Settings</button>
                </div>
            </div>
        `;
    }

    events() {
        return [
            { type: 'click', selector: '#btn-save-settings', handler: this.onSave }
        ];
    }

    onSave() {
        const nameInput = this.element.querySelector('#setting-username').value;
        const signalInput = this.element.querySelector('#setting-signal').value;

        localStorage.setItem('ghostlink_username', nameInput);
        localStorage.setItem('ghostlink_signalUrl', signalInput);

        this.setState({ username: nameInput, signalUrl: signalInput });

        if (this.props.store) {
            this.props.store.state.ui = {
                ...this.props.store.state.ui,
                username: nameInput,
                signalUrl: signalInput
            };
        }

        if (window.toast) {
            window.toast.show('Settings saved successfully!', 'success');
        } else {
            alert('Settings saved!');
        }
    }
}
