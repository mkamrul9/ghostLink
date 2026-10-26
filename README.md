# Mystic

![Mystic](src/assets/mystic-logo.svg)

Private file sharing and chat between browsers, with a simple orange and charcoal interface. Files travel over a WebRTC data channel; the Node server serves the app and relays connection handshakes. File contents, names and AES keys never travel over the signaling connection.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm start
```

Open http://localhost:8080, create a room, and share its invite with another browser or device. For another device to use Web Crypto, serve through HTTPS. The deployment configuration serves both the client and signaling from the same origin, automatically using WSS on HTTPS.

1. Create a room and share the invite. Invites contain a cryptographically random room code in the URL fragment. New room codes use 16 readable characters (80 random bits), grouped for easy copying.
2. Connect the other device. Rooms allow six devices by default. Select recipients in Send to; each device can send. New arrivals are not selected automatically.
3. Choose or drop files and folders, then press Send.
4. Open **Received files** to download a file or a whole folder. Folder downloads are ZIP files that preserve the folder layout.

## Implemented

- Files and folders, drag and drop, folder trees, search, sorting, multi-selection, rename, move to folder, and bulk removal. Organizing files in Mystic leaves original files on the computer unchanged.
- Room sharing through native device sharing, WhatsApp, Telegram, email, or copied links/codes. These open a share composer; the user chooses the recipient and sends the invite.
- A Help page, searchable questions, and interactive sending, receiving, and folder tutorials.
- **Pip**, an animated SVG courier-bird helper. It answers common questions locally and prepares file actions such as `send report.pdf`, `send all photos`, or `send folder Holiday`. Every send command shows a file review before sending. Pip is a free built-in guide, not a generative AI chatbot; no API key or external AI service is used. It only matches files explicitly added to Mystic and never reads their contents.
- Random private room invites, deterministic connection roles, queued ICE candidates, disconnect handling and bounded signaling reconnects.
- 60 KiB file chunks, AES-256-GCM per file, encryption in a module worker, and bounded send buffering.
- Receiver acknowledgements after encrypted IndexedDB chunk writes; completion only after byte/chunk counts and full-file SHA-256 match. Checksums verify bytes, not sender identity. Downloadable receipts record the result. Exports recheck verified file checksums before completing, and reject conflicting archive paths before writing.
- Cancellation and durable partial resume, including after a refresh: reconnect the same browser profiles and re-add the original file. The sender verifies the entire saved prefix before transmitting only the missing suffix. Re-sending an unchanged complete file verifies it without sending payload again. Bidirectional sharing, zero-byte files and explicit empty folders are supported.
- Persistent received files with individual/ZIP folder downloads, rename, organization and deletion. Native file and folder writers stream to disk on supported desktop browsers; ZIP64 exports preserve large archives and empty directories. Browsers with transferable streams and service workers use a browser-owned download stream. Only browsers without either streaming route retain the 256 MiB memory fallback. The download worker never uploads or caches contents, and downloads require the page to stay open.
- Private peer chat, display names, device-local preferences, history export and independent history clearing. History retains the newest 500 entries per category to bound local storage.
- Optional passphrase protection, encrypted local backups/restore, persistent-storage requests and screen wake lock during transfers when supported.
- Responsive, keyboard-accessible navigation, focus-preserving live updates, reduced-motion support and an original SVG logo/favicon.
- HTTP security headers, same-origin WebSocket checks, bounded payloads and connections, per-socket message rate limits, configurable room limits and targeted signaling, heartbeats and a health endpoint.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run test:mobile
npm run test:load
```

`npm run verify` runs syntax/import checks, unit/integration tests, desktop, encrypted-backup/recovery, four-device group, 750-file staging and large-file acceptance tests and a responsive-layout suite. The browser suite uses separate browser profiles and compares downloaded content with the source SHA-256. ZIP paths and contents are checked with an independent ZIP reader. Mobile checks cover 320, 360, 390 and 430 pixel phones, a 768 pixel tablet, 844x390 landscape, and reduced keyboard space. These are automated viewport checks, not a claim of physical-device testing. The large-file suite transfers a real 280 MiB file across local WebRTC into IndexedDB, verifies its checksum, and checks both a native-writer test double and a real browser-owned streaming download. This checks the former size boundary, not arbitrary file sizes or internet throughput. Screenshots are written to `test-results/`. GitHub Actions runs verification for pushes and pull requests using Google Chrome already installed on the Ubuntu 24.04 runner. Locally, the suite uses Playwright Chromium by default; set `BROWSER_CHANNEL=chrome` to use an installed Google Chrome.

The load script defaults to 1,000 local WebSocket clients in 500 rooms. Set `LOAD_CLIENTS` to an even number up to 10,000. This measures signaling only, with the server and clients in the same process; it does not demonstrate production concurrency, browser throughput, TURN capacity or availability on a hosting plan.

See [PRODUCT.md](PRODUCT.md) for the intended audience, differentiation, evidence and remaining release boundaries.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for the free Render setup, Docker option, configuration and production capacity requirements. There is no deployment build step or server-side file database. The vendored hash bundle is tracked; regenerate it with npm run build:crypto after updating its dependency.

## Storage and privacy

History and received files belong to the browser profile. Settings can protect saved file metadata and encryption keys with a passphrase (PBKDF2-SHA-256, 600,000 iterations; AES-256-GCM). File packets remain encrypted. A protected vault starts locked after reload; locking clears the wrapping key from application state. Protected files also lock after ten minutes without user activity, when no transfer or download is active. Messages and transfer history are separate and remain readable until cleared. Without protection, anyone using the profile can download saved files. The browser Web Locks API prevents concurrent Mystic vault tabs where supported.

Encrypted `.mystic` backups stream to the user's own drive. Restoring checks authenticated records, chunk ordering, file checksums and an authenticated footer; failed imports are rolled back, and existing files are never overwritten. Keep the backup passphrase: there is no reset. Clearing site data still removes local copies; recovery needs a previously saved backup or download. A request for persistent browser storage helps against eviction but does not prevent manual clearing. No file storage, accounts or cloud backups exist on the server. Legacy IndexedDB names are retained to preserve existing files.

WebRTC uses DTLS for transport protection. AES file keys are exchanged inside that channel. The connection server is trusted for peer negotiation: there is no independent peer identity verification. Share invites only with trusted recipients. A TURN relay, when configured, forwards encrypted WebRTC packets.

## Practical limits

- Six devices per room by default (configurable from two to eight with MAX_ROOM_PEERS). Files go only to checked recipients; messages go to every connected device. Group sending creates a separate upload per recipient and uses more sender bandwidth. This is a bounded mesh, not a broadcast CDN.
- No default 256 MiB or 500-file transfer cap. The wire format allows up to 2^32-1 chunks of 60 KiB; browsers impose much smaller practical storage and file limits. Hosts may lower `MAX_FILE_SIZE`. Supported desktop browsers stream saved files and ZIP64 archives to disk. Browsers with service workers and transferable streams use their download manager without a whole-file Blob. The 256 MiB memory fallback applies only when neither streaming route works. This is not an unlimited-size guarantee.
- Both devices must remain online with Mystic open. Resume preserves committed receiver chunks, but the sender must reselect the original file after a refresh. Device IDs, resume credentials and local chunks must still exist. Clearing either profile or changing the original prevents that resume.
- Folder pickers with directory-handle support and drag-and-drop entries preserve empty folders. A plain directory input may omit them; New empty folder adds a marker explicitly. Available disk/quota still bounds receiving; huge exports need a browser with either streaming save route.
- Strict corporate, cellular or symmetric NAT networks may require a TURN relay. Optional TURN_URLS/TURN_SECRET configuration issues expiring coturn REST credentials without exposing the shared secret; it does not provision a relay. The default public STUN service does not guarantee connectivity.
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
