# Roadmap

Mystic focuses on recoverable folder handoffs and user-owned storage. Items below are possible improvements, not promises or shipped features.

## Shipped foundation

- Direct, encrypted file and folder sharing with explicit recipients.
- Durable partial resume and complete-file checksum verification.
- Encrypted external-folder libraries on supported desktop browsers.
- Local passphrase protection, encrypted portable backups and recovery.
- Group rooms, phone layouts, help, tutorials and local Pip commands.

## Contribution priorities

1. **Browser evidence:** reproducible Firefox, Safari and physical Android/iOS test reports, including streaming saves and interruption behavior.
2. **Accessible recovery:** stronger screen-reader status announcements and permission-denial guidance for the local library.
3. **Handoff summaries:** a whole-selection receipt with expected paths, recipient status and a clear list of anything still missing.
4. **Localization:** a small translation mechanism that keeps all help, labels and errors consistent.
5. **Connection diagnostics:** measured relay readiness and clearer direct/relay explanations without exposing network addresses or credentials.
6. **Operator tooling:** repeatable cross-network smoke checks and capacity measurements on real hosting.

Persistent pairing, QR invites and operating-system share integrations are useful ideas, but are not unique to Mystic. Discuss scope before starting them.

## Boundaries

The project remains browser-only. Continuing a transfer after every participating browser is closed requires a different architecture. Server file storage, account-based cloud delivery, tracking and paid AI services are outside the current direction. We will not advertise unlimited file sizes, guaranteed connectivity, or production concurrency that has not been measured.

Check [open issues](https://github.com/mkamrul9/ghostLink/issues) before choosing work and follow [CONTRIBUTING.md](CONTRIBUTING.md).
