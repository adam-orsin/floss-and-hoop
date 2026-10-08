// One command from an image to finished cross-stitch outputs.
// Usage: npm run make -- <image.svg|png|jpg> [options]
//   --name <key>        design key and file prefix (default: from the file name)
//   --label "<text>"    display name (default: from the file name)
//   --grid <n>          stitches across (default: picked automatically)
//   --fabric cream|white
//   --bg <hex>          backdrop color for stills and videos (default #8c2d3d)
//   --colors <n>        most thread colors to use (default 8 for images, 10 for SVG)
//   --keep-background   stitch a solid image background instead of removing it
//   --no-video          skip the videos (no ffmpeg needed)
//   --no-open           don't open the gallery and 3D viewer afterward
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, URL_BASE, Driver, ensureServer, hasFfmpeg, ffmpegHint, openInBrowser, score, reportMarkdown } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = { video: true, open: true };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--no-video') opt.video = false;
  else if (a === '--no-open') opt.open = false;
  else if (a === '--keep-background') opt.keepBackground = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else positional.push(a);
}
const input = positional[0];
if (!input) {
  console.error('Usage: npm run make -- <image.svg|png|jpg> [--grid 80] [--fabric cream|white] [--name key]');
  process.exit(1);
}
const src = path.resolve(process.env.INIT_CWD || process.cwd(), input);
if (!fs.existsSync(src)) { console.error(`Can't find ${src}`); process.exit(1); }
const ext = path.extname(src).toLowerCase();
if (!['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
  console.error(`Unsupported file type ${ext}. Use SVG, PNG, JPG, or WebP.`);
  process.exit(1);
}
const base = path.basename(src, path.extname(src));
const key = (opt.name || base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
const label = opt.label || base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fabric = opt.fabric === 'white' ? 'white' : 'cream';
const background = opt.bg ? `#${String(opt.bg).replace('#', '')}` : '#8c2d3d';

if (opt.video && !hasFfmpeg()) {
  console.error(`ffmpeg isn't installed, and the videos need it. Install it with:\n  ${ffmpegHint()}\nOr rerun with --no-video.`);
  process.exit(1);
}

// 1. Copy the art in and register it as a local design.
const file = `${key}${ext}`;
fs.copyFileSync(src, path.join(ROOT, 'assets', file));
const localPath = path.join(ROOT, 'assets', 'designs.local.json');
const local = fs.existsSync(localPath) ? JSON.parse(fs.readFileSync(localPath, 'utf8')) : {};
const entry = { label, file, grid: Number(opt.grid) || 80, fabric, background };
if (opt.colors) entry.maxColors = Number(opt.colors);
if (opt.keepBackground) entry.keepBackground = true;
local[key] = entry;
const save = () => fs.writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n');
save();
console.log(`Added design "${key}" from ${path.basename(src)}.`);

// 2. Start the app and a headless browser.
const started = await ensureServer();
if (started) console.log(`Started the app at ${URL_BASE} (it keeps running in the background).`);
const driver = new Driver();
await driver.fresh();

// 3. Pick a grid size: the smallest where every thread keeps its shape.
const analyze = (grid) => driver.eval(({ key, grid, fabric }) => window.flossHoop.analyze(key, grid, fabric), { key, grid, fabric });
let report;
if (opt.grid) {
  report = await analyze(entry.grid);
} else {
  console.log('Choosing a grid size…');
  let best = null;
  for (const g of [50, 60, 70, 80, 90, 100, 110, 120, 140, 160]) {
    const r = await analyze(g);
    const s = score(r);
    const lostOk = r.lostShapes <= Math.max(3, r.shapes * 0.03);
    console.log(`  ${g} stitches: shape match ${s.toFixed(2)}, ${r.lostShapes} small shapes lost`);
    if (!best || s > best.s + 0.02) best = { g, s, r };
    if (s >= 0.75 && lostOk) { best = { g, s, r }; break; }
  }
  entry.grid = best.g;
  report = best.r;
  save();
}
const grid = entry.grid;
console.log(`Using ${grid} stitches across (${report.gridW} × ${report.gridH}).`);

// 4. Render everything.
const prefix = `${key}-grid${grid}-${fabric}`;
const set = { design: key, grid, fabric, hoop: 'round', background };
const jobs = [
  { set, still: 'feed', name: `${prefix}-feed.png` },
  { still: 'story', name: `${prefix}-story.png` },
  { chart: label, name: `${key}-grid${grid}-chart.png` },
  { detail: true, name: `${key}-grid${grid}-detail-check.png` },
];
if (opt.video) {
  jobs.push({ set, video: { duration: 9 }, name: `${prefix}-push-in.mp4` });
  jobs.push({ set, video: { kind: 'stitch', duration: 8 }, name: `${prefix}-stitch-on.mp4` });
}
let lastSet = null;
for (const job of jobs) {
  if (job.set) { lastSet = job.set; await driver.fresh(); }
  const t0 = Date.now();
  await driver.run(job, lastSet);
  console.log(`  ${job.name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
await driver.close();

// 5. A plain-language report next to the exports.
fs.writeFileSync(path.join(ROOT, 'exports', `${key}-report.md`), reportMarkdown({ label, key, grid, fabric, report }));

const gallery = `${URL_BASE}gallery.html#${key}`;
const viewer = `${URL_BASE}?design=${key}&ui=0`;
console.log(`\nDone. Files are in exports/. Read exports/${key}-report.md for the floss list.`);
console.log(`Gallery: ${gallery}`);
console.log(`3D viewer: ${viewer}`);
if (opt.open) { openInBrowser(gallery); openInBrowser(viewer); }
