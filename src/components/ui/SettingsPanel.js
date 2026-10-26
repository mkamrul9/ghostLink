import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
export default class SettingsPanel extends Component {
    static watch = [];
    template() {
        const { username, signalUrl } = this.props.store.state.ui;
        return `<form class="settings-form"><div class="form-group"><label for="setting-username">Your name</label><input id="setting-username" data-preserve="username" value="${escapeHtml(username)}" maxlength="40" required autocomplete="nickname" /><small>Shown in your messages.</small></div><details class="advanced-settings"><summary>Advanced settings</summary><div class="form-group"><label for="setting-signal">Connection server</label><input id="setting-signal" data-preserve="signal" value="${escapeHtml(signalUrl)}" required spellcheck="false" /><small>Changes apply the next time you connect.</small></div></details><button class="btn btn-primary" type="submit">Save settings</button></form>`;
    }
    events() { return [{ type: 'submit', handler: event => { event.preventDefault(); this.props.onSave(this.element.querySelector('#setting-username').value, this.element.querySelector('#setting-signal').value); } }]; }
}
