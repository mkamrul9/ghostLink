# Deploy Mystic

The public preview is **https://mystic-hgyb.onrender.com**, deployed from this repository’s `main` branch to a free Render Node service. The service uses same-origin WebSockets and managed HTTPS. TURN is not configured; some restrictive networks will need a relay. The app and deployment smoke test are verified with browser profiles on one computer; physical cross-network validation is still required.

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
- `MAX_ROOM_PEERS`: devices per room, from 2 to 8; defaults to 6. Small mesh rooms bound sender upload and browser peer-connection count.
- `MAX_FILE_SIZE`: per-file byte limit presented to browsers; defaults to Number.MAX_SAFE_INTEGER (no product size cap). Device storage and browser save capabilities still limit real transfers. Set a smaller byte value if needed.
- `ALLOWED_ORIGINS`: optional comma-separated client origins. Same-origin clients are already allowed.
- `ICE_SERVERS`: JSON array in the RTCPeerConnection format. Defaults to Google's public STUN server. Add a TURN provider for restrictive networks. TURN usernames and credentials are visible to browsers; use scoped, short-lived credentials and rotate them through your provider. Never commit credentials to the repository.

Optional coturn REST authentication: set `TURN_URLS` to a JSON array of relay URLs and `TURN_SECRET` to the relay's shared secret (at least 32 random characters). `TURN_TTL` defaults to 3600 seconds, from 300 to 86400. The API returns a unique expiring username and HMAC-SHA1 credential, never the shared secret. Clients refresh credentials when establishing each peer connection. This follows coturn's REST credential format: https://github.com/coturn/coturn/blob/master/README.turnserver. The relay itself must be provisioned separately with matching `use-auth-secret` / `static-auth-secret`, TLS, appropriate network ports, allocation/bandwidth quotas, and protection from credential-endpoint abuse at the edge. Keep credentials out of source control. No relay is enabled in the free blueprint.

A TURN relay forwards encrypted network packets when direct connections fail; it does not store files. Leaving TURN unset keeps only direct WebRTC/STUN connectivity, and some networks will fail to connect. Free signaling hosting cannot remove those network restrictions.

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
- Test mobile storage limits, native saving, browser-owned download streams and the 256 MiB fallback used when streaming is unavailable. Downloads need Mystic open until finished. The service worker caches an allowlist of public application assets and generates local download responses; it never caches messages, file contents, signaling, or API credentials. Supported desktop browsers can stream larger downloads. Received files and protected keys live only in each browser profile; users can save encrypted backups locally.

## Rollback

Revert the relevant commit on GitHub and redeploy, or use the host's previous successful deployment. The server has no file database to migrate. Browser IndexedDB upgrades retain the old object stores and add an index; do not remove or rename storage without a migration.


## Repeatable deployment checks

For the Linux HTTPS/coturn template, see [deploy/README.md](deploy/README.md). It requires your own domain and public host; nothing is deployed automatically by committing it. The repository CI separately builds and smoke-checks the app container.

Run `npm run check:deployment -- https://your-site.example --require-relay` to check HTTP health, security headers, public client settings and required assets. This confirms a relay is configured, not that a TURN allocation or real cross-network transfer succeeds.

The optional external-folder library is entirely client-side. Hosts do not mount users' libraries or store their keys. A user can select a drive such as D: in desktop Chrome or Edge; normal browser-only copies remain subject to the browser profile's storage location and quota.

## PWA and room-message checks

Serve the manifest, PNG icons, `/pwa-assets.js` and `/download-worker.js` from the same HTTPS origin. `/messages` must return the application shell. Check installation from Settings, a live message and reply, delivery counts, one file in each direction, and reopening saved content offline. See [PWA and messages](docs/pwa-and-messages.md). After client changes, regenerate `src/pwa-assets.js` before pushing. The normal Node deployment uses the tracked asset list without a frontend build step.

For an owner-authorized live smoke test, run `node scripts/hosted-smoke.mjs https://your-site.example`. It creates a temporary private test room using synthetic files, verifies downloaded bytes and messages in both directions, and leaves the browsers’ test profiles and downloads in ignored workspace artifacts (on D: when the checkout is on D:). The browser devices run on the testing computer; still check physical phones across separate networks.
