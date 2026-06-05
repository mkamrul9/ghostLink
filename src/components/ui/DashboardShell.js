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
                <button class="nav-item is-active">Dashboard</button>
                <button class="nav-item">Transfers</button>
                <button class="nav-item">Vault</button>
                <button class="nav-item">Settings</button>
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
            <section class="panel hero-panel">
              <div class="panel-title">Drop Zone</div>
              <div id="drop-zone-slot"></div>
            </section>

            <section class="panel queue-panel">
              <div class="panel-title">Transfer Queue</div>
              <div id="queue-slot"></div>
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
}
