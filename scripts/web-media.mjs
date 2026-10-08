// Makes the web-sized media the landing page and the static demo use:
//   examples/<key>/push-in.mp4 and stitch-on.mp4   720 px wide, a few MB each (stitch-on at 2x)
//   examples/<key>/push-in.jpg and stitch-on.jpg   first frames, shown until a video plays
//   examples/<key>/feed-thumb.jpg, chart-thumb.jpg  small versions for the gallery tiles
//   examples/viewer.jpg                            a still of the 3D viewer, turned a little
// The full-size renders stay in exports/, which git ignores.
// Usage: npm run examples:web (after npm run make or npm run render has made the videos)
//        npm run examples:web -- --images-only    (thumbnails, posters, and viewer still only)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT, URL_BASE, GPU_ARGS, ensureServer, hasFfmpeg, ffmpegHint } from './lib.mjs';

if (!hasFfmpeg()) { console.error(`ffmpeg is needed. Install it with: ${ffmpegHint()}`); process.exit(1); }
const imagesOnly = process.argv.includes('--images-only');
const designs = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'designs.json'), 'utf8'));
const exportsDir = path.join(ROOT, 'exports');
const LIMIT = 10 * 1024 * 1024;
const rel = (f) => path.relative(ROOT, f);
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;

function ffmpeg(args, what) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${what}`);
}

// A JPEG `width` pixels wide. Tiles show at about 290 px, so 600 px covers 2x screens.
function jpeg(src, out, width, input = []) {
  ffmpeg([...input, '-i', src, '-frames:v', '1', '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', '5', out], src);
  console.log(`${rel(out)}  ${kb(out)}`);
}

for (const [key, d] of Object.entries(designs)) {
  if (d.hidden) continue;
  const dir = path.join(ROOT, 'examples', key);
  fs.mkdirSync(dir, { recursive: true });
  for (const kind of ['push-in', 'stitch-on']) {
    const out = path.join(dir, `${kind}.mp4`);
    if (!imagesOnly) {
      const src = path.join(exportsDir, `${key}-grid${d.grid}-${d.fabric || 'cream'}-${kind}.mp4`);
      if (!fs.existsSync(src)) { console.warn(`Skipped ${key} ${kind}: no ${rel(src)}. Render it first.`); continue; }
      // The stitch-on plays at twice the rendered speed on the web, then holds the finished
      // piece for a beat before it loops.
      const vf = kind === 'stitch-on' ? 'setpts=0.5*PTS,fps=30,tpad=stop_mode=clone:stop_duration=1.5,scale=720:-2' : 'scale=720:-2';
      ffmpeg(['-i', src, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], src);
      const size = fs.statSync(out).size;
      if (size > LIMIT) throw new Error(`${rel(out)} is ${(size / 1e6).toFixed(1)} MB. Raise -crf to shrink it.`);
      console.log(`${rel(out)}  ${(size / 1e6).toFixed(1)} MB`);
    }
    if (fs.existsSync(out)) jpeg(out, path.join(dir, `${kind}.jpg`), 480);
  }
  if (fs.existsSync(path.join(dir, 'feed.jpg'))) jpeg(path.join(dir, 'feed.jpg'), path.join(dir, 'feed-thumb.jpg'), 600);
  if (fs.existsSync(path.join(dir, 'chart.png'))) jpeg(path.join(dir, 'chart.png'), path.join(dir, 'chart-thumb.jpg'), 640);
}

// A still of the 3D viewer for the landing page, turned slightly so it reads as 3D. It sits
// under the live hoop until that loads, so it's kept small.
const still = Object.keys(designs).find((k) => k === 'scalloped-border') || Object.keys(designs)[0];
if (still) {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1320 } });
  const d = designs[still];
  await page.goto(`${URL_BASE}?design=${still}&grid=${d.grid}&fabric=${d.fabric || 'cream'}&ui=0`);
  await page.waitForFunction(() => window.flossHoop?.ready, null, { timeout: 120000 });
  await page.evaluate(() => { for (const id of ['viewerBar', 'vHint']) document.getElementById(id).style.display = 'none'; });
  await page.waitForTimeout(2500);
  await page.mouse.move(600, 660);
  await page.mouse.down();
  await page.mouse.move(730, 630, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const full = path.join(ROOT, '.frames', 'viewer-full.png');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  await page.screenshot({ path: full });
  await browser.close();
  jpeg(full, path.join(ROOT, 'examples', 'viewer.jpg'), 800);
}
