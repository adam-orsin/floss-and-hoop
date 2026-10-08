# Assets

`npm run make -- path/to/image.png` copies your image here and registers it in `designs.local.json`. Git ignores both, so your art stays on your computer.

The Haus Candy Co. example designs in `examples/` are listed in `designs.json` and ship with the repo. Remove them with `npm run clear-examples`.

Each design entry looks like this:

```json
"my-logo": { "label": "My logo", "file": "my-logo.png", "grid": 80, "fabric": "cream" }
```

Optional fields:

| Field | What it does |
|---|---|
| `background` | Backdrop color for stills and videos, as a hex value. |
| `maxColors` | The most thread colors to use. |
| `keepBackground` | Set to `true` to stitch a solid image background instead of removing it. |
| `hidden` | Set to `true` to hide the design from the gallery and 3D viewer menu. |
