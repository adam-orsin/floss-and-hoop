# Instructions for AI coding agents

This repo turns a user's image into a cross-stitch render, a 3D hoop, and a printable stitch chart. Everything runs on the user's computer. Never upload the user's image or outputs anywhere.

## 1. Check the machine

Run these and fix anything missing before you go further:

```bash
node --version
```

Node must be 20 or later.

```bash
ffmpeg -version
```

ffmpeg is needed for videos. If it's missing, install it (`brew install ffmpeg` on macOS, `winget install --id Gyan.FFmpeg` on Windows, `sudo apt-get install -y ffmpeg` on Debian or Ubuntu), or skip videos with `--no-video`.

## 2. Install

```bash
npm install
```

```bash
npx playwright install chromium
```

## 3. Look at the examples first

Before you make anything, open `examples/README.md` and one example folder, like `examples/monogram-star/`. Each one has the finished still (`feed.jpg`), the stitch chart (`chart.png`), the detail check, and the floss report (`README.md`). They show what a good result looks like and what your report back to the user can say. If the user ran `npm run clear-examples`, skip this step.

## 4. Make the user's design

Get the path to the user's image (SVG, PNG, JPG, or WebP), then run:

```bash
npm run make -- path/to/image.png
```

The command copies the image into `assets/` and registers it in `assets/designs.local.json`. It picks a grid size, renders the outputs into `exports/`, writes a report, and opens the gallery and the 3D viewer. It starts the app server on port 5190 if it isn't running, and the server keeps running afterward.

Useful options:

| Option | Use it when |
|---|---|
| `--grid 90` | The user asks for a size, or the automatic pick looks too coarse. |
| `--fabric white` | The design is pale and would vanish on cream fabric. |
| `--colors 5` | A photo or busy image produces too many thread colors. |
| `--keep-background` | The image's solid background is part of the design. |
| `--bg 1f3a5f` | The user wants a different backdrop color for the stills and videos. |
| `--name my-logo` | The file name isn't a good design name. |
| `--no-video` | ffmpeg isn't available, or the user only needs the chart. |

## 5. Report back to the user

Read `exports/<name>-report.md` and tell the user:

- **Size:** the stitch count and finished size, in inches on 14-count and 18-count Aida.
- **Floss:** the DMC floss list, with a note to check colors against a real DMC color card.
- **Lost detail:** anything the report lists, like tiny shapes, backstitched lines, or a removed background. Point to `exports/<name>-grid<N>-detail-check.png`, where lost areas show in pink.
- **Links:** the gallery at `http://127.0.0.1:5190/gallery.html` and the 3D viewer at `http://127.0.0.1:5190/?design=<name>&ui=0`. In the viewer, they can drag to turn the hoop, click **Back** to see the back of the work, and scroll to zoom.

## Rules

- Don't edit the user's artwork, recolor it, or trace it. If the report's shape match is below 0.75 or many shapes are lost, say the art is too detailed for cross-stitch at a practical size. Suggest simpler art with bold shapes and a few flat colors, or a larger grid (up to 160).
- Text smaller than about eight stitches tall turns into blobs. Suggest a larger grid, or leaving out the small text.
- Don't commit the user's images or exports. Git already ignores `assets/` (except the built-in examples) and `exports/`.
- If the user wants the Haus Candy Co. examples gone, run `npm run clear-examples`. It leaves their own designs alone.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Headless Chromium isn't installed` | Run `npx playwright install chromium`. |
| `ffmpeg isn't installed` | Install it (see step 1) or add `--no-video`. |
| Port 5190 is busy with something else | Stop that process, or run the app on another port and set `FLOSS_HOOP_URL=http://127.0.0.1:<port>/`. |
| `Retrying … in a fresh browser` | Expected now and then: Chrome's GPU process dropped the WebGL context, and the script recovered. |
| Renders are very slow on Linux | There's no GPU, so Chrome uses software WebGL. It works, just slowly. Use `--no-video` for a quick first pass. |
| A design looks wrong after edits to `src/` | Restart the server (`npm run dev`) and rerun the command. |

## Where things are

| Path | What it does |
|---|---|
| `scripts/make.mjs` | The one-command workflow above. |
| `scripts/render.mjs` | Runs a JSON list of export jobs (see README). |
| `src/pattern.js` | Image to stitch grid: color snapping, French knots, backstitch, and the detail report. |
| `src/scene.js` | The 3D scene: floss, Aida fabric, hoop, lighting, and level of detail. |
| `src/chart.js` | The printable chart. |
| `src/main.js` | The app, the export functions, and the `window.flossHoop` hooks the scripts call. |
| `assets/designs.json` | Built-in Haus Candy Co. example designs. |
| `examples/` | Finished stills, charts, and floss reports for the built-in designs. Rebuild with `npm run examples`, or remove with `npm run clear-examples`. |
| `assets/designs.local.json` | The user's designs (git ignores it). |
