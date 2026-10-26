import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
export default class SettingsPanel extends Component {
    static watch = [];
    template() {
        const { username, signalUrl } = this.props.store.state.ui;
        return `<form class="settings-form">
            <h2>Make yourself at home.</h2><p class="section-description">Preferences stay on this device.</p>
            <div class="form-group"><label for="setting-username">Display name</label><input id="setting-username" data-preserve="username" value="${escapeHtml(username)}" maxlength="40" required autocomplete="nickname" /><small>Shown to your peer in chat.</small></div>
            <details class="advanced-settings"><summary>Advanced connection settings</summary><div class="form-group"><label for="setting-signal">Connection server</label><input id="setting-signal" data-preserve="signal" value="${escapeHtml(signalUrl)}" required spellcheck="false" /><small>Changes apply when you next connect.</small></div></details>
            <button class="btn btn-primary" type="submit">Save preferences</button>
            <div class="privacy-note"><strong>Your data stays here.</strong><p>Chat and transfer history are stored in this browser. Received files are encrypted in the local vault; their keys are kept in this browser too. Anyone with access to this browser profile can download them. Delete vault files when you no longer need them.</p></div>
        </form>`;
    }
    events() { return [{ type: 'submit', handler: e => { e.preventDefault(); this.props.onSave(this.element.querySelector('#setting-username').value, this.element.querySelector('#setting-signal').value); } }]; }
}
