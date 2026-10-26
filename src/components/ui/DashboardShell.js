import { compactOverlay } from '../../utils/viewport.js';
import Component from '../Component.js';
import { icon } from '../../utils/icons.js';
export default class DashboardShell extends Component {
    static watch = ['ui', 'files', 'session'];
    template() {
        return `<div class="app-shell"><header class="app-header"><button class="brand" data-view="dashboard" aria-label="Mystic home"><img class="brand-mark" src="/assets/mystic-mark.svg" alt="" width="42" height="42" /><span class="brand-title">mystic<span>.</span></span></button><div class="header-actions"><div id="session-status-slot"></div><button class="btn header-chat" data-chat aria-expanded="false" aria-controls="message-drawer">${icon('chat')}Messages</button><div id="assistant-slot"></div></div></header><div class="app-body"><aside class="app-sidebar"><nav class="nav-list" aria-label="Main navigation">${[['dashboard', 'send', 'Send files'], ['vault', 'download', 'Received files'], ['transfers', 'transfer', 'Transfers'], ['help', 'help', 'Help'], ['settings', 'settings', 'Settings']].map(([view, name, label]) => `<button class="nav-item" data-view="${view}">${icon(name)}<span>${label}</span></button>`).join('')}</nav><section class="panel session-panel" data-guide="room"><h2 class="panel-title">Connect devices</h2><div id="session-controls-slot"></div></section><button class="sidebar-help" data-tutorial>${icon('play')}Quick tutorial</button></aside><main class="app-main" id="main-content" tabindex="-1"><div class="workspace-heading"><div><h1 id="view-title">Send files</h1><p id="view-description">Choose what to share with the other device.</p></div></div><section class="panel hero-panel view-panel" data-panel="dashboard" data-guide="add"><div id="drop-zone-slot"></div></section><section class="panel file-panel view-panel" data-panel="dashboard" data-guide="files"><div id="file-tree-slot"></div></section><section class="panel queue-panel view-panel" data-panel="transfers"><div class="panel-title">Transfer history</div><div id="queue-slot"></div></section><section class="panel received-panel view-panel" data-panel="vault" data-guide="received" hidden><div id="vault-slot"></div></section><section class="panel help-panel view-panel" data-panel="help" hidden><div id="help-slot"></div></section><section class="panel settings-panel view-panel" data-panel="settings" hidden><h2 class="panel-title">Your settings</h2><div id="settings-slot"></div><details class="settings-details"><summary>History</summary><div id="session-summary-slot"></div></details><details class="settings-details"><summary>Recent rooms</summary><div id="connections-slot"></div></details></section></main></div><aside id="message-drawer" class="message-drawer" role="dialog" aria-label="Messages" hidden><div class="drawer-heading"><h2>Messages</h2><button class="icon-button" data-chat aria-label="Close messages">${icon('close')}</button></div><div id="chat-slot"></div></aside></div>`;
    }
    update() {
        if (!this.element) return;
        const { view, chatOpen, assistantOpen } = this.props.store.state.ui;
        const modal = compactOverlay() && (chatOpen || assistantOpen);
        this.element.querySelector('.app-body').inert = Boolean(modal);
        this.element.querySelector('.brand').inert = Boolean(modal);
        this.element.querySelector('.header-chat').inert = Boolean(compactOverlay() && assistantOpen);
        this.element.querySelector('#message-drawer').setAttribute('aria-modal', String(compactOverlay()));
        this.element.querySelector('#assistant-panel')?.setAttribute('aria-modal', String(compactOverlay()));
        this.element.querySelectorAll('.nav-item').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('is-active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
        this.element.querySelectorAll('.view-panel').forEach(panel => { panel.hidden = !panel.dataset.panel.split(',').includes(view) || (panel.classList.contains('file-panel') && !this.props.store.state.files.length); });
        const headings = { dashboard: ['Send files', ''], vault: ['Received files', 'Download your files or keep them organized here.'], transfers: ['Transfers', ''], help: ['Help', 'Learn how to send, receive, and organize files.'], settings: ['Settings', ''] };
        const [title, description] = headings[view] || headings.dashboard;
        this.element.querySelector('#view-title').textContent = title;
        this.element.querySelector('#view-description').textContent = description;
        this.element.querySelector('#view-description').hidden = !description;
        this.element.querySelector('.session-panel .panel-title').textContent = this.props.store.state.session.roomId ? 'Your room' : 'Connect devices';
        const drawer = this.element.querySelector('#message-drawer');
        const wasHidden = drawer.hidden;
        drawer.hidden = !chatOpen;
        if (wasHidden && chatOpen) queueMicrotask(() => { (drawer.querySelector('input:not(:disabled)') || drawer.querySelector('button'))?.focus(); });
        else if (!wasHidden && !chatOpen) this.element.querySelector('.header-chat').focus();
        this.element.querySelector('.header-chat').setAttribute('aria-expanded', String(Boolean(chatOpen)));
    }
    onMount() { this.update(); }
    events() {
        return [
            { type: 'click', selector: '[data-view]', handler: event => this.props.onView(event.currentTarget.dataset.view) },
            { type: 'click', selector: '[data-chat]', handler: () => this.props.onChat() },
            { type: 'click', selector: '[data-tutorial]', handler: () => this.props.onTutorial('send') }
        ];
    }
}
