import { useEffect, useState } from 'react';
import manifest from 'virtual:floss-examples';

export const REPO = 'https://github.com/adam-orsin/floss-and-hoop';

export const PROMPT = `Clone ${REPO} and follow its AGENTS.md. Here's my image: [attach it or give the file path]. Pick a stitch count where the detail holds up, and tell me if anything gets lost. Render the stills, videos, and printable stitch chart with the DMC floss list, then open the 3D viewer so I can turn it around. Keep everything on my computer.`;

export const { viewerStill } = manifest;
// The hero already shows the monogram, so the badge leads the examples.
export const examples = [...manifest.examples].sort((a, b) => (b.key === 'badge-cornflower') - (a.key === 'badge-cornflower'));

// The static demo serves the 3D viewer at /viewer. Locally it's the app's front page.
export function viewerUrl(d) {
  const base = import.meta.env.PROD ? '/viewer' : '/';
  return d ? `${base}?design=${d.key}&grid=${d.grid}&fabric=${d.fabric}&ui=0` : `${base}?ui=0`;
}

// Your own designs: only when the local dev server is running, read from
// assets/designs.local.json and the finished renders in exports/.
export function useLocalDesigns() {
  const [designs, setDesigns] = useState([]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (async () => {
      const [local, files] = await Promise.all([
        fetch(`/designs.local.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        fetch('/api/exports').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      const mtime = new Map(files.map((f) => [f.name, f.mtime]));
      const url = (name) => (mtime.has(name) ? `/exports/${name}?v=${Math.round(mtime.get(name))}` : undefined);
      const list = [];
      for (const [key, d] of Object.entries(local)) {
        if (d.hidden) continue;
        const fabric = d.fabric || 'cream';
        const base = `${key}-grid${d.grid}-${fabric}`;
        const out = {
          still: url(`${base}-feed.png`),
          pushIn: url(`${base}-push-in.mp4`),
          stitchOn: url(`${base}-stitch-on.mp4`),
          chart: url(`${key}-grid${d.grid}-chart.png`),
          report: url(`${key}-report.md`),
        };
        if (!Object.values(out).some(Boolean)) continue;
        list.push({ key, label: d.label || key, grid: d.grid, fabric, width: d.grid, height: null, floss: [], files: out });
      }
      setDesigns(list);
    })();
  }, []);
  return designs;
}
