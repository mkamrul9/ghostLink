import Component from '../Component.js';
export default class DashboardShell extends Component {
    static watch = ['ui'];
    template() {
        return `<div class="app-shell">
            <header class="app-header">
                <a class="brand" href="/" aria-label="Mystic home"><img class="brand-mark" src="/assets/mystic-mark.svg" alt="" width="44" height="44" /><div class="brand-text"><span class="brand-title">mystic<span class="brand-period">.</span></span><span class="brand-subtitle">A little closer. A lot faster.</span></div></a>
                <div class="header-actions"><span class="privacy-badge"><span></span> Private by design</span><div id="session-status-slot"></div></div>
            </header>
            <div class="app-body">
                <aside class="app-sidebar">
                    <section class="panel nav-panel"><span class="eyebrow">WORKSPACE</span><nav class="nav-list" aria-label="Workspace"><button class="nav-item is-active" data-view="dashboard"><span aria-hidden="true">◫</span> Overview</button><button class="nav-item" data-view="transfers"><span aria-hidden="true">⇄</span> Transfers</button><button class="nav-item" data-view="vault"><span aria-hidden="true">▣</span> Local vault</button><button class="nav-item" data-view="settings"><span aria-hidden="true">⚙</span> Preferences</button></nav></section>
                    <section class="panel session-panel"><div class="panel-title">Connect devices <span class="step-label">01</span></div><div id="session-controls-slot"></div></section>
                    <section class="panel stats-panel"><div class="panel-title">Your session</div><div id="session-summary-slot"></div></section>
                    <section class="panel connections-panel"><div class="panel-title">Recent rooms</div><div id="connections-slot"></div></section>
                </aside>
                <main class="app-main" id="main-content">
                    <div class="workspace-heading"><div><span class="eyebrow">LESS FRICTION. MORE FLOW.</span><h2 id="view-title">Your sharing space</h2></div><span class="workspace-badge">PEER TO PEER</span></div>
                    <section class="panel hero-panel view-panel" data-panel="dashboard"><div id="drop-zone-slot"></div></section>
                    <section class="panel queue-panel view-panel" data-panel="dashboard,transfers"><div class="panel-title">Transfer activity <span class="step-label">LIVE</span></div><div id="queue-slot"></div></section>
                    <section class="panel vault-panel view-panel" data-panel="vault" hidden><div class="panel-title">Local vault</div><div id="vault-slot"></div></section>
                    <section class="panel settings-panel view-panel" data-panel="settings" hidden><div class="panel-title">Preferences</div><div id="settings-slot"></div></section>
                    <div class="workspace-footnote"><span aria-hidden="true">◇</span> Files move between devices. Your file contents never pass through our server.</div>
                </main>
                <aside class="app-right">
                    <section class="panel file-panel"><div class="panel-title">Selected files <span class="step-label">02</span></div><div id="file-tree-slot"></div></section>
                    <section class="panel chat-shell"><div class="panel-title">A direct line <span class="step-label">CHAT</span></div><div id="chat-slot"></div></section>
                    <section class="panel graph-panel"><div class="panel-title">Transfer speed <span class="step-label">60 SEC</span></div><div id="speed-graph-slot"></div><p class="graph-caption">Combined send and receive speed</p></section>
                    <section class="panel help-panel"><div class="panel-title">A smooth handoff</div><ol class="tips-list"><li>Create a room and share the invite.</li><li>Connect the second device.</li><li>Choose files, then send. Download from the vault.</li></ol><p class="session-hint">Folders arrive as individual files. Relative paths are kept in the vault.</p></section>
                </aside>
            </div>
            <footer class="app-footer"><span>mystic. <span class="footer-muted">Made for the handoff.</span></span><span>No sign-up. No cloud storage.</span></footer>
        </div>`;
    }
    update() {
        if (!this.element) return;
        const view = this.props.store.state.ui.view;
        this.element.querySelectorAll('.nav-item').forEach(button => {
            const active = button.dataset.view === view;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
        });
        this.element.querySelectorAll('.view-panel').forEach(panel => { panel.hidden = !panel.dataset.panel.split(',').includes(view); });
        this.element.querySelector('#view-title').textContent = { dashboard: 'Your sharing space', transfers: 'Every handoff, in view', vault: 'Kept on your device', settings: 'Make it yours' }[view];
    }
    onMount() { this.update(); }
    events() { return [{ type: 'click', selector: '.nav-item', handler: e => { this.props.store.state.ui = { ...this.props.store.state.ui, view: e.currentTarget.dataset.view }; } }]; }
}
