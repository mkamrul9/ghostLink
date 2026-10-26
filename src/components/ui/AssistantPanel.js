import { compactOverlay } from '../../utils/viewport.js';
import { pipAvatar } from '../../utils/Pip.js';
import Component from '../Component.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
import { assistantReply } from '../../utils/HelpAssistant.js';
import { filePath } from '../../utils/FileLibrary.js';
export default class AssistantPanel extends Component {
    static watch = ['ui', 'files'];
    initialState() { return { messages: [], busy: false }; }
    template() {
        const { ui, files } = this.props.store.state;
        return `<div class="assistant-widget"><button class="assistant-toggle" aria-label="Ask Pip" aria-expanded="${Boolean(ui.assistantOpen)}" aria-controls="assistant-panel">${pipAvatar()}<span>Pip</span></button>${ui.assistantOpen ? `<section id="assistant-panel" class="assistant-panel" role="dialog" aria-modal="${compactOverlay()}" aria-label="Pip helper"><div class="drawer-heading"><div><h2>Pip</h2><span class="muted">Your free helper</span></div><button class="icon-button" data-close aria-label="Close helper">${icon('close')}</button></div><div class="assistant-messages chat-list" role="log" aria-label="Helper messages" aria-live="polite">${this.state.messages.length ? this.state.messages.map((message, index) => `<div class="helper-message ${message.role}"><p>${escapeHtml(message.text)}</p>${message.action ? this.renderAction(message.action, index, files) : ''}</div>`).join('') : `<p>Hi, I'm Pip. How can I help?</p><div class="helper-suggestions">${['How do I send files?', 'How do I receive files?', 'Send selected files'].map(text => `<button class="btn" data-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div>`}</div><form class="assistant-form"><label class="sr-only" for="assistant-input">Ask the helper</label><input id="assistant-input" data-preserve="assistant" placeholder="Ask Pip..." maxlength="500" autocomplete="off" /><button class="btn btn-primary" type="submit" aria-label="Ask helper">${icon('arrow')}</button></form></section>` : ''}</div>`;
    }
    renderAction(action, index, files) {
        const matches = (action.ids || []).map(id => files.find(file => file.mysticId === id)).filter(Boolean);
        return `${action.type === 'send' ? `<div class="helper-review"><strong>${matches.length} file${matches.length === 1 ? '' : 's'} to send</strong><ul>${matches.map(file => `<li><span>${escapeHtml(filePath(file))}</span><small>${formatBytes(file.size)}</small></li>`).join('')}</ul></div>` : ''}<button class="btn ${action.type === 'send' ? 'btn-primary' : ''}" data-plan="${index}" ${action.type === 'send' && (!matches.length || this.props.store.state.ui.dataChannelStatus !== 'open') ? 'disabled' : ''}>${icon(action.type === 'send' ? 'send' : 'arrow')}${escapeHtml(action.label)}</button>`;
    }
    ask(text) {
        const value = text.trim();
        if (!value) return;
        const { files, fileSelection, ui } = this.props.store.state;
        const reply = assistantReply(value, { files: files.map(file => ({ id: file.mysticId, name: file.name, path: filePath(file) })), selected: fileSelection, connected: ui.dataChannelStatus === 'open' });
        this.setState({ messages: [...this.state.messages, { role: 'user', text: value }, { role: 'guide', ...reply }].slice(-40) });
        const list = this.element.querySelector('.assistant-messages');
        if (list) list.scrollTop = list.scrollHeight;
    }
    events() {
        return [
            { type: 'click', selector: '.assistant-toggle, [data-close]', handler: () => this.props.onToggle() },
            { type: 'click', selector: '[data-suggestion]', handler: event => this.ask(event.currentTarget.dataset.suggestion) },
            { type: 'click', selector: '[data-plan]', handler: async event => {
                const index = Number(event.currentTarget.dataset.plan);
                const action = this.state.messages[index]?.action;
                if (!action) return;
                const result = await this.props.onAction(action);
                if (result && action.type === 'send') {
                    this.state.messages[index] = { ...this.state.messages[index], action: null, text: 'The files are queued. You can check progress in Transfers.' };
                    this.update();
                }
            } },
            { type: 'submit', selector: 'form', handler: event => { event.preventDefault(); const input = this.element.querySelector('#assistant-input'); const value = input.value; input.value = ''; this.ask(value); } },
            { type: 'keydown', handler: event => { if (event.key === 'Escape' && this.props.store.state.ui.assistantOpen) this.props.onToggle(); } }
        ];
    }
    update() {
        const wasOpen = this.element?.querySelector('#assistant-panel');
        super.update();
        if (!wasOpen && this.props.store.state.ui.assistantOpen) this.element?.querySelector('input')?.focus();
        else if (wasOpen && !this.props.store.state.ui.assistantOpen) this.element?.querySelector('.assistant-toggle')?.focus();
    }
}
