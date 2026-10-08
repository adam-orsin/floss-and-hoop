// Turns an SVG into a cross-stitch pattern: a grid of thread indices, French knots,
// backstitch segments, and a report of the detail the grid could not hold.
import { hexToRgb, rgbToHex, rgbToLab, deltaE2000, nearestDmc, brandName } from './color.js';

const SAMPLES = 12; // samples per stitch along each axis
const SYMBOLS = ['●', '■', '▲', '◆', '✚', '★', '○', '□', '△', '◇', '✕', '☆', '♥', '♣', '◐', '▼'];

export function inspectSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  const problems = [];
  if (svg.nodeName !== 'svg' || doc.querySelector('parsererror')) {
    problems.push('The file does not parse as SVG.');
    return { problems, width: 0, height: 0, colors: [] };
  }
  let width, height;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    width = p[2]; height = p[3];
  } else {
    width = parseFloat(svg.getAttribute('width'));
    height = parseFloat(svg.getAttribute('height'));
  }
  if (!(width > 0 && height > 0)) problems.push('The SVG has no usable viewBox or size.');
  for (const tag of ['image', 'linearGradient', 'radialGradient', 'filter', 'mask', 'pattern', 'text']) {
    const n = doc.getElementsByTagName(tag).length;
    if (n) problems.push(`Contains ${n} <${tag}> element(s), which cross-stitch can't reproduce exactly.`);
  }
  const colors = new Set();
  const hexRe = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  for (const m of text.matchAll(hexRe)) colors.add(rgbToHex(hexToRgb(m[0])));
  const shapeCount = doc.querySelectorAll('path,polygon,polyline,rect,circle,ellipse,line').length;
  return { problems, width, height, colors: [...colors], shapeCount };
}

function loadImage(svgText, w, h) {
  // Force an explicit pixel size so the browser rasterizes at the sample resolution.
  const sized = svgText.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/gi, '');
    return `<svg${cleaned} width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">`;
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG failed to rasterize')); };
    img.src = url;
  });
}

// Rasterize once at the sample resolution and snap every opaque pixel to the SVG's own colors.
export async function rasterize(svgText, gridW, info) {
  const gridH = Math.max(1, Math.round((gridW * info.height) / info.width));
  const W = gridW * SAMPLES, H = gridH * SAMPLES;
  const img = await loadImage(svgText, W, H);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  const src = info.colors.map((hex) => ({ hex, rgb: hexToRgb(hex), count: 0 }));
  const label = new Int16Array(W * H).fill(-1);
  const cache = new Map();
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    if (data[i + 3] < 128) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      let best = 0, bestD = Infinity;
      for (let k = 0; k < src.length; k++) {
        const [r, g, b] = src[k].rgb;
        const d = (r - data[i]) ** 2 + (g - data[i + 1]) ** 2 + (b - data[i + 2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      idx = best;
      cache.set(key, idx);
    }
    label[p] = idx;
    src[idx].count++;
  }
  return { gridW, gridH, W, H, label, src, canvas };
}

// PNG and JPG input. Transparent pixels are empty fabric. Without transparency, a solid
// background that touches the border is treated as fabric too. The remaining pixels are
// reduced to a small palette with k-means in Lab space, and each palette entry snaps to a
// color that really occurs in the image, so threads never use invented colors.
export async function rasterizeImage(url, gridW, { maxColors = 8, keepBackground = false } = {}) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Image failed to load'));
    im.src = url;
  });
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const info = { width: iw, height: ih, problems: [], colors: [], raster: true };
  const gridH = Math.max(1, Math.round((gridW * ih) / iw));
  const W = gridW * SAMPLES, H = gridH * SAMPLES;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const opaque = new Uint8Array(W * H);
  let transparent = 0;
  for (let p = 0; p < W * H; p++) {
    if (data[p * 4 + 3] >= 128) opaque[p] = 1; else transparent++;
  }

  // Solid background: flood-fill from the border through pixels close to the border color.
  if (!keepBackground && transparent < W * H * 0.01) {
    const counts = new Map();
    const border = [];
    for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
    for (const p of border) {
      const k = ((data[p * 4] >> 4) << 8) | ((data[p * 4 + 1] >> 4) << 4) | (data[p * 4 + 2] >> 4);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let bestK = 0, bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { bestN = n; bestK = k; }
    if (bestN / border.length >= 0.6) {
      let br = 0, bg = 0, bb = 0, n = 0;
      for (const p of border) {
        const k = ((data[p * 4] >> 4) << 8) | ((data[p * 4 + 1] >> 4) << 4) | (data[p * 4 + 2] >> 4);
        if (k === bestK) { br += data[p * 4]; bg += data[p * 4 + 1]; bb += data[p * 4 + 2]; n++; }
      }
      const bgLab = rgbToLab([br / n, bg / n, bb / n]);
      const near = (p) => deltaE2000(rgbToLab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]), bgLab) < 10;
      const seen = new Uint8Array(W * H);
      const stack = [];
      for (const p of border) if (!seen[p] && near(p)) { seen[p] = 1; stack.push(p); }
      while (stack.length) {
        const p = stack.pop();
        opaque[p] = 0;
        const x = p % W, y = (p / W) | 0;
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
          if (q >= 0 && !seen[q] && near(q)) { seen[q] = 1; stack.push(q); }
        }
      }
      info.problems.push('Removed a solid background color. Set "keepBackground": true to stitch it.');
    }
  }

  // k-means++ on a sample of opaque pixels, in Lab.
  const sample = [];
  const step = Math.max(1, Math.floor((W * H) / 60000));
  // Learn colors only from flat interior pixels. Anti-aliased edges and JPEG fringes blend
  // two colors, and they'd otherwise become extra threads and hundreds of tiny shapes.
  const flat = (p) => {
    const x = p % W, y = (p / W) | 0;
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return false;
    for (const q of [p - 2, p + 2, p - 2 * W, p + 2 * W]) {
      if (!opaque[q]) return false;
      const d = Math.abs(data[q * 4] - data[p * 4]) + Math.abs(data[q * 4 + 1] - data[p * 4 + 1]) + Math.abs(data[q * 4 + 2] - data[p * 4 + 2]);
      if (d > 24) return false;
    }
    return true;
  };
  for (let p = 0; p < W * H; p += step) {
    if (opaque[p] && flat(p)) sample.push({ rgb: [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]] });
  }
  if (sample.length < 50) {
    for (let p = 0; p < W * H; p += step) if (opaque[p]) sample.push({ rgb: [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]] });
  }
  if (!sample.length) throw new Error('The image has no visible pixels after background removal.');
  for (const s of sample) s.lab = rgbToLab(s.rgb);
  const k = Math.min(maxColors, sample.length);
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const centers = [sample[Math.floor(sample.length / 2)].lab.slice()];
  const dmin = sample.map((s) => dist2(s.lab, centers[0]));
  while (centers.length < k) {
    let total = 0;
    for (const d of dmin) total += d;
    if (!total) break;
    let r = random() * total, i = 0;
    while (r > dmin[i] && i < dmin.length - 1) { r -= dmin[i]; i++; }
    centers.push(sample[i].lab.slice());
    sample.forEach((s, j) => { dmin[j] = Math.min(dmin[j], dist2(s.lab, centers[centers.length - 1])); });
  }
  const assign = new Int16Array(sample.length);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    sample.forEach((s, j) => {
      let best = 0, bd = Infinity;
      centers.forEach((c, ci) => { const d = dist2(s.lab, c); if (d < bd) { bd = d; best = ci; } });
      assign[j] = best;
      const t = sums[best]; t[0] += s.lab[0]; t[1] += s.lab[1]; t[2] += s.lab[2]; t[3]++;
    });
    centers.forEach((c, ci) => { const t = sums[ci]; if (t[3]) { c[0] = t[0] / t[3]; c[1] = t[1] / t[3]; c[2] = t[2] / t[3]; } });
  }
  // Drop clusters under 2% of the art; their pixels go to the nearest remaining color.
  const share = new Array(centers.length).fill(0);
  for (const c of assign) share[c]++;
  const keepIdx = centers.map((_, i) => i).filter((i) => share[i] >= sample.length * 0.02);
  for (let i = centers.length - 1; i >= 0; i--) if (!keepIdx.includes(i)) { centers.splice(i, 1); }
  sample.forEach((smp, j) => {
    let best = 0, bd = Infinity;
    centers.forEach((c, ci) => { const d = dist2(smp.lab, c); if (d < bd) { bd = d; best = ci; } });
    assign[j] = best;
  });
  // Snap each center to the closest real pixel color in its cluster.
  const palette = centers.map((c, ci) => {
    let best = null, bd = Infinity;
    sample.forEach((s, j) => { if (assign[j] === ci) { const d = dist2(s.lab, c); if (d < bd) { bd = d; best = s.rgb; } } });
    return best;
  }).filter(Boolean);
  const src = palette.map((rgb) => ({ hex: rgbToHex(rgb.map(Math.round)), rgb, lab: rgbToLab(rgb), count: 0 }));
  info.colors = src.map((s) => s.hex);

  const label = new Int16Array(W * H).fill(-1);
  const cache = new Map();
  for (let p = 0; p < W * H; p++) {
    if (!opaque[p]) continue;
    const key = (data[p * 4] << 16) | (data[p * 4 + 1] << 8) | data[p * 4 + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      const lab = rgbToLab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);
      let bd = Infinity;
      src.forEach((s, si) => { const d = dist2(lab, s.lab); if (d < bd) { bd = d; idx = si; } });
      cache.set(key, idx);
    }
    label[p] = idx;
    src[idx].count++;
  }
  return { info, raster: { gridW, gridH, W, H, label, src, canvas } };
}

// Merge the SVG's colors down to at most maxThreads. A merged group keeps the color of its
// largest member, so every thread is a color that appears in the original artwork.
function buildThreads(src, maxThreads, minArea) {
  let groups = src.filter((s) => s.count > 0).map((s) => ({
    members: [src.indexOf(s)], hex: s.hex, lab: rgbToLab(s.rgb), count: s.count,
  }));
  const mergeInto = (a, b) => {
    const keep = groups[a].count >= groups[b].count ? groups[a] : groups[b];
    const merged = { members: [...groups[a].members, ...groups[b].members], hex: keep.hex, lab: keep.lab,
      count: groups[a].count + groups[b].count };
    groups = groups.filter((_, i) => i !== a && i !== b);
    groups.push(merged);
  };
  const closestPair = (onlyIndex = -1) => {
    let best = null, bestD = Infinity;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (onlyIndex >= 0 && i !== onlyIndex && j !== onlyIndex) continue;
        const d = deltaE2000(groups[i].lab, groups[j].lab);
        if (d < bestD) { bestD = d; best = [i, j]; }
      }
    }
    return best;
  };
  // Fold in colors too small to ever become a stitch, then colors a stitcher couldn't tell apart.
  for (;;) {
    const tiny = groups.findIndex((g) => g.count < minArea);
    if (tiny < 0 || groups.length < 2) break;
    mergeInto(...closestPair(tiny));
  }
  for (;;) {
    if (groups.length < 2) break;
    const pair = closestPair();
    const d = deltaE2000(groups[pair[0]].lab, groups[pair[1]].lab);
    if (groups.length <= maxThreads && d > 4) break;
    mergeInto(...pair);
  }
  groups.sort((a, b) => b.count - a.count);
  const srcToThread = new Int16Array(src.length).fill(-1);
  groups.forEach((g, t) => g.members.forEach((m) => { srcToThread[m] = t; }));
  return { groups, srcToThread };
}

function components(lab, W, H) {
  const comp = new Int32Array(W * H).fill(-1);
  const list = [];
  const stack = new Int32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (lab[p] < 0 || comp[p] >= 0) continue;
    const id = list.length, t = lab[p];
    let sp = 0, area = 0, sx = 0, sy = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    stack[sp++] = p; comp[p] = id;
    while (sp) {
      const q = stack[--sp];
      const x = q % W, y = (q / W) | 0;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1];
      for (const n of nb) {
        if (n >= 0 && comp[n] < 0 && lab[n] === t) { comp[n] = id; stack[sp++] = n; }
      }
    }
    list.push({ id, thread: t, area, cx: sx / area, cy: sy / area, x0, y0, x1, y1 });
  }
  return { comp, list };
}

// Zhang-Suen thinning on a small binary grid.
function thin(mask, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      const del = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!mask[y * w + x]) continue;
          const P = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1),
            at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const B = P.reduce((a, b) => a + b, 0);
          if (B < 2 || B > 6) continue;
          let A = 0;
          for (let i = 0; i < 8; i++) if (!P[i] && P[(i + 1) % 8]) A++;
          if (A !== 1) continue;
          if (pass === 0 && (P[0] * P[2] * P[4] || P[2] * P[4] * P[6])) continue;
          if (pass === 1 && (P[0] * P[2] * P[6] || P[0] * P[4] * P[6])) continue;
          del.push(y * w + x);
        }
      }
      if (del.length) changed = true;
      for (const i of del) mask[i] = 0;
    }
  }
  return mask;
}

export function buildPattern(raster, opts = {}) {
  const { gridW, gridH, W, H, label: srcLabel, src } = raster;
  const S = SAMPLES, cellArea = S * S;
  const maxThreads = opts.maxThreads ?? 10;
  const useKnots = opts.knots ?? true;
  const useBackstitch = opts.backstitch ?? true;
  const fill = opts.fillThreshold ?? 0.5;

  const { groups, srcToThread } = buildThreads(src, maxThreads, cellArea * 0.15);
  const lab = new Int16Array(W * H);
  for (let p = 0; p < W * H; p++) lab[p] = srcLabel[p] < 0 ? -1 : srcToThread[srcLabel[p]];

  // Whole cross stitches: a cell is stitched when at least half of it is covered,
  // in whichever thread covers the most of it.
  const cells = new Int16Array(gridW * gridH).fill(-1);
  const nT = groups.length;
  const counts = new Int32Array(nT);
  for (let cy = 0; cy < gridH; cy++) {
    for (let cx = 0; cx < gridW; cx++) {
      counts.fill(0);
      let opaque = 0;
      for (let y = cy * S; y < cy * S + S; y++) {
        for (let x = cx * S; x < cx * S + S; x++) {
          const t = lab[y * W + x];
          if (t >= 0) { counts[t]++; opaque++; }
        }
      }
      if (opaque / cellArea >= fill) {
        let best = 0;
        for (let t = 1; t < nT; t++) if (counts[t] > counts[best]) best = t;
        cells[cy * gridW + cx] = best;
      }
    }
  }

  const { comp, list: comps } = components(lab, W, H);
  // How much of each original shape ended up under stitches of its own thread.
  for (const c of comps) c.kept = 0;
  for (let p = 0; p < W * H; p++) {
    const t = lab[p];
    if (t < 0) continue;
    const x = p % W, y = (p / W) | 0;
    if (cells[((y / S) | 0) * gridW + ((x / S) | 0)] === t) comps[comp[p]].kept++;
  }

  // French knots: small, compact dots that whole stitches would drop or turn into a lone square.
  const knots = [];
  const knotComps = new Set();
  if (useKnots) {
    for (const c of comps) {
      const areaCells = c.area / cellArea;
      const bw = (c.x1 - c.x0 + 1) / S, bh = (c.y1 - c.y0 + 1) / S;
      if (areaCells < 0.12 || areaCells > 1.6 || Math.max(bw, bh) > 2.2) continue;
      if (Math.max(bw, bh) / Math.max(0.01, Math.min(bw, bh)) > 2.5) continue;
      knotComps.add(c.id);
      knots.push({ hx: Math.round(c.cx / S), hy: Math.round(c.cy / S), thread: c.thread, area: areaCells });
    }
    // A knot replaces any lone stitch it would otherwise produce.
    for (let cy = 0; cy < gridH; cy++) {
      for (let cx = 0; cx < gridW; cx++) {
        const t = cells[cy * gridW + cx];
        if (t < 0) continue;
        const mid = comp[(cy * S + S / 2) * W + cx * S + S / 2];
        if (mid < 0 || !knotComps.has(mid)) continue;
        let lonely = true;
        for (let dy = -1; dy <= 1 && lonely; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < gridW && ny < gridH && cells[ny * gridW + nx] === t) { lonely = false; break; }
          }
        }
        if (lonely) cells[cy * gridW + cx] = -1;
      }
    }
    // One knot per hole.
    const seen = new Set();
    for (let i = knots.length - 1; i >= 0; i--) {
      const k = `${knots[i].hx},${knots[i].hy},${knots[i].thread}`;
      if (seen.has(k)) knots.splice(i, 1); else seen.add(k);
    }
  }

  // Backstitch: trace the centerline of thin detail that whole stitches lost.
  const backstitch = [];
  const backComps = new Set();
  if (useBackstitch) {
    for (const c of comps) {
      if (knotComps.has(c.id)) continue;
      const lost = c.area - c.kept;
      if (lost / cellArea >= 0.8 && c.kept / c.area < 0.75) backComps.add(c.id);
    }
    // Thin lines that only scraped a few whole stitches read as stray crosses. Hand those
    // stitches back to the thread underneath and stitch the whole line as backstitch.
    const thinComps = new Set([...backComps].filter((id) => comps[id].kept / comps[id].area < 0.4));
    const compCount = new Map();
    for (let cy = 0; cy < gridH; cy++) {
      for (let cx = 0; cx < gridW; cx++) {
        const t = cells[cy * gridW + cx];
        if (t < 0) continue;
        compCount.clear();
        counts.fill(0);
        for (let y = cy * S; y < cy * S + S; y++) {
          for (let x = cx * S; x < cx * S + S; x++) {
            const p = y * W + x, lt = lab[p];
            if (lt < 0) continue;
            counts[lt]++;
            if (lt === t) compCount.set(comp[p], (compCount.get(comp[p]) || 0) + 1);
          }
        }
        let dom = -1, domN = 0;
        for (const [id, n] of compCount) if (n > domN) { dom = id; domN = n; }
        if (!thinComps.has(dom)) continue;
        let alt = -1;
        for (let k = 0; k < nT; k++) if (k !== t && (alt < 0 || counts[k] > counts[alt])) alt = k;
        cells[cy * gridW + cx] = alt >= 0 && counts[alt] >= cellArea * 0.3 ? alt : -1;
      }
    }
    for (const c of comps) c.kept = 0;
    for (let p = 0; p < W * H; p++) {
      const t = lab[p];
      if (t < 0) continue;
      const x = p % W, y = (p / W) | 0;
      if (cells[((y / S) | 0) * gridW + ((x / S) | 0)] === t) comps[comp[p]].kept++;
    }
    const hw = gridW + 1, hh = gridH + 1, r = Math.round(S * 0.6);
    for (let t = 0; t < nT; t++) {
      const mask = new Uint8Array(hw * hh);
      let any = false;
      for (let hy = 0; hy < hh; hy++) {
        for (let hx = 0; hx < hw; hx++) {
          let hit = 0, tot = 0;
          for (let y = hy * S - r; y < hy * S + r; y += 2) {
            for (let x = hx * S - r; x < hx * S + r; x += 2) {
              tot++;
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const p = y * W + x;
              if (lab[p] !== t || !backComps.has(comp[p])) continue;
              if (cells[((y / S) | 0) * gridW + ((x / S) | 0)] === t) continue;
              hit++;
            }
          }
          if (hit / tot >= 0.1) { mask[hy * hw + hx] = 1; any = true; }
        }
      }
      if (!any) continue;
      thin(mask, hw, hh);
      const on = (x, y) => x >= 0 && y >= 0 && x < hw && y < hh && mask[y * hw + x];
      const edges = [];
      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < hw; x++) {
          if (!on(x, y)) continue;
          if (on(x + 1, y)) edges.push([x, y, x + 1, y]);
          if (on(x, y + 1)) edges.push([x, y, x, y + 1]);
          // Diagonals only where no square corner already joins the two holes.
          if (on(x + 1, y + 1) && !on(x + 1, y) && !on(x, y + 1)) edges.push([x, y, x + 1, y + 1]);
          if (on(x - 1, y + 1) && !on(x - 1, y) && !on(x, y + 1)) edges.push([x, y, x - 1, y + 1]);
        }
      }
      for (const [x1, y1, x2, y2] of edges) backstitch.push({ x1, y1, x2, y2, thread: t });
    }
  }

  // A thread that matches the fabric would be invisible, so a stitcher leaves that area as bare fabric.
  const skipped = new Set();
  if (opts.fabricHex) {
    const fab = rgbToLab(hexToRgb(opts.fabricHex));
    groups.forEach((g, t) => { if (deltaE2000(g.lab, fab) < 3) skipped.add(t); });
    if (skipped.size) {
      for (let i = 0; i < cells.length; i++) if (skipped.has(cells[i])) cells[i] = -1;
      for (let i = knots.length - 1; i >= 0; i--) if (skipped.has(knots[i].thread)) knots.splice(i, 1);
      for (let i = backstitch.length - 1; i >= 0; i--) if (skipped.has(backstitch[i].thread)) backstitch.splice(i, 1);
    }
  }

  // Threads, with chart symbols and the nearest DMC floss.
  const stitchCounts = new Array(nT).fill(0);
  for (const t of cells) if (t >= 0) stitchCounts[t]++;
  const threads = groups.map((g, i) => {
    const dmc = nearestDmc(g.hex);
    return {
      hex: g.hex,
      brand: brandName(g.hex),
      sourceColors: g.members.map((m) => src[m].hex),
      symbol: SYMBOLS[i % SYMBOLS.length],
      dmc,
      skipped: skipped.has(i),
      stitches: stitchCounts[i],
      knots: knots.filter((k) => k.thread === i).length,
      backstitch: backstitch.filter((b) => b.thread === i).length,
    };
  });

  // Detail report: shapes whose area mostly vanished and weren't rescued by a knot or backstitch.
  const lost = [];
  for (const c of comps) {
    const areaCells = c.area / cellArea;
    if (areaCells < 0.05) continue;
    const keptFrac = c.kept / c.area;
    const via = knotComps.has(c.id) ? 'knot' : backComps.has(c.id) ? 'backstitch' : null;
    if (keptFrac >= 0.5 && !via) continue;
    lost.push({
      thread: c.thread,
      areaStitches: +areaCells.toFixed(2),
      keptFraction: +keptFrac.toFixed(2),
      rescuedBy: via,
      box: [+(c.x0 / S).toFixed(1), +(c.y0 / S).toFixed(1), +((c.x1 + 1) / S).toFixed(1), +((c.y1 + 1) / S).toFixed(1)],
    });
  }
  // Shape match per thread: overlap of the original color area and the stitched cells (IoU).
  const inter = new Float64Array(nT), uni = new Float64Array(nT);
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = (p / W) | 0;
    const c = cells[((y / S) | 0) * gridW + ((x / S) | 0)], t = lab[p];
    if (t >= 0 && c === t) { inter[t]++; uni[t]++; } else {
      if (t >= 0) uni[t]++;
      if (c >= 0) uni[c]++;
    }
  }
  const shapeMatch = threads.map((th, t) => ({ hex: th.hex, iou: +(inter[t] / Math.max(1, uni[t])).toFixed(3) }));
  const totalArea = comps.reduce((a, c) => a + c.area, 0);
  const keptArea = comps.reduce((a, c) => a + c.kept, 0);
  const unrescued = lost.filter((l) => !l.rescuedBy);
  const report = {
    gridW, gridH,
    threads: threads.length,
    sourceColors: src.filter((s) => s.count > 0).length,
    shapes: comps.filter((c) => c.area / cellArea >= 0.05).length,
    areaKeptAsCrosses: +(keptArea / totalArea).toFixed(3),
    lostShapes: unrescued.length,
    lostArea: +unrescued.reduce((a, l) => a + l.areaStitches * (1 - l.keptFraction), 0).toFixed(1),
    knotShapes: lost.filter((l) => l.rescuedBy === 'knot').length,
    backstitchShapes: lost.filter((l) => l.rescuedBy === 'backstitch').length,
    shapeMatch,
    lost,
  };

  return { gridW, gridH, cells, threads, knots, backstitch, report, lab, comp, comps, samples: S };
}

// Draws the original artwork with every lost shape tinted, for reviewing detail loss.
export function lossOverlay(pattern, raster, scale = 2) {
  const { W, H } = raster;
  const { lab, comp, comps, gridW, cells, samples: S } = pattern;
  const lostIds = new Set();
  for (const c of comps) {
    if (c.area / (S * S) >= 0.05 && c.kept / c.area < 0.5) lostIds.add(c.id);
  }
  const canvas = document.createElement('canvas');
  canvas.width = W * scale / 2; canvas.height = H * scale / 2;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(raster.canvas, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.85;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const k = 2 / scale;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const p = Math.floor(y * k) * W + Math.floor(x * k);
      if (lab[p] < 0) continue;
      const i = (y * canvas.width + x) * 4;
      const cell = cells[Math.floor(y * k / S) * gridW + Math.floor(x * k / S)];
      if (lostIds.has(comp[p])) { img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 170; }
      else if (cell !== lab[p]) { img.data[i] = 255; img.data[i + 1] = 150; img.data[i + 2] = 0; }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
