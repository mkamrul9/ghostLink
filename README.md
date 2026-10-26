# Mystic

![Mystic](src/assets/mystic-logo.svg)

Private file sharing and chat between two browsers, with a simple orange and charcoal interface. Files travel over a WebRTC data channel; the Node server serves the app and relays connection handshakes. File contents, names and AES keys never travel over the signaling connection.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm start
```

Open http://localhost:8080, create a room, and share its invite with another browser or device. For another device to use Web Crypto, serve through HTTPS. The deployment configuration serves both the client and signaling from the same origin, automatically using WSS on HTTPS.

1. Create a room and share the invite. Invites contain a cryptographically random room code in the URL fragment. New room codes use 16 readable characters (80 random bits), grouped for easy copying.
2. Connect the other device. Rooms allow two peers and either peer can send.
3. Choose or drop files and folders, then press Send.
4. Open **Received files** to download a file or a whole folder. Folder downloads are ZIP files that preserve the folder layout.

## Implemented

- Files and folders, drag and drop, folder trees, search, sorting, multi-selection, rename, move to folder, and bulk removal. Organizing files in Mystic leaves original files on the computer unchanged.
- Room sharing through native device sharing, WhatsApp, Telegram, email, or copied links/codes. These open a share composer; the user chooses the recipient and sends the invite.
- A Help page, searchable questions, and interactive sending, receiving, and folder tutorials.
- **Pip**, an animated SVG courier-bird helper. It answers common questions locally and prepares file actions such as `send report.pdf`, `send all photos`, or `send folder Holiday`. Every send command shows a file review before sending. Pip is a free built-in guide, not a generative AI chatbot; no API key or external AI service is used. It only matches files explicitly added to Mystic and never reads their contents.
- Random private room invites, deterministic connection roles, queued ICE candidates, disconnect handling and bounded signaling reconnects.
- 16 KiB file chunks, AES-256-GCM per file, encryption in a module worker, and bounded send buffering.
- Receiver acknowledgements after encrypted IndexedDB chunk writes; completion only after the receiver validates the final byte and chunk counts.
- Cancellation, retry while the original file remains selected in the current session, bidirectional sharing, and zero-byte files.
- Persistent received files with individual/ZIP folder downloads, rename, organization and deletion. Incomplete transfers remain identifiable and can be removed and resent.
- Private peer chat, display names, device-local preferences, history export and independent history clearing. History retains the newest 500 entries per category to bound local storage.
- Responsive, keyboard-accessible navigation, focus-preserving live updates, reduced-motion support and an original SVG logo/favicon.
- HTTP security headers, same-origin WebSocket checks, bounded payloads and connections, per-socket message rate limits, two-peer room limits, heartbeats and a health endpoint.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run test:mobile
npm run test:load
```

`npm run verify` runs syntax/import checks, unit/integration tests, browser acceptance tests and a responsive-layout suite. The browser suite uses separate browser profiles and compares downloaded content with the source SHA-256. ZIP paths and contents are checked with an independent ZIP reader. Mobile checks cover 320, 360, 390 and 430 pixel phones, a 768 pixel tablet, 844x390 landscape, and reduced keyboard space. These are automated viewport checks, not a claim of physical-device testing. Screenshots are written to `test-results/`. GitHub Actions runs verification for pushes and pull requests using Google Chrome already installed on the Ubuntu 24.04 runner. Locally, the suite uses Playwright Chromium by default; set `BROWSER_CHANNEL=chrome` to use an installed Google Chrome.

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
- Folder downloads use ZIP and preserve nested paths. A single folder download is capped at 256 MiB total and 500 files to protect browser memory. Empty folders without files are not transferred.
- Strict corporate, cellular or symmetric NAT networks may require a TURN relay. The default public STUN service does not guarantee connectivity.
- Rooms are kept in process memory. Restarting the server loses waiting rooms. Established peer sessions can continue if the signaling connection is lost. Use one signaling instance unless shared room routing is implemented.

## Structure

- `server.js`: HTTP, client configuration, health and WebSocket signaling.
- `src/index.js`: workspace composition and session lifecycle.
- `src/utils/TransferManager.js`: acknowledged transfer protocol and flow control.
- `src/utils/FileLibrary.js` and `ZipDownload.js`: file organization and safe folder downloads.
- `src/utils/HelpAssistant.js`: local command matching for Pip; no model or network calls.
- `src/DB/`: local history and encrypted file storage.
- `src/components/ui/`: workspace panels.
- `src/worker/`: module worker encryption.
- `tests/`: protocol/storage/server and browser acceptance tests.

License: ISC. Repository URL retains its original name for continuity; the product is Mystic.
