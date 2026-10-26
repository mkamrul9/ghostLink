import Component from '../Component.js';

export default class DashboardShell extends Component {
    template() {
        return `
      <div class="app-shell">
        <header class="app-header">
          <div class="brand">
            <div class="brand-mark">GL</div>
            <div class="brand-text">
              <span class="brand-title">GhostLink</span>
              <span class="brand-subtitle">Peer-to-peer transfer node</span>
            </div>
          </div>
          <div class="header-actions">
            <div id="session-status-slot"></div>
          </div>
        </header>

        <div class="app-body">
          <aside class="app-sidebar">
            <section class="panel session-panel">
              <div class="panel-title">Session Controls</div>
              <div id="session-controls-slot"></div>
            </section>

            <section class="panel nav-panel">
              <div class="panel-title">Navigation</div>
              <nav class="nav-list">
                <button class="nav-item is-active" data-view="dashboard">Dashboard</button>
                <button class="nav-item" data-view="transfers">Transfers</button>
                <button class="nav-item" data-view="vault">Vault</button>
                <button class="nav-item" data-view="settings">Settings</button>
              </nav>
            </section>

            <section class="panel stats-panel">
              <div class="panel-title">Session</div>
              <div id="session-summary-slot"></div>
            </section>

            <section class="panel connections-panel">
              <div class="panel-title">Connections</div>
              <div id="connections-slot"></div>
            </section>
          </aside>

          <main class="app-main">
            <section class="panel hero-panel view-panel" data-panel="dashboard">
              <div class="panel-title">Drop Zone</div>
              <div id="drop-zone-slot"></div>
            </section>

            <section class="panel queue-panel view-panel" data-panel="dashboard,transfers">
              <div class="panel-title">Transfer Queue</div>
              <div id="queue-slot"></div>
            </section>
            
            <section class="panel vault-panel view-panel" data-panel="vault" style="display: none;">
              <div class="panel-title">Local Vault</div>
              <div id="vault-slot"></div>
            </section>
            
            <section class="panel settings-panel view-panel" data-panel="settings" style="display: none;">
              <div class="panel-title">Settings</div>
              <div id="settings-slot"></div>
            </section>
          </main>

          <aside class="app-right">
            <section class="panel graph-panel">
              <div class="panel-title">Network Throughput</div>
              <div id="speed-graph-slot"></div>
            </section>

            <section class="panel file-panel">
              <div class="panel-title">Files</div>
              <div id="file-tree-slot"></div>
            </section>

            <section class="panel chat-shell">
              <div class="panel-title">P2P Chat</div>
              <div id="chat-slot"></div>
            </section>

            <section class="panel help-panel">
              <div class="panel-title">Quick Tips</div>
              <ul class="tips-list">
                <li>Create a room and share the invite link.</li>
                <li>Both peers can send and receive files.</li>
                <li>History lives in your browser vault.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    `;
    }

    update() {
        // Prevent default Component re-render which would destroy child mount points.
        // View updates are handled imperatively in onMount subscription.
    }

    onMount() {
        if (this.props.store) {
            this.props.store.events.subscribe('stateChange', (state) => {
                if (state.ui && state.ui.view) {
                    this.updateView(state.ui.view);
                }
            });
        }
    }

    updateView(view) {
        // Update nav items
        this.element.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.getAttribute('data-view') === view) {
                btn.classList.add('is-active');
            } else {
                btn.classList.remove('is-active');
            }
        });

        // Update panels
        this.element.querySelectorAll('.view-panel').forEach(panel => {
            const views = panel.getAttribute('data-panel').split(',');
            if (views.includes(view)) {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
        });
    }

    events() {
        return [
            { type: 'click', selector: '.nav-item', handler: this.onNavClick }
        ];
    }

    onNavClick(e) {
        const view = e.target.getAttribute('data-view');
        if (view) {
            this.props.store.state.ui = { ...this.props.store.state.ui, view };
        }
    }
}
