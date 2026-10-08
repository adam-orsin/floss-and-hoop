// Designs live in two files served from ./assets:
//   designs.json        starter designs that ship with the repo
//   designs.local.json  your own designs (git ignores it, so your art stays private)
// Each entry: { label, file, grid, fabric, background?, maxColors?, hidden? }
export const DESIGNS = {};

export async function loadDesigns() {
  for (const name of ['designs.json', 'designs.local.json']) {
    try {
      const res = await fetch(`/${name}?t=${Date.now()}`);
      if (res.ok) Object.assign(DESIGNS, await res.json());
    } catch {
      // A missing local file just means no personal designs yet.
    }
  }
  return DESIGNS;
}

export const FABRICS = {
  white: { label: 'White Aida', hex: '#fbfaf6' },
  cream: { label: 'Cream Aida', hex: '#f9eedf' },
};

export const DEFAULT_BACKGROUND = '#8c2d3d';

export const SIZES = {
  feed: [1080, 1350],
  story: [1080, 1920],
};
