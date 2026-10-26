# Mystic

![Mystic](src/assets/mystic-logo.svg)

**A little closer. A lot faster.** Private file sharing and chat between two browsers, with an orange and charcoal workspace. Files travel over a WebRTC data channel; the Node server serves the app and relays connection handshakes. File contents, names and AES keys never travel over the signaling connection.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm start
```

Open http://localhost:8080, create a room, and share its invite with another browser or device. For another device to use Web Crypto, serve through HTTPS. The deployment configuration serves both the client and signaling from the same origin, automatically using WSS on HTTPS.

1. Create a room and share the invite. Invites contain a cryptographically random room code in the URL fragment.
2. Connect the other device. Rooms allow two peers and either peer can send.
3. Choose or drop files and folders, then press Send.
4. Download received files from Transfers or Local vault. Folders arrive as individual files; relative paths are retained in vault metadata.

## Implemented

- File/folder selection, drag and drop, file staging and removal.
- Random private room invites, deterministic connection roles, queued ICE candidates, disconnect handling and bounded signaling reconnects.
- 16 KiB file chunks, AES-256-GCM per file, encryption in a module worker, and bounded send buffering.
- Receiver acknowledgements after encrypted IndexedDB chunk writes; completion only after the receiver validates the final byte and chunk counts.
- Cancellation, retry while the original file remains selected in the current session, bidirectional sharing, and zero-byte files.
- Persistent local vault with download and deletion. Incomplete transfers remain identifiable and can be removed and resent.
- Private peer chat, display names, device-local preferences, history export and independent history clearing. History retains the newest 500 entries per category to bound local storage.
- Responsive, keyboard-accessible navigation, focus-preserving live updates, reduced-motion support and an original SVG logo/favicon.
- HTTP security headers, same-origin WebSocket checks, bounded payloads and connections, per-socket message rate limits, two-peer room limits, heartbeats and a health endpoint.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run test:load
```

`npm run verify` runs syntax/import checks, unit/integration tests and browser acceptance tests. The browser suite uses separate browser profiles and compares downloaded content with the source SHA-256. Screenshots are written to `test-results/`. GitHub Actions runs verification for pushes and pull requests.

The load script defaults to 1,000 local WebSocket clients in 500 rooms. Set `LOAD_CLIENTS` to an even number up to 10,000. This measures signaling only, with the server and clients in the same process; it does not demonstrate production concurrency, browser throughput, TURN capacity or availability on a hosting plan.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for the free Render setup, Docker option, configuration and production capacity requirements. There is no build step or server-side file database.

## Storage and privacy

History and received files belong to the browser profile. The vault stores encrypted file packets alongside their CryptoKey, so another person with access to that browser profile can download them. This is not a password-protected vault. Deleting browser site data removes local history, saved files and keys. Nothing is backed up to the server. Legacy IndexedDB names and the legacy display-name preference are retained internally to preserve existing user data through the rename.

WebRTC uses DTLS for transport protection. AES file keys are exchanged inside that channel. The connection server is trusted for peer negotiation: there is no independent peer identity verification. Share invites only with trusted recipients. A TURN relay, when configured, forwards encrypted WebRTC packets.

## Practical limits

- Two devices per room; group rooms are not implemented.
- Default per-file limit: 256 MiB, configurable with `MAX_FILE_SIZE`. Sending is chunked and receiving writes to IndexedDB, but a vault download assembles the file into a Blob. Browser quotas and available memory still apply. This is not an unlimited-size transfer guarantee.
- Interrupted files must be resent. Automatic partial-transfer resume is not implemented.
- Browsers cannot reliably reconstruct a downloaded folder automatically. Files are saved individually with original names and relative paths shown in the vault.
- Strict corporate, cellular or symmetric NAT networks may require a TURN relay. The default public STUN service does not guarantee connectivity.
- Rooms are kept in process memory. Restarting the server loses waiting rooms. Established peer sessions can continue if the signaling connection is lost. Use one signaling instance unless shared room routing is implemented.

## Structure

- `server.js`: HTTP, client configuration, health and WebSocket signaling.
- `src/index.js`: workspace composition and session lifecycle.
- `src/utils/TransferManager.js`: acknowledged transfer protocol and flow control.
- `src/DB/`: local history and encrypted file storage.
- `src/components/ui/`: workspace panels.
- `src/worker/`: module worker encryption.
- `tests/`: protocol/storage/server and browser acceptance tests.

License: ISC. Repository URL retains its original name for continuity; the product is Mystic.
