// Procedural textures: Aida weave, thread fiber, and wood grain. All drawn on canvases,
// so nothing is downloaded and everything tiles cleanly at any zoom.
import * as THREE from 'three';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise on a period-sized lattice.
function makeNoise(period, seed) {
  const r = rand(seed);
  const g = new Float32Array(period * period).map(() => r());
  const at = (x, y) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function heightToNormal(height, w, h, strength, wrap = true) {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x, y) => {
    if (wrap) return height[((y + h) % h) * w + ((x + w) % w)];
    return height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function toTexture(rgba, w, h, { srgb = false, repeat = true } = {}) {
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Aida: warp and weft bundles that cross in a basket weave, leaving a hole at every
// stitch corner. One tile covers 2x2 stitches so the over/under alternates.
export function aidaTextures(px = 256) {
  const N = px * 2;
  const height = new Float32Array(N * N);
  const shade = new Float32Array(N * N);
  const fiberN = makeNoise(64, 11);
  const blot = makeNoise(16, 23);
  const bundleHalf = 0.37; // half-width of a thread bundle, in stitches
  const fibersPerBundle = 5;
  const prof = (d) => {
    const q = Math.min(1, Math.abs(d) / bundleHalf);
    return Math.sqrt(Math.max(0, 1 - q * q * q));
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / px, v = y / px; // stitch units, 0..2
      const cu = Math.floor(u), cv = Math.floor(v);
      const fu = u - cu - 0.5, fv = v - cv - 0.5; // offset from the stitch center
      // Horizontal bundle runs along u, centered on each stitch row.
      const hProf = prof(fv);
      const vProf = prof(fu);
      const hOver = (cu + cv) % 2 === 0;
      // Bundles dip where they pass under the crossing bundle and between stitches.
      const along = (t) => 0.5 + 0.5 * Math.cos(t * Math.PI * 2); // 1 at the stitch center
      const hLift = hOver ? 0.75 + 0.25 * along(fu) : 0.55 + 0.25 * (1 - along(fu));
      const vLift = hOver ? 0.55 + 0.25 * (1 - along(fv)) : 0.75 + 0.25 * along(fv);
      // Individual fibers inside each bundle.
      const hFib = 0.82 + 0.18 * Math.abs(Math.sin((fv / bundleHalf) * Math.PI * fibersPerBundle * 0.5 + fiberN(u * 24, v * 3) * 2));
      const vFib = 0.82 + 0.18 * Math.abs(Math.sin((fu / bundleHalf) * Math.PI * fibersPerBundle * 0.5 + fiberN(u * 3 + 40, v * 24) * 2));
      const hH = hProf > 0 ? hProf * hLift * hFib : 0;
      const vH = vProf > 0 ? vProf * vLift * vFib : 0;
      let hgt = Math.max(hH, vH);
      const fuzz = (fiberN(u * 40, v * 40) - 0.5) * 0.06;
      hgt = Math.max(0, hgt + fuzz * (hgt > 0 ? 1 : 0));
      height[y * N + x] = hgt;
      // Shading: holes read dark, valleys a little darker, slight blotchy cotton variation.
      const hole = hgt <= 0.02 ? 1 : 0;
      shade[y * N + x] = hole ? 0.6 : 0.7 + 0.3 * Math.min(1, hgt) - 0.04 + blot(u * 6, v * 6) * 0.08;
    }
  }
  const albedo = new Uint8ClampedArray(N * N * 4);
  const rough = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const s = Math.max(0, Math.min(1, shade[i])) * 255;
    albedo[i * 4] = albedo[i * 4 + 1] = albedo[i * 4 + 2] = s;
    albedo[i * 4 + 3] = 255;
    const r = 220 - height[i] * 30;
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = r;
    rough[i * 4 + 3] = 255;
  }
  return {
    map: toTexture(albedo, N, N, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, N, N, 9), N, N),
    roughnessMap: toTexture(rough, N, N),
  };
}

// Thread fibers: fine parallel ridges that the strand geometry wraps helically.
export function fiberTextures(w = 256, h = 256) {
  const n = makeNoise(32, 5);
  const height = new Float32Array(w * h);
  const albedo = new Uint8ClampedArray(w * h * 4);
  const fibers = 22; // across the texture width
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const wob = (n(u * 4, v * 8) - 0.5) * 0.6;
      const f = Math.abs(Math.sin((u * fibers + wob) * Math.PI));
      const ridge = Math.pow(f, 0.6);
      const streak = 0.85 + 0.15 * n(u * 32 + 7, v * 2);
      height[y * w + x] = ridge * streak;
      const a = (0.9 + 0.1 * ridge) * (0.96 + 0.04 * n(u * 64, v * 6)) * 255;
      const i = (y * w + x) * 4;
      albedo[i] = albedo[i + 1] = albedo[i + 2] = a;
      albedo[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, w, h, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, w, h, 5), w, h),
  };
}

// Pale birch hoop wood. u runs along the ring, v around the profile. Every noise lookup
// uses a frequency equal to its lattice period, so the texture wraps without a seam.
export function woodTextures(w = 2048, h = 256) {
  const n1 = makeNoise(8, 3), n2 = makeNoise(32, 9), n3 = makeNoise(256, 17), n4 = makeNoise(64, 29);
  const albedo = new Uint8ClampedArray(w * h * 4);
  const height = new Float32Array(w * h);
  const light = [240, 220, 186], dark = [222, 192, 148], late = [204, 166, 118];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const warp = (n1(u * 8, v * 8) - 0.5) * 1.6 + (n2(u * 32, v * 32) - 0.5) * 0.35;
      const ring = (((v * 10 + warp) % 1) + 1) % 1;
      const band = Math.pow(Math.max(0, Math.sin(ring * Math.PI)), 14);
      const streak = (n3(u * 256, v * 32 % 256) - 0.5) * 0.18;
      const pore = n4(u * 64, v * 64) > 0.8 ? 0.06 : 0;
      const t = Math.min(1, Math.max(0, band * 0.65 + streak + pore + 0.1));
      const c = t < 0.6 ? light.map((l, k) => l + (dark[k] - l) * (t / 0.6)) : dark.map((d, k) => d + (late[k] - d) * ((t - 0.6) / 0.4));
      const i = (y * w + x) * 4;
      albedo[i] = c[0]; albedo[i + 1] = c[1]; albedo[i + 2] = c[2]; albedo[i + 3] = 255;
      height[y * w + x] = -band * 0.25 - pore * 1.5 + streak * 0.3;
    }
  }
  return {
    map: toTexture(albedo, w, h, { srgb: true }),
    normalMap: toTexture(heightToNormal(height, w, h, 1.2), w, h),
  };
}
