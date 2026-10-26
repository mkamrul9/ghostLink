# Security and privacy model

## Trust boundaries

The Node service serves the app and relays WebRTC offers, answers and ICE candidates. File payloads, file names, messages and AES file keys are not accepted as signaling messages. Rooms use random invite codes and bounded membership.

WebRTC protects transport with DTLS. File packets additionally use per-file AES-256-GCM. The signaling server is trusted for negotiation, and the site serves the JavaScript that handles files. There is no independent peer identity authentication or protection against a malicious replacement client served by a compromised host. A matching checksum confirms bytes, not identity.

TURN, when configured, forwards encrypted WebRTC packets. It does not store files, but its operator can observe network metadata and bandwidth. Use expiring credentials and allocation/bandwidth quotas. Never publish the relay's shared secret.

## Local copies

Unprotected browser metadata contains the keys needed to decrypt saved packets. Anyone with access to that browser profile can use those copies. Optional browser protection seals metadata and keys under a passphrase-derived wrapping key.

External libraries always require a passphrase. They use a random master key wrapped by PBKDF2-SHA-256 / AES-256-GCM, encrypted records bound to their identifiers, and the existing encrypted chunk format. Local files survive clearing website data because they live in the granted external directory. Loss of the directory or passphrase still loses access.

Protected storage starts locked after reload and locks after ten minutes of inactivity when no transfer, download or storage operation is active. Locking drops application key references; it does not protect against malware or another process reading an already unlocked browser's memory.

Chat and transfer history are separate from file protection. They can reveal names, file names or messages until cleared. Do not treat an exported history file or a downloaded plaintext file as an encrypted backup.

## Transfer and export integrity

The receiver acknowledges data after durable storage commits. Resume compares the entire saved prefix, then completion compares a full-file SHA-256. Verified exports calculate the checksum again before completing. File sizes, indices, archive paths and key formats are validated. Conflicting export paths fail before writing an archive or destination files.

Encrypted backups use authenticated records, ordering, complete-file verification and an authenticated footer. Failed restores remove staged imports and do not replace existing files. Store backups and passphrases separately.

## Operational limits

No accounts, cloud delivery, password reset or remote deletion is provided. Browsers, disks and networks can reject work; a free hosting tier is not a production availability guarantee. The current room map is in one process and needs shared coordination before horizontal scaling.

No independent security audit has been completed. Tests exercise corruption, key handling, resume, protected reload, backup rollback and storage conflicts, but tests cannot prove the absence of vulnerabilities. Report findings through [SECURITY.md](../SECURITY.md).
