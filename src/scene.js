// Three.js scene: Aida fabric, cross stitches, French knots, backstitch, and a wooden hoop.
// World units are stitches. The fabric lies in the XY plane and faces +Z.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { aidaTextures, fiberTextures, woodTextures } from './textures.js';

const HOOP = { width: 3.8, height: 4.6, lip: 0.45, round: 1.6 }; // ring profile, in stitches
const BRASS = 0xc8a24e;
const FINALE_ORDER = 100000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One cross-stitch leg: two plies of floss twisted around each other, arcing from hole to hole.
function strandGeometry({ len = 1.36, arc = 0.14, dive = 0.07, twists = 1.5, phase = 0, segs = 28, radial = 12,
  ry = 0.165, rz = 0.064, spreadY = 0.115, spreadZ = 0.028 } = {}) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let k = 0; k < 2; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, s = 2 * t - 1;
      const cx = (t - 0.5) * len;
      const cz = arc * (1 - s ** 4) - dive * s ** 10;
      const dz = (arc * -4 * s ** 3 - dive * 10 * s ** 9) * (2 / len);
      const tl = Math.hypot(1, dz);
      const T = [1 / tl, 0, dz / tl];
      const N2 = [-T[2], 0, T[0]];
      const end = Math.min(t, 1 - t);
      const taper = 0.55 + 0.45 * smooth(0, 0.16, end);
      const th = Math.PI * 2 * twists * t + phase + k * Math.PI;
      const oy = spreadY * Math.cos(th) * taper, oz = spreadZ * Math.sin(th) * taper;
      for (let j = 0; j <= radial; j++) {
        const ph = (j / radial) * Math.PI * 2;
        const c = Math.cos(ph), sn = Math.sin(ph);
        const a = ry * taper * c, b = rz * taper * sn;
        pos.push(cx + b * N2[0], oy + a, cz + oz + b * N2[2]);
        let nx = rz * c, nz = ry * sn;
        const nl = Math.hypot(nx, nz);
        nx /= nl; nz /= nl;
        nor.push(nz * N2[0], nx, nz * N2[2]);
        // Darken where the plies press together, toward the holes, and on the underside.
        const inward = Math.max(0, -(c * Math.cos(th) + sn * Math.sin(th)));
        let ao = 1 - 0.25 * inward;
        ao *= 0.7 + 0.3 * smooth(0, 0.2, end);
        ao *= sn < 0 ? 0.9 + 0.1 * (1 + sn) : 1;
        col.push(ao, ao, ao);
        uv.push((j / radial) * 2 + t * len * 2.4, t * len * 1.2);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Loose working thread: two plies twisted around a curve, matching the stitched legs.
function twistedThread(curve, { segs = 220, radial = 10, ply = 0.085, spread = 0.07, twistsPerUnit = 1.1 } = {}) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pts = curve.getSpacedPoints(segs);
  const length = curve.getLength();
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let k = 0; k < 2; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, P = pts[i], N = frames.normals[i], B = frames.binormals[i];
      const th = Math.PI * 2 * twistsPerUnit * length * t + k * Math.PI;
      const c0 = P.clone().addScaledVector(N, spread * Math.cos(th)).addScaledVector(B, spread * Math.sin(th));
      for (let j = 0; j <= radial; j++) {
        const ph = (j / radial) * Math.PI * 2;
        const n = N.clone().multiplyScalar(Math.cos(ph)).addScaledVector(B, Math.sin(ph));
        const v = c0.clone().addScaledVector(n, ply);
        pos.push(v.x, v.y, v.z);
        nor.push(n.x, n.y, n.z);
        const inward = Math.max(0, -(Math.cos(ph) * Math.cos(th) + Math.sin(ph) * Math.sin(th)));
        const ao = 1 - 0.25 * inward;
        col.push(ao, ao, ao);
        uv.push((j / radial) * 2 + t * length * 2.4, t * length * 1.2);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// A French knot: a short tube wound into a tight bead.
function knotGeometry() {
  const g = new THREE.TorusKnotGeometry(0.2, 0.085, 96, 10, 3, 4);
  g.scale(1, 1, 0.72);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const z = p.getZ(i);
    const ao = 0.62 + 0.38 * smooth(-0.2, 0.15, z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Lets each instance grow in at its own moment, for the stitch-on animation.
function addReveal(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uniforms.uReveal;
    shader.uniforms.uRevealSoft = uniforms.uRevealSoft;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aReveal;\nuniform float uReveal;\nuniform float uRevealSoft;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float grow = clamp((uReveal - aReveal) / uRevealSoft, 0.0, 1.0);
        grow = grow * grow * (3.0 - 2.0 * grow);
        transformed.x *= grow;
        transformed.yz *= mix(0.4, 1.0, grow);
        transformed *= step(0.0001, grow);`);
  };
  return material;
}

function roundedRectProfile(w, h, r, perCorner = 7) {
  const pts = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = ((a0 + (90 * i) / perCorner) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Sweeps a closed profile (n = outward, z = up) along a planar path of {x, y, nx, ny, s}.
function sweep(path, profile, { uScale = 1, caps = true } = {}) {
  const pos = [], uv = [], idx = [];
  const P = profile.length;
  let perim = 0;
  const pv = [0];
  for (let j = 1; j <= P; j++) {
    perim += Math.hypot(profile[j % P][0] - profile[j - 1][0], profile[j % P][1] - profile[j - 1][1]);
    pv.push(perim);
  }
  for (const q of path) {
    for (let j = 0; j <= P; j++) {
      const [n, z] = profile[j % P];
      pos.push(q.x + q.nx * n, q.y + q.ny * n, z);
      uv.push(q.s * uScale, pv[j] / perim);
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < P; j++) {
      const a = i * (P + 1) + j, b = a + P + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!caps) return g;
  // End caps where the ring opens for the clasp.
  const capGeoms = [];
  for (const [q, flip] of [[path[0], true], [path[path.length - 1], false]]) {
    const cp = [], ci = [];
    let mz = 0;
    for (const [, z] of profile) mz += z / P;
    cp.push(q.x, q.y, mz);
    for (const [n, z] of profile) cp.push(q.x + q.nx * n, q.y + q.ny * n, z);
    for (let j = 0; j < P; j++) {
      const a = 1 + j, b = 1 + ((j + 1) % P);
      if (flip) ci.push(0, b, a); else ci.push(0, a, b);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P + 1) * 2).fill(0.5), 2));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    capGeoms.push(cg);
  }
  return [g, ...capGeoms];
}

// Path samples for the ring centerline, leaving a gap at the top for the clasp.
function ringPath(style, size, gap, steps = 720) {
  const out = [];
  if (style === 'round') {
    const R = size;
    const half = gap / 2 / R;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI / 2 + half + ((Math.PI * 2 - 2 * half) * i) / steps;
      out.push({ x: R * Math.cos(a), y: R * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a), s: (a - Math.PI / 2) * R });
    }
    return out;
  }
  // Rounded square: straight sides joined by quarter circles, walked from the top center.
  const A = size, rc = size * 0.42, L = A - rc;
  const segs = [
    { type: 'line', from: [0, A], to: [-L, A], n: [0, 1] },
    { type: 'arc', c: [-L, L], a0: 90, a1: 180 },
    { type: 'line', from: [-A, L], to: [-A, -L], n: [-1, 0] },
    { type: 'arc', c: [-L, -L], a0: 180, a1: 270 },
    { type: 'line', from: [-L, -A], to: [L, -A], n: [0, -1] },
    { type: 'arc', c: [L, -L], a0: 270, a1: 360 },
    { type: 'line', from: [A, -L], to: [A, L], n: [1, 0] },
    { type: 'arc', c: [L, L], a0: 0, a1: 90 },
    { type: 'line', from: [L, A], to: [0, A], n: [0, 1] },
  ];
  const lens = segs.map((sg) => (sg.type === 'line' ? Math.hypot(sg.to[0] - sg.from[0], sg.to[1] - sg.from[1]) : (Math.PI / 2) * rc));
  const total = lens.reduce((a, b) => a + b, 0);
  const at = (s) => {
    let acc = 0;
    for (let k = 0; k < segs.length; k++) {
      if (s <= acc + lens[k] || k === segs.length - 1) {
        const f = (s - acc) / lens[k], sg = segs[k];
        if (sg.type === 'line') {
          return { x: sg.from[0] + (sg.to[0] - sg.from[0]) * f, y: sg.from[1] + (sg.to[1] - sg.from[1]) * f, nx: sg.n[0], ny: sg.n[1] };
        }
        const a = ((sg.a0 + (sg.a1 - sg.a0) * f) * Math.PI) / 180;
        return { x: sg.c[0] + rc * Math.cos(a), y: sg.c[1] + rc * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) };
      }
      acc += lens[k];
    }
  };
  for (let i = 0; i <= steps; i++) {
    const s = gap / 2 + ((total - gap) * i) / steps;
    out.push({ ...at(s), s });
  }
  return out;
}

function hoopInnerShape(style, inner) {
  const shape = new THREE.Shape();
  if (style === 'round') {
    shape.absarc(0, 0, inner, 0, Math.PI * 2, false);
    return shape;
  }
  const A = inner, rc = Math.max(0.5, inner * 0.42 - HOOP.width / 2);
  shape.moveTo(-A + rc, -A);
  shape.lineTo(A - rc, -A);
  shape.absarc(A - rc, -A + rc, rc, -Math.PI / 2, 0, false);
  shape.lineTo(A, A - rc);
  shape.absarc(A - rc, A - rc, rc, 0, Math.PI / 2, false);
  shape.lineTo(-A + rc, A);
  shape.absarc(-A + rc, A - rc, rc, Math.PI / 2, Math.PI, false);
  shape.lineTo(-A, -A + rc);
  shape.absarc(-A + rc, -A + rc, rc, Math.PI, Math.PI * 1.5, false);
  return shape;
}

function knurledCylinder(radius, length, ridges = 28) {
  const g = new THREE.CylinderGeometry(radius, radius, length, ridges * 4, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    if (r < radius * 0.5) continue;
    const k = 1 + 0.06 * Math.max(0, Math.cos(a * ridges));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class StitchScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 5000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    // The fabric lies flat facing +Z, so "up" for the sky and the room is +Z.
    this.scene.environmentRotation.set(Math.PI / 2, 0, 0);

    this.key = new THREE.DirectionalLight(0xfff6ea, 2.6);
    this.keyDir = new THREE.Vector3(-0.5, 0.62, 1).normalize();
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(4096, 4096);
    this.key.shadow.bias = -0.0008;
    this.key.shadow.normalBias = 0.06;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);
    // Lights the back of the work when the viewer turns the hoop over. Off for exports.
    this.backLight = new THREE.DirectionalLight(0xfff6ea, 0);
    this.backLight.position.set(0.4, 0.5, -1);
    this.scene.add(this.backLight);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d0c6, 0.2);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);

    this.fiber = fiberTextures();
    this.aida = aidaTextures();
    this.wood = woodTextures();
    this.reveal = { uReveal: { value: 1e9 }, uRevealSoft: { value: 1 } };
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.bounds = { radius: 50, top: 50, bottom: -50 };
  }

  threadMaterial() {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, map: this.fiber.map, normalMap: this.fiber.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.46, sheen: 0.5, sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0x808080),
    });
    return addReveal(m, this.reveal);
  }

  depthMaterial() {
    return addReveal(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.reveal);
  }

  // Frees everything a build created. Shared textures (fiber, Aida, wood) stay alive.
  clear() {
    const shared = new Set([this.fiber.map, this.fiber.normalMap, this.aida.map, this.aida.normalMap,
      this.aida.roughnessMap, this.wood.map, this.wood.normalMap]);
    const mats = new Set();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      if (o.material) mats.add(o.material);
      if (o.customDepthMaterial) mats.add(o.customDepthMaterial);
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture && !shared.has(v)) v.dispose();
      m.dispose();
    }
    this.group.clear();
  }

  // opts: { fabric: hex, hoop: 'round'|'square', background: hex, seed }
  build(pattern, opts) {
    this.clear();
    this.pattern = pattern;
    this.opts = opts;
    const { gridW: W, gridH: H, cells, threads } = pattern;
    const rand = rng(opts.seed ?? 7);
    const cellX = (cx) => cx - W / 2 + 0.5;
    const cellY = (cy) => H / 2 - cy - 0.5;
    const holeX = (hx) => hx - W / 2;
    const holeY = (hy) => H / 2 - hy;
    const threadColors = threads.map((t) => new THREE.Color(t.hex));

    // Hoop size: clear the stitched area by a comfortable margin.
    let reach = 0;
    for (let cy = 0; cy < H; cy++) {
      for (let cx = 0; cx < W; cx++) {
        if (cells[cy * W + cx] < 0) continue;
        const x = Math.abs(cellX(cx)) + 0.71, y = Math.abs(cellY(cy)) + 0.71;
        reach = Math.max(reach, opts.hoop === 'round' ? Math.hypot(x, y) : Math.max(x, y));
      }
    }
    for (const k of pattern.knots) {
      const x = Math.abs(holeX(k.hx)) + 0.4, y = Math.abs(holeY(k.hy)) + 0.4;
      reach = Math.max(reach, opts.hoop === 'round' ? Math.hypot(x, y) : Math.max(x, y));
    }
    const margin = Math.max(4, reach * 0.12);
    const inner = Math.ceil(reach + margin);
    this.inner = inner;

    // Stitches. Ordered row by row: half stitches left to right, then the top legs back.
    // Each leg exists at two levels of detail; updateLod() decides which one draws.
    const variantCount = 3;
    const per = Array.from({ length: variantCount }, () => []);
    let order = 0;
    for (let cy = 0; cy < H; cy++) {
      const row = [];
      for (let cx = 0; cx < W; cx++) if (cells[cy * W + cx] >= 0) row.push(cx);
      for (const cx of row) per[Math.floor(rand() * variantCount)].push({ cx, cy, top: false, order: order++ });
      for (const cx of row.slice().reverse()) per[Math.floor(rand() * variantCount)].push({ cx, cy, top: true, order: order++ });
    }
    this.stitchCount = order;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const tint = new THREE.Color();
    const threadMat = this.threadMaterial();
    const depthMat = this.depthMaterial();
    this.lodSets = [];
    for (let vi = 0; vi < variantCount; vi++) {
      const list = per[vi];
      if (!list.length) continue;
      const n = list.length;
      const data = { n, matrices: new Float32Array(n * 16), colors: new Float32Array(n * 3), reveal: new Float32Array(n), xy: new Float32Array(n * 2), top: new Uint8Array(n) };
      list.forEach((st, i) => {
        const angle = (st.top ? -Math.PI / 4 : Math.PI / 4) + (rand() - 0.5) * 0.06;
        q.setFromAxisAngle(zAxis, angle);
        v.set(cellX(st.cx) + (rand() - 0.5) * 0.03, cellY(st.cy) + (rand() - 0.5) * 0.03, st.top ? 0.02 : 0);
        const h = (st.top ? 1.45 : 1) * (0.92 + rand() * 0.16);
        sc.set(1 + (rand() - 0.5) * 0.04, 0.94 + rand() * 0.12, h);
        m4.compose(v, q, sc);
        m4.toArray(data.matrices, i * 16);
        tint.copy(threadColors[cells[st.cy * W + st.cx]]).multiplyScalar(0.96 + rand() * 0.06);
        tint.toArray(data.colors, i * 3);
        data.reveal[i] = st.order;
        data.top[i] = st.top ? 1 : 0;
        data.xy[i * 2] = v.x; data.xy[i * 2 + 1] = v.y;
      });
      const phase = vi * 2.1;
      const meshes = {};
      for (const [lod, geo] of [['lo', { segs: opts.back ? 16 : 10, radial: opts.back ? 8 : 6 }], ['hi', {}]]) {
        const g = strandGeometry({ phase, ...geo });
        g.setAttribute('aReveal', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
        const mesh = new THREE.InstancedMesh(g, threadMat, n);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.customDepthMaterial = depthMat;
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.group.add(mesh);
        meshes[lod] = mesh;
      }
      this.lodSets.push({ data, meshes });
    }
    this.lodKey = null;
    this.updateLod(new THREE.Vector3(), Infinity);

    // Back of the work, for the 3D viewer: stitching in rows leaves short vertical bars on the
    // back along both side edges of every stitch.
    if (opts.back) {
      const g = strandGeometry({ len: 1, arc: 0.06, dive: 0.04, segs: 10, radial: 6 });
      g.rotateX(Math.PI);
      const bars = [];
      for (let cy = 0; cy < H; cy++) {
        for (let cx = 0; cx < W; cx++) {
          const t = cells[cy * W + cx];
          if (t < 0) continue;
          bars.push([cellX(cx) - 0.44, cellY(cy), t], [cellX(cx) + 0.44, cellY(cy), t]);
        }
      }
      const mesh = new THREE.InstancedMesh(g, threadMat, bars.length);
      bars.forEach(([x, y, t], i) => {
        q.setFromAxisAngle(zAxis, Math.PI / 2 + (rand() - 0.5) * 0.08);
        v.set(x, y, -0.07);
        sc.set(1, 0.9 + rand() * 0.15, 0.9 + rand() * 0.2);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, tint.copy(threadColors[t]).multiplyScalar(0.94 + rand() * 0.06));
      });
      g.setAttribute('aReveal', new THREE.InstancedBufferAttribute(new Float32Array(bars.length), 1));
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    // French knots sit in the holes, wound on top of any stitches around them.
    if (pattern.knots.length) {
      const g = knotGeometry();
      const mesh = new THREE.InstancedMesh(g, threadMat, pattern.knots.length);
      const reveal = new Float32Array(pattern.knots.length);
      pattern.knots.forEach((k, i) => {
        const raised = this.cellAround(k.hx, k.hy) ? 0.3 : 0.12;
        q.setFromAxisAngle(zAxis, rand() * Math.PI * 2);
        v.set(holeX(k.hx), holeY(k.hy), raised);
        const s = 0.95 + rand() * 0.15;
        sc.set(s, s, s);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        tint.copy(threadColors[k.thread]).multiplyScalar(0.96 + rand() * 0.06);
        mesh.setColorAt(i, tint);
        reveal[i] = order + i * 2;
      });
      g.setAttribute('aReveal', new THREE.InstancedBufferAttribute(reveal, 1));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.customDepthMaterial = depthMat;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    // Backstitch: single flat legs from hole to hole, laid over the crosses.
    if (pattern.backstitch.length) {
      const g = strandGeometry({ len: 1, arc: 0.05, dive: 0.06, twists: 1.6, ry: 0.1, rz: 0.065, spreadY: 0.07, spreadZ: 0.025 });
      const mesh = new THREE.InstancedMesh(g, threadMat, pattern.backstitch.length);
      const reveal = new Float32Array(pattern.backstitch.length);
      const knotEnd = order + pattern.knots.length * 2;
      pattern.backstitch.forEach((b, i) => {
        const x1 = holeX(b.x1), y1 = holeY(b.y1), x2 = holeX(b.x2), y2 = holeY(b.y2);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
        const over = this.cellAround(mx, my) ? 0.24 : 0.02;
        q.setFromAxisAngle(zAxis, Math.atan2(y2 - y1, x2 - x1));
        v.set((x1 + x2) / 2, (y1 + y2) / 2, over);
        sc.set(len * 0.98, 0.95 + rand() * 0.1, 1);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        tint.copy(threadColors[b.thread]).multiplyScalar(0.96 + rand() * 0.06);
        mesh.setColorAt(i, tint);
        reveal[i] = knotEnd + i;
      });
      g.setAttribute('aReveal', new THREE.InstancedBufferAttribute(reveal, 1));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.customDepthMaterial = depthMat;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.revealTotal = order + pattern.knots.length * 2 + pattern.backstitch.length;

    // Fabric, cut to the hoop and tucked under the ring.
    const shape = hoopInnerShape(opts.hoop, inner + HOOP.width * 0.9);
    const fg = new THREE.ShapeGeometry(shape, 128);
    const fp = fg.attributes.position;
    const fuv = new Float32Array(fp.count * 2), fuv1 = new Float32Array(fp.count * 2);
    const span = (inner + HOOP.width) * 2;
    for (let i = 0; i < fp.count; i++) {
      fuv[i * 2] = fp.getX(i) + W / 2;
      fuv[i * 2 + 1] = fp.getY(i) + H / 2;
      fuv1[i * 2] = fp.getX(i) / span + 0.5;
      fuv1[i * 2 + 1] = fp.getY(i) / span + 0.5;
    }
    fg.setAttribute('uv', new THREE.BufferAttribute(fuv, 2));
    fg.setAttribute('uv1', new THREE.BufferAttribute(fuv1, 2));
    const fabricMat = new THREE.MeshPhysicalMaterial({
      side: opts.back ? THREE.DoubleSide : THREE.FrontSide,
      color: new THREE.Color(opts.fabric), map: this.aida.map, normalMap: this.aida.normalMap,
      normalScale: new THREE.Vector2(1, 1), roughnessMap: this.aida.roughnessMap, roughness: 1,
      sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff),
      aoMap: this.stitchShadowTexture(pattern, span), aoMapIntensity: 0.55,
    });
    for (const t of [fabricMat.map, fabricMat.normalMap, fabricMat.roughnessMap]) t.repeat.set(0.5, 0.5);
    fabricMat.aoMap.channel = 1;
    const fabric = new THREE.Mesh(fg, fabricMat);
    this.fabricMat = fabricMat;
    fabric.receiveShadow = true;
    this.group.add(fabric);

    // Hoop ring.
    const centerline = inner + HOOP.width / 2;
    const gap = 1.7;
    const profile = roundedRectProfile(HOOP.width, HOOP.height, HOOP.round, 10).map(([n, z]) => [n, z + HOOP.height / 2 - HOOP.height + HOOP.lip + 0.15]);
    const ringLen = opts.hoop === 'round' ? Math.PI * 2 * centerline : centerline * 8;
    const parts = sweep(ringPath(opts.hoop, centerline, gap), profile, { uScale: 1 / (ringLen / Math.max(1, Math.round(ringLen / 70))) });
    const woodMat = new THREE.MeshPhysicalMaterial({
      map: this.wood.map, normalMap: this.wood.normalMap, normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45,
    });
    for (const g of parts) {
      const m = new THREE.Mesh(g, woodMat);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    const ringTop = HOOP.lip + 0.15;
    const ringBottom = ringTop - HOOP.height;

    // Clasp at the top: wooden lugs on the ring ends, brass plates, a screw, and a knurled nut.
    const brass = new THREE.MeshPhysicalMaterial({ color: BRASS, metalness: 1, roughness: 0.28, clearcoat: 0.2 });
    const clasp = new THREE.Group();
    const topY = centerline;
    const lugW = 1.5, lugOut = 3.2, lugH = HOOP.height * 0.92;
    const midZ = (ringTop + ringBottom) / 2;
    const lugLen = HOOP.width + lugOut;
    const lugY = topY - HOOP.width / 2 + 0.5 + (lugLen - 0.5) / 2;
    for (const side of [-1, 1]) {
      const x = side * (gap / 2 + lugW / 2 - 0.02);
      const lug = new THREE.Mesh(new RoundedBoxGeometry(lugW, lugLen - 0.5, lugH, 4, 0.45), woodMat);
      lug.position.set(x, lugY, midZ);
      const plate = new THREE.Mesh(new RoundedBoxGeometry(0.16, lugOut * 0.82, lugH * 0.8, 2, 0.06), brass);
      plate.position.set(x + side * (lugW / 2 + 0.06), topY + HOOP.width / 2 + lugOut * 0.45, midZ);
      for (const m of [lug, plate]) { m.castShadow = m.receiveShadow = true; clasp.add(m); }
    }
    const screwY = topY + HOOP.width / 2 + lugOut * 0.5;
    const screwLen = gap + lugW * 2 + 2.6;
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, screwLen, 24), brass);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(0.35, screwY, midZ + 0.2);
    const nut = new THREE.Mesh(knurledCylinder(1.15, 1.0), brass);
    nut.rotation.z = Math.PI / 2;
    nut.position.set(gap / 2 + lugW + 0.75, screwY, midZ + 0.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass);
    head.rotation.z = Math.PI / 2;
    head.position.set(-(gap / 2 + lugW + 0.18), screwY, midZ + 0.2);
    for (const m of [screw, nut, head]) { m.castShadow = m.receiveShadow = true; clasp.add(m); }
    this.group.add(clasp);

    // Shadow catcher: the backdrop color stays exact, only the shadow darkens it.
    if (this.ground) { this.scene.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.dispose(); }
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.ground.position.z = ringBottom - 0.02;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // In the 3D viewer the hoop floats so it can be turned over; no table under it.
    this.ground.visible = !opts.back;
    this.backLight.intensity = opts.back ? 2.3 : 0;
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.scene.background = new THREE.Color(opts.background);

    const outer = inner + HOOP.width;
    this.bounds = { radius: outer, top: topY + HOOP.width / 2 + lugOut, bottom: -outer, ringTop };
  }

  // Full-detail thread only where the camera is close; the light version everywhere else.
  updateLod(target, distance) {
    if (!this.lodSets) return;
    const near = distance < 90;
    const R = near ? Math.max(14, distance * 0.75) : -1;
    const key = near ? `${Math.round(target.x / 3)},${Math.round(target.y / 3)},${Math.round(R / 4)}` : 'far';
    if (key === this.lodKey) return;
    this.lodKey = key;
    for (const { data, meshes } of this.lodSets) {
      const fill = { lo: 0, hi: 0 };
      for (let i = 0; i < data.n; i++) {
        const dx = data.xy[i * 2] - target.x, dy = data.xy[i * 2 + 1] - target.y;
        const lod = near && dx * dx + dy * dy < R * R ? 'hi' : 'lo';
        const m = meshes[lod], j = fill[lod]++;
        m.instanceMatrix.array.set(data.matrices.subarray(i * 16, i * 16 + 16), j * 16);
        m.instanceColor.array.set(data.colors.subarray(i * 3, i * 3 + 3), j * 3);
        m.geometry.attributes.aReveal.array[j] = data.reveal[i];
      }
      for (const lod of ['lo', 'hi']) {
        const m = meshes[lod];
        m.count = fill[lod];
        // An empty instanced mesh in the shadow pass crashes the Metal driver, so hide it.
        m.visible = m.count > 0;
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
        m.geometry.attributes.aReveal.needsUpdate = true;
      }
    }
  }

  // Stitch-on progress: legs, knots, and backstitch appear in stitching order up to `count`.
  // ao (0 to 1) scales the fabric's soft shading. It covers the whole design at once, so the
  // stitch-on keeps it off while sewing and eases it in after the last stitch.
  setReveal(count, soft = 1, ao = 1) {
    this.reveal.uReveal.value = count;
    this.reveal.uRevealSoft.value = soft;
    if (this.fabricMat) this.fabricMat.aoMapIntensity = 0.55 * ao;
  }

  // Hoop pose for the settle at the end of the stitch-on: lift (stitches) and tilt (degrees).
  setHoopPose(lift = 0, tiltX = 0, tiltZ = 0) {
    this.group.position.z = lift;
    this.group.rotation.x = (tiltX * Math.PI) / 180;
    this.group.rotation.z = (tiltZ * Math.PI) / 180;
  }

  // Needle finale: hold back the top leg nearest `point`, then a needle pulls it into place.
  prepareFinale(point) {
    this.endFinale();
    let best = null, bestD = Infinity;
    for (const set of this.lodSets) {
      const { data } = set;
      for (let i = 0; i < data.n; i++) {
        if (!data.top[i]) continue;
        const d = Math.hypot(data.xy[i * 2] - point[0], data.xy[i * 2 + 1] - point[1]);
        if (d < bestD) { bestD = d; best = { data, i }; }
      }
    }
    if (!best) return null;
    const { data, i } = best;
    const cx = Math.round(data.xy[i * 2] - 0.5) + 0.5, cy = Math.round(data.xy[i * 2 + 1] - 0.5) + 0.5;
    const f = { data, i, savedReveal: data.reveal[i], start: new THREE.Vector3(cx - 0.5, cy + 0.5, 0.06),
      end: new THREE.Vector3(cx + 0.5, cy - 0.5, 0.06), color: new THREE.Color().fromArray(data.colors, i * 3) };
    // Hidden until uReveal passes the sentinel. Kept small enough that float32 can still
    // resolve fractions of a stitch there, and above every real stitch order.
    data.reveal[i] = FINALE_ORDER;
    this.lodKey = null;
    this.reveal.uReveal.value = FINALE_ORDER;
    this.reveal.uRevealSoft.value = 1;

    const L = 22, r = 0.27;
    const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.25, 0.25), new THREE.Vector2(r * 0.75, 1.1), new THREE.Vector2(r, 2.2),
      new THREE.Vector2(r, L - 1.4), new THREE.Vector2(r * 1.15, L - 0.8), new THREE.Vector2(r * 0.9, L - 0.15), new THREE.Vector2(0, L)];
    const ng = new THREE.LatheGeometry(prof, 40);
    const needle = new THREE.Mesh(ng, new THREE.MeshPhysicalMaterial({ color: 0xeef0f4, metalness: 0.95, roughness: 0.22, envMapIntensity: 9, clearcoat: 0.6 }));
    needle.castShadow = true;
    this.scene.add(needle);
    const threadMat = new THREE.MeshPhysicalMaterial({ color: f.color, vertexColors: true, map: this.fiber.map, normalMap: this.fiber.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.46, sheen: 0.5, sheenRoughness: 0.3, sheenColor: new THREE.Color(0x808080) });
    const thread = new THREE.Mesh(new THREE.BufferGeometry(), threadMat);
    thread.castShadow = true;
    this.scene.add(thread);
    f.needle = needle; f.thread = thread; f.L = L;
    this.finale = f;
    return f;
  }

  // g runs 0 to 1: needle hovers over the end hole, plunges through it, and the leg pulls tight.
  setFinale(g) {
    const f = this.finale;
    if (!f) return;
    const ease = (x) => x * x * (3 - 2 * x);
    const axis = new THREE.Vector3(0.68, 0.2, 0.7).normalize();
    // Tip offset along the needle axis: hover (+5), touch (0), through the fabric (-14).
    const a = Math.min(1, g / 0.3), b = Math.min(1, Math.max(0, (g - 0.3) / 0.55));
    const off = g < 0.3 ? 5 - 4 * ease(a) : 1 - 15 * ease(b);
    const tip = f.end.clone().addScaledVector(axis, off);
    f.needle.position.copy(tip);
    f.needle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    f.needle.visible = g > 0 && g < 0.97;
    // The working thread comes up out of the start hole, arcs over the end hole, and runs to
    // the eye. As the needle pulls through, the arc flattens into the leg.
    const eye = tip.clone().addScaledVector(axis, f.L - 1.2);
    const pull = Math.min(1, Math.max(0, (g - 0.35) / 0.5));
    const lift = 1.4 * (1 - ease(pull)) + 0.12;
    const dir = f.end.clone().sub(f.start).setZ(0).normalize();
    const p0 = f.start.clone().setZ(-0.4);
    const p1 = f.start.clone().addScaledVector(dir, 0.15).setZ(0.25 + lift * 0.4);
    const p2 = f.start.clone().lerp(f.end, 0.55).setZ(0.15 + lift);
    const p3 = f.end.clone().setZ(0.15 + lift * 0.5);
    const pts = eye.z > 0.3 ? [p0, p1, p2, p3, eye.clone().lerp(p3, 0.65), eye] : [p0, p1, p2, f.end.clone().setZ(0.1), f.end.clone().setZ(-0.6), eye];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    f.thread.geometry.dispose();
    f.thread.geometry = twistedThread(curve);
    // The finished leg replaces the loose thread once it lies flat.
    const grow = Math.min(1, Math.max(0, (g - 0.72) / 0.18));
    this.reveal.uReveal.value = FINALE_ORDER + grow;
    f.thread.visible = g > 0 && grow < 1;
  }

  endFinale() {
    const f = this.finale;
    if (!f) return;
    for (const m of [f.needle, f.thread]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    f.data.reveal[f.i] = f.savedReveal;
    this.lodKey = null;
    this.reveal.uReveal.value = 1e9;
    this.finale = null;
  }

  cellAround(hx, hy) {
    const { gridW: W, gridH: H, cells } = this.pattern;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const cx = Math.floor(hx) + dx, cy = Math.floor(hy) + dy;
      if (cx >= 0 && cy >= 0 && cx < W && cy < H && cells[cy * W + cx] >= 0) return true;
    }
    return false;
  }

  // Soft darkening of the fabric around raised stitches (ambient occlusion). Built as raw
  // pixel data, not a 2D canvas: Chrome can evict canvases under memory pressure, which
  // leaves an empty map that reads as full shadow.
  stitchShadowTexture(pattern, span) {
    const res = 6;
    const size = Math.ceil(span * res);
    const { gridW: W, gridH: H, cells } = pattern;
    let a = new Float32Array(size * size).fill(1);
    const x0 = (span / 2 - W / 2) * res, y0 = (span / 2 - H / 2) * res;
    for (let cy = 0; cy < H; cy++) {
      for (let cx = 0; cx < W; cx++) {
        if (cells[cy * W + cx] < 0) continue;
        for (let y = Math.floor(y0 + cy * res - 1); y < y0 + (cy + 1) * res + 1; y++) {
          for (let x = Math.floor(x0 + cx * res - 1); x < x0 + (cx + 1) * res + 1; x++) {
            if (x >= 0 && y >= 0 && x < size && y < size) a[y * size + x] = 0.48;
          }
        }
      }
    }
    // Two box-blur passes in each direction approximate a soft Gaussian.
    const r = Math.round(res * 0.5);
    const blur = (src, horiz) => {
      const out = new Float32Array(size * size);
      for (let j = 0; j < size; j++) {
        let acc = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const q = Math.min(size - 1, Math.max(0, k));
          acc += horiz ? src[j * size + q] : src[q * size + j]; n++;
        }
        for (let i = 0; i < size; i++) {
          if (horiz) out[j * size + i] = acc / n; else out[i * size + j] = acc / n;
          const add = Math.min(size - 1, i + r + 1), sub = Math.max(0, i - r);
          acc += horiz ? src[j * size + add] - src[j * size + sub] : src[add * size + j] - src[sub * size + j];
        }
      }
      return out;
    };
    for (let p = 0; p < 2; p++) a = blur(blur(a, true), false);
    // Row 0 is the bottom of the texture (v = 0), so flip rows to match world +Y up.
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = Math.round(a[(size - 1 - y) * size + x] * 255), i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // Aims the camera. tilt: degrees off straight-on (camera drops below center); spin: degrees around the view axis.
  setView({ target = [0, 0, 0], distance, tilt = 0, spin = 0, aspect }) {
    const t = new THREE.Vector3(...target);
    const tr = (tilt * Math.PI) / 180, sr = (spin * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(sr) * Math.sin(tr), -Math.cos(sr) * Math.sin(tr), Math.cos(tr));
    this.camera.position.copy(t).addScaledVector(dir, distance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(t);
    if (aspect) this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.focusDistance = distance;
    this.lastTarget = t;
    this.updateLod(t, distance);
    this.fitShadow(t, distance);
  }

  // Keeps the shadow map focused on what the camera sees, so close-ups get crisp thread shadows.
  fitShadow(target, distance) {
    // In the 3D viewer the shadow map stays fixed on the whole hoop: re-fitting it every frame
    // while the hoop turns makes shadow edges shimmer.
    if (this.opts?.back) {
      target = new THREE.Vector3(0, 0, 0);
      distance = Infinity;
    }
    const halfH = distance * Math.tan((this.camera.fov * Math.PI) / 360);
    const r = Math.min(this.bounds.radius * 1.5 + 6, Math.max(halfH, halfH * this.camera.aspect) * 1.6 + 2);
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 1;
    cam.far = 800;
    cam.updateProjectionMatrix();
    this.key.target.position.copy(target);
    this.key.position.copy(target).addScaledVector(this.keyDir, 300);
    this.key.target.updateMatrixWorld();
  }

  // Distance that fits the whole hoop (with clasp) into the frame with the given fill.
  framing(aspect, fill = 0.86) {
    const b = this.bounds;
    const w = b.radius * 2, h = b.top - b.bottom;
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const dW = w / 2 / (tanV * aspect * fill);
    const dH = h / 2 / (tanV * fill);
    return { distance: Math.max(dW, dH), target: [0, (b.top + b.bottom) / 2, 0] };
  }

  // A busy spot for close-ups: knots first, otherwise where the most threads meet.
  focusPoint() {
    const { gridW: W, gridH: H, cells, knots, backstitch } = this.pattern;
    let best = [0, 0], bestScore = -1;
    for (let cy = 2; cy < H - 2; cy++) {
      for (let cx = 2; cx < W - 2; cx++) {
        const seen = new Set();
        let filled = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const t = cells[(cy + dy) * W + cx + dx];
            seen.add(t);
            if (t >= 0) filled++;
          }
        }
        let score = seen.size * 3 + filled * 0.2;
        for (const k of knots) if (Math.abs(k.hx - cx - 0.5) < 3 && Math.abs(k.hy - cy - 0.5) < 3) score += 2.5;
        for (const b of backstitch) if (Math.abs(b.x1 - cx - 0.5) < 3 && Math.abs(b.y1 - cy - 0.5) < 3) score += 0.6;
        if (score > bestScore) { bestScore = score; best = [cx, cy]; }
      }
    }
    return [best[0] - W / 2 + 0.5, H / 2 - best[1] - 0.5, 0];
  }

  // Depth of field for macro shots. dof is the bokeh aperture; 0 renders straight to screen.
  render() {
    if (!(this.dof > 0)) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (!this.composer) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 10, aperture: 0, maxblur: 0.006 });
      this.composer.addPass(this.bokeh);
      this.composer.addPass(new OutputPass());
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.bokeh.uniforms.focus.value = this.focusDistance;
    this.bokeh.uniforms.aperture.value = this.dof;
    this.composer.render();
  }
}
