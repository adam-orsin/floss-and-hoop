// Makes the web-sized media the landing page and the static demo use:
//   examples/<key>/push-in.mp4 and stitch-on.mp4   720 px wide, a few MB each
//   examples/viewer.jpg                            a still of the 3D viewer, turned a little
// The full-size renders stay in exports/, which git ignores.
// Usage: npm run examples:web (after npm run make or npm run render has made the videos)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT, URL_BASE, GPU_ARGS, ensureServer, hasFfmpeg, ffmpegHint } from './lib.mjs';

if (!hasFfmpeg()) { console.error(`ffmpeg is needed. Install it with: ${ffmpegHint()}`); process.exit(1); }
const designs = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'designs.json'), 'utf8'));
const exportsDir = path.join(ROOT, 'exports');
const LIMIT = 10 * 1024 * 1024;

for (const [key, d] of Object.entries(designs)) {
  if (d.hidden) continue;
  const dir = path.join(ROOT, 'examples', key);
  fs.mkdirSync(dir, { recursive: true });
  for (const kind of ['push-in', 'stitch-on']) {
    const src = path.join(exportsDir, `${key}-grid${d.grid}-${d.fabric || 'cream'}-${kind}.mp4`);
    if (!fs.existsSync(src)) { console.warn(`Skipped ${key} ${kind}: no ${path.relative(ROOT, src)}. Render it first.`); continue; }
    const out = path.join(dir, `${kind}.mp4`);
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${src}`);
    const size = fs.statSync(out).size;
    if (size > LIMIT) throw new Error(`${path.relative(ROOT, out)} is ${(size / 1e6).toFixed(1)} MB. Raise -crf to shrink it.`);
    console.log(`examples/${key}/${kind}.mp4  ${(size / 1e6).toFixed(1)} MB`);
  }
}

// A still of the 3D viewer for the landing page, turned slightly so it reads as 3D.
const still = Object.keys(designs).find((k) => k === 'scalloped-border') || Object.keys(designs)[0];
if (still) {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1320 } });
  const d = designs[still];
  await page.goto(`${URL_BASE}?design=${still}&grid=${d.grid}&fabric=${d.fabric || 'cream'}&ui=0`);
  await page.waitForFunction(() => window.flossHoop?.ready, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('viewerBar').style.display = 'none'; });
  await page.waitForTimeout(2500);
  await page.mouse.move(600, 660);
  await page.mouse.down();
  await page.mouse.move(730, 630, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ROOT, 'examples', 'viewer.jpg'), quality: 84, type: 'jpeg' });
  await browser.close();
  console.log('examples/viewer.jpg');
}
