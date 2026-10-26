# Third-party notices

Mystic uses open-source packages under their respective licenses. See `package.json` and `package-lock.json` for the installed dependency versions.

The browser SHA-256 bundle in `src/vendor/sha256.js` is generated from **@noble/hashes**, copyright Paul Miller and contributors, under the MIT license. The full notice is retained in [src/vendor/noble-hashes.LICENSE](src/vendor/noble-hashes.LICENSE). Regenerate the bundle and license together with `npm run build:crypto`.

Development tools and test dependencies retain their upstream licenses; they are not copied into the served app. The browser UI and logo assets are maintained in this repository.

PairDrop is referenced as another project in the category. Mystic does not bundle PairDrop code or assets. A link is not an endorsement or an affiliation.
