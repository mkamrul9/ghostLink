import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
async function walk(dir) {
    return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const files = ['server.js', ...await walk('src'), ...await walk('scripts'), ...await walk('tests')].filter(file => /\.(m?js)$/.test(file));
let failures = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) { process.stderr.write(result.stderr); failures++; }
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
        try { await readFile(path.resolve(path.dirname(file), match[1])); }
        catch { console.error(`Missing import in ${file}: ${match[1]}`); failures++; }
    }
}
console.log(`Checked syntax and relative imports in ${files.length} JavaScript files.`);
process.exitCode = failures ? 1 : 0;
