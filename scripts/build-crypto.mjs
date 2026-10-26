import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({ entryPoints: ['scripts/hash-entry.mjs'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, outfile: 'src/vendor/sha256.js', legalComments: 'eof' });
await copyFile('node_modules/@noble/hashes/LICENSE', 'src/vendor/noble-hashes.LICENSE');
