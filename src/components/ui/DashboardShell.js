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
            <span class="status-pill">Status: Idle</span>
            <button class="btn btn-primary">New Session</button>
          </div>
        </header>

        <div class="app-body">
          <aside class="app-sidebar">
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
              <div class="stat-grid">
                <div class="stat">
                  <span class="stat-label">Room</span>
                  <span class="stat-value">ghostlink-room-42</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Role</span>
                  <span class="stat-value">Receiver</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Peers</span>
                  <span class="stat-value">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Encrypted</span>
                  <span class="stat-value">AES-256-GCM</span>
                </div>
              </div>
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

            <section class="panel help-panel">
              <div class="panel-title">Quick Tips</div>
              <ul class="tips-list">
                <li>Open two tabs to connect peers.</li>
                <li>Sender uses ?init=true in the URL.</li>
                <li>Drop folders to preserve structure.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    `;
    }
}
