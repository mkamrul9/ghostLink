import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function browserOptions() {
    const runtime = resolve('test-results/runtime');
    await mkdir(resolve(runtime,'downloads'),{recursive:true});
    // Keep large browser profiles/downloads in the workspace, not a potentially
    // small system drive. These environment changes apply only to this test run.
    process.env.TMP=runtime;process.env.TEMP=runtime;process.env.TMPDIR=runtime;
    return {headless:true,channel:process.env.BROWSER_CHANNEL||undefined,downloadsPath:resolve(runtime,'downloads')};
}
