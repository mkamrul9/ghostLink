# Contributing to Mystic

Thanks for helping make private folder sharing easier to use. Code, documentation, accessibility checks, and browser testing are welcome.

## Find something to work on

Check existing issues first. Use the bug-report form for reproducible problems and the feature form for proposals. Issues labeled **good first issue** are intended to be bounded starting points. Ask in the issue before starting a large change so that scope and approach can be discussed.

Security vulnerabilities belong in [private reports](SECURITY.md), not public issues. Do not include real files, room invites, private messages, encryption keys, passphrases, or relay credentials in reports. Use sample data and remove personal information from screenshots.

## Local setup

Use Node.js 22 or later and npm. Fork the repository, clone your fork, and install dependencies:

```sh
npm ci
npm run dev
```

Open http://localhost:8080. Two independent browser profiles simulate separate devices. A localhost link cannot connect another computer; cross-device testing needs HTTPS and the same deployed website on both devices.

Use a descriptive branch name. Keep changes focused; avoid mixing formatting, unrelated cleanup, and behavior changes in one pull request.

## Before opening a pull request

```sh
npm run build:pwa
npm run check
npm test
npx playwright install chromium
npm run verify
```

Run the checks relevant to your change while working, then the full verification before requesting review. For a documentation-only change, check links and examples; do not claim code tests were run if they were not. Add tests for transfer protocol, persistence, permissions, or security behavior changes. For UI changes, include desktop and narrow-phone screenshots using sample data.

Browser tests keep profiles and downloads in `test-results/runtime/`, which is ignored. The large-file test needs space for browser storage and a 280 MiB download. To use installed Chrome, set `BROWSER_CHANNEL=chrome`. CI uses Chrome on Ubuntu and currently tests Node.js 22.

Useful scripts:

- `npm run test:recovery`: protection, backups, restore and idle locking.
- `npm run test:local-folder`: folder permissions, encrypted disk storage and database-loss recovery.
- `npm run test:group`: explicit recipients, group sharing and large selections.
- `npm run test:large`: real large transfer and streaming export.
- `npm run test:messages`: real multi-peer notes, receipts, search, local history and mobile conversation layout.
- `npm run test:pwa`: offline shell, local downloads, install metadata and waiting-worker updates.
- `npm run test:mobile`: six viewport sizes and reduced keyboard space.
- `npm run docs:screenshots`: regenerate README screenshots from sample files.

If you update `@noble/hashes`, run `npm run build:crypto` and commit `src/vendor/sha256.js` and its license. CI checks that the bundle matches the installed dependency.

## Implementation expectations

- Keep file contents, names, messages and file keys off the signaling connection.
- Preserve byte verification, durable acknowledgements, bounded buffering and safe paths.
- Never replace user files or migrate storage silently. Browser storage and a selected local folder are separate locations.
- Treat the selected folder as a capability: use the granted handle, validate record names, and hold the exclusive writer lock while unlocked.
- Keep plain wording and SVG icons. Avoid adding a dependency or cloud service when the platform already provides the needed capability.
- Preserve keyboard access, focus, touch controls and reduced-motion behavior.
- Update relevant help text and documentation when behavior or limits change.
- Never commit secrets, real user data, generated test profiles or screenshots containing active private invites.

The [architecture guide](docs/architecture.md) describes module boundaries. The [security model](docs/security-model.md) explains what the current encryption does and does not protect.

## Review

Explain the user-visible problem, the behavior after the change, and how it was verified. Link any relevant issue and note browser or deployment limitations. Maintainers may ask for a smaller scope or another test. Review timing is not guaranteed.

By contributing, you agree that your contribution is available under the project's [ISC license](LICENSE). Follow the [code of conduct](CODE_OF_CONDUCT.md). No separate contributor agreement is required.
