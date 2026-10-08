// Lists the built-in examples for the landing page: which files each example has in
// examples/<key>/, its stitch size, and its thread colors. The Vite config turns this into
// the `virtual:floss-examples` module, so the static demo needs no /api calls.
import fs from 'node:fs';
import path from 'node:path';

const MEDIA = {
  still: 'feed.jpg', stillThumb: 'feed-thumb.jpg',
  pushIn: 'push-in.mp4', pushInPoster: 'push-in.jpg',
  stitchOn: 'stitch-on.mp4', stitchOnPoster: 'stitch-on.jpg',
  chart: 'chart.png', chartThumb: 'chart-thumb.jpg',
  detail: 'detail-check.png', report: 'README.md',
};

export function buildManifest(root) {
  const designsFile = path.join(root, 'assets', 'designs.json');
  const designs = fs.existsSync(designsFile) ? JSON.parse(fs.readFileSync(designsFile, 'utf8')) : {};
  const examples = [];
  for (const [key, d] of Object.entries(designs)) {
    const dir = path.join(root, 'examples', key);
    if (d.hidden || !fs.existsSync(dir)) continue;
    const files = {};
    for (const [kind, name] of Object.entries(MEDIA)) {
      if (fs.existsSync(path.join(dir, name))) files[kind] = `/examples/${key}/${name}`;
    }
    const md = files.report ? fs.readFileSync(path.join(dir, 'README.md'), 'utf8') : '';
    const size = /\*\*Size:\*\* (\d+) × (\d+) stitches/.exec(md);
    // Floss rows look like: | #648BBD | 799 | Delft Blue Medium | 2380 | 2 |
    const floss = [...md.matchAll(/^\| (#[0-9A-Fa-f]{6}) \| (\w+) \| ([^|]+) \|/gm)]
      .filter((m) => m[2] !== 'none')
      .map((m) => ({ hex: m[1], dmc: m[2], name: m[3].trim() }));
    examples.push({
      key,
      label: d.label || key,
      grid: d.grid,
      fabric: d.fabric || 'cream',
      width: size ? Number(size[1]) : d.grid,
      height: size ? Number(size[2]) : null,
      floss,
      files,
    });
  }
  const viewerStill = path.join(root, 'examples', 'viewer.jpg');
  return { examples, viewerStill: fs.existsSync(viewerStill) ? '/examples/viewer.jpg' : null };
}

// The files the landing page shows, for copying into the static build. The README GIF
// and the detail checks stay on GitHub.
export function exampleFiles(root) {
  const { examples, viewerStill } = buildManifest(root);
  const keep = ['still', 'stillThumb', 'pushIn', 'pushInPoster', 'stitchOn', 'stitchOnPoster', 'chart', 'chartThumb'];
  const files = examples.flatMap((e) => keep.map((k) => e.files[k]));
  return [...files, viewerStill].filter(Boolean).map((f) => f.slice(1));
}
