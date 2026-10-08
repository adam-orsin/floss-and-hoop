// Runs a list of export jobs against the app.
// Usage: node scripts/render.mjs <jobs.json>
//        node scripts/render.mjs --eval "<async js run in the page>"
import fs from 'node:fs';
import { Driver, ensureServer } from './lib.mjs';

await ensureServer();
const driver = new Driver();
await driver.fresh();
const gpu = await driver.eval(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('GPU:', gpu);

const arg = process.argv[2];
if (arg === '--eval') {
  console.log(JSON.stringify(await driver.eval(`(async () => { ${process.argv[3]} })()`), null, 1));
} else {
  const jobs = JSON.parse(fs.readFileSync(arg, 'utf8'));
  let lastSet = null;
  for (const job of jobs) {
    const t0 = Date.now();
    if (job.set) { lastSet = job.set; await driver.fresh(); }
    const result = await driver.run(job, lastSet);
    if (job.out) fs.writeFileSync(job.out, JSON.stringify(result, null, 1));
    console.log(`${job.name || job.out || 'job'}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, result?.file || '');
  }
}
await driver.close();
