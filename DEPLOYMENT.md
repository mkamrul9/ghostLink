# Deploy Mystic

## Free launch on Render

Render supports Node web services and WebSockets on its free plan. The included `render.yaml` runs the client and signaling together, with managed HTTPS and no paid database.

1. Push this repository to GitHub.
2. Sign in to https://dashboard.render.com and connect your GitHub account.
3. Select **New > Blueprint**, choose the repository and use the included `render.yaml`. Confirm the service is on **Free** before creating it.
4. Once deployment completes, open the service's `https://...onrender.com` URL. The app automatically connects to `wss://...onrender.com/signal`.
5. Verify `/healthz`, connect two separate devices, exchange files in both directions, compare the downloads and test a cellular-to-home-network connection.
6. Check room sharing from a phone, send a folder, download it as a ZIP, and try the Help tutorial and Pip. Pip works without an AI service or API key.
7. Add a TURN configuration for networks that cannot connect directly. Run the smoke test again through those networks before a public release.

No domain purchase is required. Publishing requires the owner's hosting account; repository configuration alone does not create a live service.

Render's free plan currently sleeps after 15 minutes without inbound HTTP or WebSocket traffic, can take about a minute to wake, and has included usage limits. The provider explicitly advises against using free instances for production applications. The free setup is a launch preview, not a production availability commitment for thousands of users. See https://render.com/docs/free and https://render.com/docs/websocket.

## Configuration

- `PORT`: server port; defaults to 8080. Render sets this itself.
- `HOST`: bind address; defaults to 0.0.0.0.
- `MAX_CLIENTS`: maximum simultaneous signaling sockets. Defaults to 10,000 as a protective ceiling, not a tested hosting capacity.
- `MAX_FILE_SIZE`: per-file byte limit presented to browsers; defaults to Number.MAX_SAFE_INTEGER (no product size cap). Device storage and browser save capabilities still limit real transfers. Set a smaller byte value if needed.
- `ALLOWED_ORIGINS`: optional comma-separated client origins. Same-origin clients are already allowed.
- `ICE_SERVERS`: JSON array in the RTCPeerConnection format. Defaults to Google's public STUN server. Add a TURN provider for restrictive networks. TURN usernames and credentials are visible to browsers; use scoped, short-lived credentials and rotate them through your provider. Never commit credentials to the repository.

Configure variables in the host dashboard. For local `.env` files, use `node --env-file=.env server.js`; `npm start` does not automatically read `.env`.

## Container

```sh
docker build -t mystic .
docker run --rm -p 8080:8080 --env-file .env mystic
```

The image runs as a non-root user and has a `/healthz` health check. Put it behind an HTTPS reverse proxy for browser crypto and WebSockets. Proxy `/signal` upgrades to the same service. Allow long-lived WebSocket connections and retain the request Host header.

## Before a production audience

- Measure representative usage on the selected host: concurrent sockets, p95/p99 handshake latency, memory, event-loop delay, peer-connection success and restart behavior. Local test results are a baseline only.
- Provision and measure TURN bandwidth and credentials. P2P file data does not consume signaling bandwidth, but TURN relay bandwidth can dominate cost.
- Keep this version on one signaling instance. Multiple instances need shared room routing and peer-disconnect coordination before horizontal scaling.
- Set monitoring on `/healthz`, restarts and connection failures. Do not log SDP, room codes, file names, chat or file keys. This implementation logs only its listening port.
- Use an always-on hosting tier for a public service with uptime expectations. Establish privacy/support policies and a browser/device compatibility matrix.
- Test mobile storage limits and the 256 MiB memory-save fallback. Supported desktop browsers can stream larger downloads. Received files and protected keys live only in each browser profile; users can save encrypted backups locally.

## Rollback

Revert the relevant commit on GitHub and redeploy, or use the host's previous successful deployment. The server has no file database to migrate. Browser IndexedDB upgrades retain the old object stores and add an index; do not remove or rename storage without a migration.
