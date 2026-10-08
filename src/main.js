import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { inspectSvg, rasterize, rasterizeImage, buildPattern, lossOverlay } from './pattern.js';
import { StitchScene } from './scene.js';
import { drawChart } from './chart.js';
import { DESIGNS, FABRICS, SIZES, DEFAULT_BACKGROUND, loadDesigns } from './designs.js';

await loadDesigns();
const firstDesign = Object.keys(DESIGNS).find((k) => !DESIGNS[k].hidden) || Object.keys(DESIGNS)[0];

const $ = (id) => document.getElementById(id);
const view = $('view');
const stitch = new StitchScene(view);
const controls = new OrbitControls(stitch.camera, view);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 900;

const state = {
  design: firstDesign,
  grid: DESIGNS[firstDesign]?.grid || 80,
  fabric: DESIGNS[firstDesign]?.fabric || 'cream',
  hoop: 'round',
  background: DESIGNS[firstDesign]?.background || DEFAULT_BACKGROUND,
  knots: true,
  backstitch: true,
};
// URL parameters open a specific design, and ui=0 gives the full-screen 3D viewer.
const params = new URLSearchParams(location.search);
const viewer = params.get('ui') === '0';
if (params.get('design') && DESIGNS[params.get('design')]) {
  state.design = params.get('design');
  state.grid = Number(params.get('grid')) || DESIGNS[state.design].grid;
  state.fabric = DESIGNS[state.design].fabric || state.fabric;
  state.background = DESIGNS[state.design].background || state.background;
}
if (params.get('fabric') && FABRICS[params.get('fabric')]) state.fabric = params.get('fabric');
if (params.get('bg')) state.background = `#${params.get('bg').replace('#', '')}`;
if (viewer) document.body.classList.add('viewer');
let current = null; // { info, pattern }
let busy = false;
const fileCache = new Map();

function status(msg) { $('status').textContent = msg; }

// SVGs are rasterized from their vector data; PNG and JPG files go through color reduction.
async function loadDesign(key, grid, opts) {
  const d = DESIGNS[key];
  if (!d) throw new Error(`Unknown design "${key}". Add it to assets/designs.local.json.`);
  const isSvg = /\.svg$/i.test(d.file);
  if (!fileCache.has(d.file)) {
    const res = await fetch(`/${d.file}`);
    if (!res.ok) throw new Error(`Can't load assets/${d.file} (HTTP ${res.status}).`);
    fileCache.set(d.file, isSvg ? await res.text() : URL.createObjectURL(await res.blob()));
  }
  let info, raster;
  if (isSvg) {
    const text = fileCache.get(d.file);
    info = inspectSvg(text);
    if (!info.width) throw new Error(`${d.file}: ${info.problems.join(' ')}`);
    raster = await rasterize(text, grid, info);
  } else {
    ({ info, raster } = await rasterizeImage(fileCache.get(d.file), grid, { maxColors: d.maxColors, keepBackground: d.keepBackground }));
  }
  const pattern = buildPattern(raster, { knots: opts.knots, backstitch: opts.backstitch, fabricHex: FABRICS[opts.fabric].hex, maxThreads: d.maxColors });
  return { info, raster, pattern };
}

function frameDefault() {
  const aspect = view.clientWidth / view.clientHeight;
  const f = stitch.framing(aspect, 0.82);
  stitch.setView({ target: f.target, distance: f.distance, tilt: 0, aspect });
  controls.target.set(...f.target);
  controls.update();
}

async function rebuild({ keepView = false } = {}) {
  status('Building pattern…');
  current = await loadDesign(state.design, state.grid, state);
  stitch.build(current.pattern, {
    fabric: FABRICS[state.fabric].hex, hoop: state.hoop, background: state.background, back: viewer,
  });
  if (!keepView) frameDefault();
  const r = current.pattern.report;
  status(`${r.gridW}×${r.gridH} stitches, ${r.threads} threads (from ${r.sourceColors} artwork colors)\n`
    + `${current.pattern.knots.length} French knots, ${current.pattern.backstitch.length} backstitches\n`
    + `Area kept as whole crosses: ${(r.areaKeptAsCrosses * 100).toFixed(1)}%\n`
    + `Shapes lost: ${r.lostShapes}${current.info.problems.length ? '\n' + current.info.problems.join('\n') : ''}`);
}

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  stitch.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  stitch.renderer.setSize(w, h, false);
  stitch.camera.aspect = w / h;
  stitch.camera.updateProjectionMatrix();
}

function loop() {
  if (!busy) {
    controls.update();
    const dist = stitch.camera.position.distanceTo(controls.target);
    stitch.updateLod(controls.target, dist);
    stitch.fitShadow(controls.target, dist);
    stitch.render();
  }
  requestAnimationFrame(loop);
}

// ---------- exporting ----------
const exportCanvas = $('exportCanvas');

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

// A lost or busy GPU context can hand back an all-black frame. Retry instead of saving it.
async function captureFrameChecked(w, h, supersample = 2) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = captureFrame(w, h, supersample);
    const px = c.getContext('2d').getImageData(0, 0, w, h).data;
    let lit = false;
    for (let i = 0; i < px.length && !lit; i += 4 * 9973) if (px[i] + px[i + 1] + px[i + 2] > 0) lit = true;
    if (lit) return c;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  throw new Error('GPU returned blank frames four times in a row');
}

// Renders at 2x and downsamples, which smooths thread edges the way a camera would.
function captureFrame(w, h, supersample = 2) {
  stitch.renderer.setPixelRatio(supersample);
  stitch.renderer.setSize(w, h, false);
  stitch.render();
  exportCanvas.width = w; exportCanvas.height = h;
  const ctx = exportCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(view, 0, 0, w * supersample, h * supersample, 0, 0, w, h);
  return exportCanvas;
}

const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

async function withExport(fn) {
  busy = true;
  try { return await fn(); } finally {
    busy = false;
    stitch.dof = 0;
    stitch.endFinale();
    stitch.setReveal(1e9);
    stitch.setHoopPose(0, 0, 0);
    resize();
  }
}

function stillView(kind) {
  const [w, h] = SIZES[kind];
  const aspect = w / h;
  const f = stitch.framing(aspect, kind === 'feed' ? 0.86 : 0.84);
  return { w, h, aspect, ...f };
}

// Any camera view at any size, for close-up checks.
async function exportView(name, view, w = 1080, h = 1080) {
  return withExport(async () => {
    stitch.setView({ ...view, aspect: w / h });
    const c = await captureFrameChecked(w, h);
    return post(`/api/save?name=${name}`, await toBlob(c, 'image/png'));
  });
}

async function exportStill(kind, name) {
  return withExport(async () => {
    const v = stillView(kind);
    stitch.setView({ target: v.target, distance: v.distance, tilt: 4, spin: 0, aspect: v.aspect });
    // Stills render at 3x: dense stitching aliases into mush at 2x when the whole hoop is in frame.
    const c = await captureFrameChecked(v.w, v.h, 3);
    return post(`/api/save?name=${name}`, await toBlob(c, 'image/png'));
  });
}

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;

// Push-in: full hoop to a close-up where single threads fill the frame.
// The target moves in step with 1/distance so the focus point glides steadily toward center.
function pushInCamera(t, duration, v, focus, closeWidth, holdB = 1.1) {
  const holdA = 0.6;
  const p = Math.min(1, Math.max(0, (t - holdA) / (duration - holdA - holdB)));
  const e = easeInOut(p);
  const tanV = Math.tan((stitch.camera.fov * Math.PI) / 360);
  const dEnd = closeWidth / 2 / (tanV * v.aspect);
  const d = Math.exp(lerp(Math.log(v.distance), Math.log(dEnd), e));
  const w = (1 / d - 1 / v.distance) / (1 / dEnd - 1 / v.distance);
  const target = v.target.map((s, i) => lerp(s, focus[i], w));
  const macro = Math.min(1, Math.max(0, (e - 0.55) / 0.45));
  return { target, distance: d, tilt: lerp(4, 30, e), spin: lerp(-3, 9, e), aspect: v.aspect, dof: 0.0014 * macro * macro };
}

// Stitch-on: rows are sewn in (each row's half stitches, then the top legs back), then the
// hoop, held slightly lifted and tilted while stitching, is set down and settles.
function stitchOnFrame(t, duration, v) {
  const settleAt = duration - 2.2;
  const sewEnd = settleAt - 0.3;
  const total = stitch.revealTotal;
  const p = Math.min(1, Math.max(0, (t - 0.4) / (sewEnd - 0.4)));
  const perFrame = total / ((sewEnd - 0.4) * 30);
  const ao = p >= 1 ? Math.min(1, (t - sewEnd) / 0.8) : 0;
  stitch.setReveal(p >= 1 ? 1e9 : p * (total + perFrame * 8), Math.max(2, perFrame * 8), ao);
  const s = Math.max(0, t - settleAt);
  const damp = (k, w, phase = 0) => Math.exp(-k * s) * Math.cos(w * s + phase);
  const held = t < settleAt;
  const lift = held ? 2.2 : 2.2 * Math.max(0, damp(5.5, 9));
  const tiltX = held ? -3 : -3 * damp(4.5, 8);
  const tiltZ = held ? 1.2 : 1.2 * damp(4, 7);
  stitch.setHoopPose(Math.max(-0.15, lift), tiltX, tiltZ);
  const drift = Math.min(1, t / duration);
  stitch.setView({ target: v.target, distance: v.distance * (1.02 - 0.04 * drift), tilt: 6 - 2 * drift, spin: -2 + 2 * drift, aspect: v.aspect });
}

async function exportVideo(name, { duration = 9, fps = 30, kind = 'push', focus, closeWidth = 5.5, needle = false } = {}) {
  return withExport(async () => {
    const job = name.replace(/\W/g, '_');
    await post(`/api/frames-reset?job=${job}`);
    const v = stillView('story');
    const f = focus || stitch.focusPoint();
    const frames = Math.round(duration * fps);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      if (kind === 'push') {
        // With the needle finale, the zoom lands early and the last 3 s belong to the needle.
        const cam = pushInCamera(t, duration, v, f, closeWidth, needle ? 3.2 : 1.1);
        stitch.dof = cam.dof;
        stitch.setView(cam);
        if (needle) {
          if (i === 0) stitch.prepareFinale(f);
          stitch.setFinale(Math.min(1, Math.max(0, (t - (duration - 3.0)) / 2.4)));
          stitch.updateLod(stitch.lastTarget, cam.distance);
        }
      } else {
        stitchOnFrame(t, duration, v);
      }
      // Video frames render at 3x too; wide shots of dense stitching alias badly at 2x.
      const c = await captureFrameChecked(v.w, v.h, 3);
      await post(`/api/frame?job=${job}&i=${i}`, await toBlob(c, 'image/jpeg', 0.95));
      if (i % 15 === 0) status(`Rendering ${name}: frame ${i + 1}/${frames} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    }
    status(`Encoding ${name}…`);
    return post(`/api/encode?job=${job}&name=${name}&fps=${fps}`);
  });
}

async function exportChart(name, title) {
  const fabric = FABRICS[state.fabric];
  const c = drawChart(current.pattern, { title, fabricHex: fabric.hex, fabricName: state.fabric === 'cream' ? 'Cream' : 'White' });
  return post(`/api/save?name=${name}`, await toBlob(c, 'image/png'));
}

async function exportDetailCheck(name) {
  const c = lossOverlay(current.pattern, current.raster, 2);
  return post(`/api/save?name=${name}`, await toBlob(c, 'image/png'));
}

// Detail kept at each grid size, for choosing a size.
async function sweep(design, sizes = [40, 50, 60, 70, 80, 90, 100, 110, 120]) {
  const out = [];
  for (const n of sizes) {
    const { pattern } = await loadDesign(design, n, state);
    const r = pattern.report;
    out.push({ grid: n, height: r.gridH, areaKeptAsCrosses: r.areaKeptAsCrosses, lostShapes: r.lostShapes, lostArea: r.lostArea,
      knots: pattern.knots.length, backstitch: pattern.backstitch.length, threads: r.threads, shapeMatch: r.shapeMatch.map((m) => `${m.hex} ${m.iou}`).join(', ') });
  }
  return out;
}

// ---------- UI ----------
function initUi() {
  for (const [k, d] of Object.entries(DESIGNS)) $('design').add(new Option(d.label || k, k));
  for (const [k, f] of Object.entries(FABRICS)) $('fabric').add(new Option(f.label, k));
  const sync = () => {
    $('design').value = state.design; $('grid').value = state.grid; $('gridVal').textContent = state.grid;
    $('fabric').value = state.fabric; $('hoop').value = state.hoop; $('bg').value = state.background;
    $('knots').checked = state.knots; $('back').checked = state.backstitch;
  };
  sync();
  const on = (id, ev, fn) => $(id).addEventListener(ev, async (e) => { fn(e); sync(); await rebuild({ keepView: id !== 'design' && id !== 'hoop' }); });
  on('design', 'change', (e) => {
    state.design = e.target.value;
    const d = DESIGNS[state.design];
    state.grid = d.grid;
    state.fabric = d.fabric || state.fabric;
  });
  $('grid').addEventListener('input', (e) => { $('gridVal').textContent = e.target.value; });
  on('grid', 'change', (e) => { state.grid = Number(e.target.value); });
  on('fabric', 'change', (e) => { state.fabric = e.target.value; });
  on('hoop', 'change', (e) => { state.hoop = e.target.value; });
  on('bg', 'change', (e) => { state.background = e.target.value; });
  on('knots', 'change', (e) => { state.knots = e.target.checked; });
  on('back', 'change', (e) => { state.backstitch = e.target.checked; });

  const base = () => `${state.design}-${state.fabric}-${state.hoop}-grid${state.grid}`;
  const button = (id, fn) => $(id).addEventListener('click', async () => {
    document.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { const r = await fn(); status(`Saved ${r.file}`); } catch (e) { status(`Export failed: ${e.message}`); }
    document.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  });
  button('exFeed', () => exportStill('feed', `${base()}-feed.png`));
  button('exStory', () => exportStill('story', `${base()}-story.png`));
  button('exPush', () => exportVideo(`${base()}-push-in.mp4`));
  button('exStitch', () => exportVideo(`${base()}-stitch-on.mp4`, { kind: 'stitch', duration: 8 }));
  button('exChart', () => exportChart(`${state.design}-grid${state.grid}-chart.png`, DESIGNS[state.design].label || state.design));
}

// Automation hooks for scripts/render.mjs.
window.flossHoop = {
  async set(opts) { Object.assign(state, opts); await rebuild(); return current.pattern.report; },
  report: () => ({ ...current.pattern.report, threadsDetail: current.pattern.threads, svg: current.info }),
  designs: () => DESIGNS,
  // Pattern only, no 3D build: fast enough to try many grid sizes.
  async analyze(design, grid, fabric = state.fabric) {
    const { info, pattern } = await loadDesign(design, grid, { ...state, fabric });
    return { ...pattern.report, threadsDetail: pattern.threads, svg: info };
  },
  exportStill, exportView, exportVideo, exportChart, exportDetailCheck, sweep,
  focusPoint: () => stitch.focusPoint(),
  view: (v) => { stitch.setView({ aspect: stitch.camera.aspect, ...v }); controls.target.set(...(v.target || [0, 0, 0])); },
  THREE,
  stitch,
};

// Viewer controls: front, back, and a slow turntable spin.
function viewTo(azimuthDeg, polarDeg = 90) {
  const t = controls.target;
  const d = stitch.camera.position.distanceTo(t);
  const az = (azimuthDeg * Math.PI) / 180, po = (polarDeg * Math.PI) / 180;
  // Orbit is around world +Y; the fabric faces +Z, so azimuth 0 looks at the front.
  stitch.camera.position.set(t.x + d * Math.sin(po) * Math.sin(az), t.y + d * Math.cos(po), t.z + d * Math.sin(po) * Math.cos(az));
  controls.update();
}
if (viewer) {
  $('vFront').addEventListener('click', () => { controls.autoRotate = false; viewTo(0); });
  $('vBack').addEventListener('click', () => { controls.autoRotate = false; viewTo(180); });
  $('vSpin').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; });
  const zoom = (k) => {
    const t = controls.target, p = stitch.camera.position;
    const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, p.distanceTo(t) * k));
    p.sub(t).setLength(d).add(t);
    controls.update();
  };
  $('vIn').addEventListener('click', () => zoom(0.7));
  $('vOut').addEventListener('click', () => zoom(1 / 0.7));
  $('vReset').addEventListener('click', () => { controls.autoRotate = false; frameDefault(); });
  controls.autoRotateSpeed = 1.6;
  for (const [k, d] of Object.entries(DESIGNS)) {
    if (d.hidden && k !== state.design) continue;
    $('vDesign').add(new Option(d.label || k, k));
  }
  $('vDesign').value = state.design;
  $('vDesign').addEventListener('change', (e) => {
    const k = e.target.value;
    location.search = `?design=${k}&grid=${DESIGNS[k].grid}&fabric=${DESIGNS[k].fabric || 'cream'}&ui=0`;
  });
}

window.addEventListener('resize', resize);
initUi();
resize();
if (firstDesign) {
  await rebuild();
} else {
  // A fresh clone after npm run clear-examples has no designs yet.
  status('No designs yet. Make one with: npm run make -- path/to/image.png');
}
window.flossHoop.ready = true;
loop();
