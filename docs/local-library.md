# Local encrypted library

The local library keeps received file packets, file keys and resume records in a folder you select on your own drive. It does not use server storage or the browser's IndexedDB chunk store.

This option needs a browser that supports external directory handles and writable files, currently desktop Chrome or Edge. It remains a browser feature, not an installed background service.

## Set it up

1. Open **Settings > Choose local folder**.
2. Select a folder on the drive you want to use. Mystic creates a `Mystic Library` subfolder unless you select an existing library directly.
3. Create a passphrase with at least 12 characters and confirm it.
4. Receive files normally. Their encrypted data is written to that folder.
5. Use **Received files** to download or export readable copies.

Keep the entire library folder and the passphrase. The internal chunk files are encrypted and are not normal documents. A protected local folder starts locked after reload; unlock it before receiving.

Files already received in browser storage remain there when you choose a local folder. To copy existing complete files across, save an encrypted backup while using the old location, switch locations, then restore that backup. Switching locations does not migrate or delete data automatically.

## After clearing website data

Choose **Settings > Choose local folder** again, select the same library or its parent, and enter its passphrase. Mystic reads the encrypted metadata and recovers the saved files. The local library also preserves its device identifier for compatible resume records.

Deleting the actual folder, losing the passphrase, removing a drive, or losing its contents cannot be repaired by clearing or reinstalling the website. Keep another encrypted backup for important files. There is no server copy or passphrase reset.

## Reopen, change or disconnect

A browser may remember the folder handle while asking permission again on a later visit. **Reconnect saved folder** restores that access. Mystic blocks new receives while a remembered folder needs reconnecting, so files do not silently go to a different storage location.

**Use browser storage** returns to the separate browser library without deleting external files. **Open another local folder** changes the active library. Stop transfers and downloads before changing storage.

Changing the folder passphrase rewraps its random master key in one atomic header write. It does not rewrite every file. Locking clears the key from application state and releases the exclusive writer lock. Open a library in one place at a time; browsers without exclusive-writer enforcement need particular care.

## Storage format and durability

```text
Mystic Library/
  mystic-library.json          # format, KDF parameters and encrypted master key
  mystic-library.lock          # writer coordination; no file contents
  metadata/<fileId>.json       # authenticated, encrypted metadata and per-file key
  outgoing/<cacheId>.json      # authenticated, encrypted sender resume records
  chunks/<fileId>/<index>.bin  # original encrypted transfer packets
```

Master-key wrapping uses PBKDF2-SHA-256 with a random salt and 600,000 iterations, then AES-256-GCM. Each metadata record is bound to its store and identifier. Per-file packet encryption and full-file checksum verification follow the existing transfer protocol.

A received chunk is acknowledged only after the chunk file and metadata file are both closed successfully. A crash between those writes can leave an orphan chunk; the committed metadata position wins, and resume safely overwrites that uncommitted position.

Filesystem capacity and permissions still apply. This mode avoids browser storage quotas; it cannot create disk space or bypass an operating-system restriction. Files remain open through a browser process, so keep Mystic running until transfer and export finish.

## Validation

Automated tests use independent in-memory directories for database-loss recovery and writer exclusion. Browser tests exercise real directory-handle APIs with OPFS as a test stand-in; production opens an external directory through `showDirectoryPicker`. Physical external-drive permission, removal and disk-full behavior still require manual validation on target systems.
