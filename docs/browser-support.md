# Browser support

Use HTTPS and a current browser with WebRTC, Web Crypto, IndexedDB and module workers. Localhost is treated as a secure development origin; another device needs a real HTTPS origin.

## Receiving and storage

- **Browser library:** uses encrypted IndexedDB packets. Available quota and eviction policy depend on the browser and device. Requesting persistent storage helps against automatic cleanup but cannot stop manual clearing.
- **External local library:** requires an external directory picker and writable file handles. Desktop Chrome and Edge provide the intended path. The chosen drive holds encrypted packets and metadata outside browser-managed storage. Permissions and disk capacity still apply.

Changing storage does not migrate existing files. Keep a download or backup for browser-only files and the entire folder plus passphrase for external-library files.

## Saving files

Mystic tries these routes in order:

1. A native save-file picker with incremental writes.
2. A browser download response backed by a transferable stream and service worker.
3. A memory-backed Blob download, guarded at 256 MiB plus bounded archive overhead.

The last route is a compatibility fallback, not an unlimited-size claim. If an older browser lacks both streaming routes, use a current supported browser for larger downloads. Stay on the page until downloads finish.

Folder-handle and drag-and-drop entry APIs preserve empty directories. A plain `webkitdirectory` input may omit them. **New empty folder** adds an explicit marker.

## Keeping transfers running

The page must stay open on both devices. A browser may suspend a background tab, particularly on a phone or in low-power mode. Screen wake lock is requested during activity where available, and committed data can be resumed; neither feature overrides the operating system. Installing the web app does not create a background file-transfer service.

## Tested evidence

CI runs Chrome on Ubuntu. Local acceptance checks use Playwright Chromium and cover six viewports, touch-style layouts, reduced keyboard space, focus behavior, two-device transfers, four-device rooms and local-folder APIs.

These checks do not claim physical iOS/Android, Firefox or Safari certification. Contributions with reproducible test reports are welcome. Record browser/OS versions, network type, storage mode, relevant permissions and whether a real disk save succeeded. Use synthetic data and remove private identifiers.
