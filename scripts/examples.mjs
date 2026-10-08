// Rebuilds examples/: a feed still, stitch chart, detail check, and floss report for every
// design in assets/designs.json, plus an animated GIF for the README. These ship with the
// repo so people can see the results on GitHub before running anything.
// Usage: npm run examples
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, Driver, ensureServer, hasFfmpeg, ffmpegHint, reportMarkdown } from './lib.mjs';

if (!hasFfmpeg()) { console.error(`ffmpeg is needed. Install it with: ${ffmpegHint()}`); process.exit(1); }
const ffmpeg = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};

const designs = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'designs.json'), 'utf8'));
const outDir = path.join(ROOT, 'examples');
const exportsDir = path.join(ROOT, 'exports');
fs.mkdirSync(outDir, { recursive: true });

await ensureServer();
const driver = new Driver();
const index = [];
for (const [key, d] of Object.entries(designs)) {
  if (d.hidden) continue;
  const fabric = d.fabric || 'cream';
  const set = { design: key, grid: d.grid, fabric, hoop: 'round', background: d.background || '#8c2d3d' };
  const prefix = `${key}-grid${d.grid}`;
  await driver.fresh();
  await driver.run({ set, still: 'feed', name: `${prefix}-${fabric}-feed.png` });
  await driver.run({ chart: d.label || key, name: `${prefix}-chart.png` });
  await driver.run({ detail: true, name: `${prefix}-detail-check.png` });
  const report = await driver.run({ report: true });

  const dir = path.join(outDir, key);
  fs.mkdirSync(dir, { recursive: true });
  ffmpeg(['-i', path.join(exportsDir, `${prefix}-${fabric}-feed.png`), '-vf', 'scale=720:-1', '-q:v', '3', path.join(dir, 'feed.jpg')]);
  fs.copyFileSync(path.join(exportsDir, `${prefix}-chart.png`), path.join(dir, 'chart.png'));
  fs.copyFileSync(path.join(exportsDir, `${prefix}-detail-check.png`), path.join(dir, 'detail-check.png'));
  const md = reportMarkdown({ label: d.label || key, key, grid: d.grid, fabric, report, detailImage: 'detail-check.png' })
    .replace(/^# (.*)$/m, '# $1\n\n![Rendered in a hoop](feed.jpg)\n\n[Stitch chart](chart.png) · [Detail check](detail-check.png)');
  fs.writeFileSync(path.join(dir, 'README.md'), md);
  index.push({ key, label: d.label || key, group: d.group || 'Designs', grid: d.grid, gridH: report.gridH });
  console.log(`examples/${key}`);
}

// One stitch-on GIF for the top of the README.
const hero = Object.keys(designs).find((k) => k === 'monogram-star') || index[0].key;
const hd = designs[hero];
const heroVideo = `${hero}-grid${hd.grid}-${hd.fabric || 'cream'}-stitch-on.mp4`;
await driver.fresh();
await driver.run({ set: { design: hero, grid: hd.grid, fabric: hd.fabric || 'cream', hoop: 'round', background: hd.background || '#8c2d3d' },
  video: { kind: 'stitch', duration: 8 }, name: heroVideo });
await driver.close();
const palette = path.join(ROOT, '.frames', 'palette.png');
fs.mkdirSync(path.dirname(palette), { recursive: true });
const crop = 'crop=in_w:in_w*1.1:0:(in_h-in_w*1.1)/2,fps=10,scale=360:-1:flags=lanczos';
ffmpeg(['-i', path.join(exportsDir, heroVideo), '-vf', `${crop},palettegen=max_colors=96:stats_mode=diff`, palette]);
ffmpeg(['-i', path.join(exportsDir, heroVideo), '-i', palette, '-lavfi', `${crop}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, path.join(outDir, 'stitch-on.gif')]);

// Index page.
const groups = [...new Set(index.map((e) => e.group))];
const lines = ['# Examples', '', 'Each design was rendered with `npm run make`. Open one for its stitch chart and floss list.', ''];
for (const g of groups) {
  lines.push(`## ${g}`, '', '| Design | Size | Rendered | Chart |', '|---|---|---|---|');
  for (const e of index.filter((x) => x.group === g)) {
    lines.push(`| [${e.label}](${e.key}/README.md) | ${e.grid} × ${e.gridH} stitches | <img src="${e.key}/feed.jpg" width="160" alt="${e.label} in a hoop"> | [Stitch chart](${e.key}/chart.png) |`);
  }
  lines.push('');
}
fs.writeFileSync(path.join(outDir, 'README.md'), lines.join('\n'));
console.log('Wrote examples/README.md and examples/stitch-on.gif');
