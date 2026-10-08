// Shared plumbing for the command-line scripts: the dev server, a headless browser that
// drives the app, and a job runner that recovers from lost GPU contexts.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const URL_BASE = process.env.FLOSS_HOOP_URL || 'http://127.0.0.1:5190/';

export async function serverUp() {
  try {
    const res = await fetch(URL_BASE, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Starts `npm run dev` in the background if nothing answers on the app's port. The server
// keeps running after the script exits, so the gallery and 3D viewer stay available.
export async function ensureServer() {
  if (await serverUp()) return false;
  fs.mkdirSync(path.join(ROOT, '.frames'), { recursive: true });
  const log = fs.openSync(path.join(ROOT, '.frames', 'dev-server.log'), 'a');
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: ROOT, detached: true, stdio: ['ignore', log, log],
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await serverUp()) return true;
  }
  throw new Error('The dev server did not start. See .frames/dev-server.log.');
}

export function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

export function ffmpegHint() {
  if (process.platform === 'darwin') return 'brew install ffmpeg';
  if (process.platform === 'win32') return 'winget install --id Gyan.FFmpeg';
  return 'sudo apt-get install -y ffmpeg';
}

export const GPU_ARGS = [
  '--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu',
  '--disable-domain-blocking-for-3d-apis', '--disable-gpu-process-crash-limit',
  // Machines without a usable GPU fall back to software WebGL: slower, but it works.
  '--enable-unsafe-swiftshader',
  ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
];

// A fresh browser per design: after many builds Chrome's GPU process can drop the WebGL
// context and then block WebGL for the site until the browser restarts.
export class Driver {
  constructor(url = URL_BASE) { this.url = url; this.browser = null; this.page = null; }

  async fresh() {
    if (this.browser) await this.browser.close();
    try {
      this.browser = await chromium.launch({ headless: true, args: GPU_ARGS });
    } catch (e) {
      throw new Error(`Headless Chromium isn't installed. Run: npx playwright install chromium\n${e.message.split('\n')[0]}`);
    }
    this.page = await this.browser.newPage({ viewport: { width: 1200, height: 900 } });
    this.page.on('console', (m) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /CONTEXT_LOST/.test(m.text()))) console.error('[page]', m.text());
    });
    this.page.on('pageerror', (e) => console.error('[page error]', e.message));
    await this.page.goto(this.url);
    await this.page.waitForFunction(() => window.flossHoop?.ready, null, { timeout: 120000 });
  }

  async eval(fn, arg) {
    if (!this.page) await this.fresh();
    return this.page.evaluate(fn, arg);
  }

  // Runs one job object (see README) and retries once in a fresh browser if the GPU drops.
  async run(job, lastSet) {
    const exec = (j) => this.page.evaluate(async (j) => {
      const h = window.flossHoop;
      if (j.set) await h.set(j.set);
      if (j.still) return h.exportStill(j.still, j.name);
      if (j.view) return h.exportView(j.name, j.view, j.w, j.h);
      if (j.video) return h.exportVideo(j.name, j.video);
      if (j.chart) return h.exportChart(j.name, j.chart);
      if (j.detail) return h.exportDetailCheck(j.name);
      if (j.report) return h.report();
      if (j.sweep) return h.sweep(j.sweep);
      return null;
    }, j);
    if (!this.page) await this.fresh();
    try {
      return await exec(job);
    } catch (e) {
      console.error(`Retrying ${job.name || 'job'} in a fresh browser: ${e.message.split('\n')[0]}`);
      await this.fresh();
      return exec({ ...job, set: job.set || lastSet });
    }
  }

  async close() { if (this.browser) await this.browser.close(); }
}

export function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

// Shape match weighted by how much of the design each thread covers, so one tiny accent
// color can't decide the size on its own. 1.00 means the stitches match the art exactly.
export function score(r) {
  let sum = 0, weight = 0;
  r.shapeMatch.forEach((m, i) => {
    const t = r.threadsDetail[i];
    if (t.skipped || !t.stitches) return;
    sum += m.iou * t.stitches;
    weight += t.stitches;
  });
  return weight ? sum / weight : 0;
}

// The plain-language report: size, floss to buy, and what the stitching changes.
// detailImage is the file name of the detail check, as the reader will find it.
export function reportMarkdown({ label, key, grid, fabric, report, detailImage = `${key}-grid${grid}-detail-check.png` }) {
  const per14 = (n) => (n / 14).toFixed(1), per18 = (n) => (n / 18).toFixed(1);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const lines = [
    `# ${label}`,
    '',
    `- **Size:** ${report.gridW} × ${report.gridH} stitches. On 14-count Aida that's ${per14(report.gridW)} × ${per14(report.gridH)} in; on 18-count, ${per18(report.gridW)} × ${per18(report.gridH)} in.`,
    `- **Fabric:** ${fabric} Aida.`,
    `- **Shape match:** ${score(report).toFixed(2)} (1.00 is a perfect match with the original art).`,
    '',
    '## Floss to buy',
    '',
    '| Color | DMC | Name | Cross stitches | Skeins (about) |',
    '|---|---|---|---|---|',
    ...report.threadsDetail.map((t) => (t.skipped
      ? `| ${t.hex.toUpperCase()} | none | Not stitched: matches the fabric | 0 | 0 |`
      : `| ${t.hex.toUpperCase()} | ${t.dmc.code} | ${t.dmc.name} | ${t.stitches} | ${Math.max(1, Math.ceil((t.stitches + t.backstitch * 0.4 + t.knots) / 1400))} |`)),
    '',
    'DMC matches are the closest by color math. Check them against a real DMC color card before you buy.',
    '',
    '## What the stitching changes',
    '',
  ];
  const notes = [];
  if (report.knotShapes) notes.push(`${plural(report.knotShapes, 'small dot becomes a French knot', 'small dots become French knots')}.`);
  if (report.backstitchShapes) notes.push(`${plural(report.backstitchShapes, 'thin line becomes', 'thin lines become')} backstitch (single-thread outlines).`);
  if (report.lostShapes) notes.push(`${plural(report.lostShapes, 'shape is', 'shapes are')} too small to stitch at this size. The pink areas in \`${detailImage}\` show where.`);
  for (const p of report.svg?.problems || []) notes.push(p);
  if (score(report) < 0.75) notes.push('This art has more detail than cross-stitch can hold at this size. Bold, simple art with a few flat colors stitches best.');
  if (!notes.length) notes.push('Nothing important is lost at this size.');
  lines.push(...notes.map((n) => `- ${n}`), '');
  return lines.join('\n');
}
