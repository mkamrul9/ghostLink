# Install Mystic and use room messages

## Start on two devices

Open the same live HTTPS Mystic address on both devices. Choose **Create a room** on one, share the invite, and open it on the other. Wait for the connected status. `localhost` opens only on the computer running the development server.

**Messages** in the main menu opens the full room conversation. The header message button opens a compact companion while working with files. All connected room members receive messages; the file recipient checkboxes apply only to files.

Send notes or HTTP/HTTPS links, up to 4,000 characters. Enter sends; Shift+Enter adds a line. The Send button also works on touch devices. Incoming messages show an unread count when the conversation is hidden. **Delivered** means the other app acknowledged the message, not that a person read it. If a recipient disconnects or cannot receive a message, the count shows incomplete delivery. A separate WebRTC data channel keeps chat processing independent of file hashing and storage writes; both channels still share the network bandwidth.

Search the current room, copy a message, or choose **Save room messages** for a JSON copy. **Clear room messages on this device** affects only this browser. History keeps up to 500 messages across rooms, with 200 recent messages loaded in the workspace. Reopening the same room shows the retained conversation. It is local history, not a server inbox or an unlimited archive. File-library passphrases do not encrypt message history. Save an export before clearing website data.

## Install

Open **Settings > Install Mystic**. If the browser offers its install dialog, accept it. Otherwise Mystic shows device instructions:

- **iPhone/iPad:** open in Safari, choose Share, then Add to Home Screen.
- **Android:** browser menu, then Install app or Add to Home screen.
- **Computer:** use Install in the address bar or browser menu.

Install on each device separately. Installation support varies by browser and uses the live HTTPS URL, with localhost allowed for development. Automated tests validate the manifest, PNG icon dimensions and guidance, not an operating-system installation on physical iOS or Android devices.

After one successful online visit, the app shell, local history, saved-file tools, help and Pip can reopen offline. New room connections and message delivery need connectivity. Installing a PWA does not make WebRTC run after closing the app or override phone suspension. No push service, offline cloud inbox, background file transfer or server file storage is added.

## Updates and privacy

The service worker caches only a generated allowlist of public application files. It never caches `/api/config`, connection credentials, signaling, local download streams, messages, or user files. User data stays in IndexedDB or the selected local library, separate from the shell cache. Offline streaming downloads remain local.

A new worker waits until old windows close, or the user chooses **Settings > Update Mystic**. Explicit updating confirms a reload and refuses while the current window is transferring, saving, or changing storage. Finish activity in any other Mystic windows before updating. No automatic forced reload interrupts a transfer.

For contributors, run `npm run build:pwa` whenever `src/` changes and commit `src/pwa-assets.js`. Its content hash versions the shell; `npm run check` rejects a stale list. `scripts/app-icons.mjs` renders the existing SVG into installation PNGs using Playwright and workspace-local temporary files. `npm run test:pwa` tests offline history, verified local downloads, cache exclusions, and a waiting-worker update. `npm run test:messages` tests real multi-device messaging and mobile layouts.
