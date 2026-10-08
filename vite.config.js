import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.dirname(new URL(import.meta.url).pathname);
const exportsDir = path.join(root, 'exports');
const framesDir = path.join(root, '.frames');

// Only plain file names are accepted, so nothing can write outside ./exports.
function safeName(name) {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`bad name: ${name}`);
  return name;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}

function exportApi() {
  return {
    name: 'floss-and-hoop-export-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Read-only access to finished exports for the gallery page.
        if (req.url.startsWith('/exports/') && req.method === 'GET') {
          try {
            const name = safeName(decodeURIComponent(req.url.slice('/exports/'.length).split('?')[0]));
            const file = path.join(exportsDir, name);
            if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
            const type = { '.png': 'image/png', '.mp4': 'video/mp4', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' }[path.extname(name)] || 'application/octet-stream';
            const size = fs.statSync(file).size;
            const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
            res.setHeader('content-type', type);
            res.setHeader('accept-ranges', 'bytes');
            if (range) {
              const start = range[1] ? Number(range[1]) : 0;
              const end = range[2] ? Number(range[2]) : size - 1;
              res.statusCode = 206;
              res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
              res.setHeader('content-length', end - start + 1);
              return fs.createReadStream(file, { start, end }).pipe(res);
            }
            res.setHeader('content-length', size);
            return fs.createReadStream(file).pipe(res);
          } catch (e) {
            res.statusCode = 400;
            return res.end();
          }
        }
        if (!req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://local');
        try {
          if (url.pathname === '/api/exports' && req.method === 'GET') {
            const files = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((f) => /\.(png|mp4|md)$/.test(f)) : [];
            return send(res, 200, files.map((f) => ({ name: f, mtime: fs.statSync(path.join(exportsDir, f)).mtimeMs })));
          }
          if (url.pathname === '/api/save' && req.method === 'POST') {
            const name = safeName(url.searchParams.get('name'));
            fs.mkdirSync(exportsDir, { recursive: true });
            const file = path.join(exportsDir, name);
            fs.writeFileSync(file, await readBody(req));
            return send(res, 200, { file });
          }
          if (url.pathname === '/api/frame' && req.method === 'POST') {
            const job = safeName(url.searchParams.get('job'));
            const index = Number(url.searchParams.get('i'));
            const dir = path.join(framesDir, job);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${String(index).padStart(5, '0')}.jpg`), await readBody(req));
            return send(res, 200, { ok: true });
          }
          if (url.pathname === '/api/frames-reset' && req.method === 'POST') {
            const job = safeName(url.searchParams.get('job'));
            fs.rmSync(path.join(framesDir, job), { recursive: true, force: true });
            return send(res, 200, { ok: true });
          }
          if (url.pathname === '/api/encode' && req.method === 'POST') {
            const job = safeName(url.searchParams.get('job'));
            const name = safeName(url.searchParams.get('name'));
            const fps = Number(url.searchParams.get('fps') || 30);
            fs.mkdirSync(exportsDir, { recursive: true });
            const out = path.join(exportsDir, name);
            const args = [
              '-y', '-framerate', String(fps),
              '-i', path.join(framesDir, job, '%05d.jpg'),
              '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-color_range', 'tv',
              '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high',
              '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out,
            ];
            const code = await new Promise((resolve) => {
              const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
              let err = '';
              p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
              p.on('close', (c) => resolve(c === 0 ? 0 : err));
            });
            if (code !== 0) return send(res, 500, { error: code });
            fs.rmSync(path.join(framesDir, job), { recursive: true, force: true });
            return send(res, 200, { file: out });
          }
          return send(res, 404, { error: 'not found' });
        } catch (e) {
          return send(res, 500, { error: String(e.message || e) });
        }
      });
    },
  };
}

export default defineConfig({
  publicDir: 'assets',
  plugins: [exportApi()],
  server: { port: 5190, strictPort: true, host: '127.0.0.1' },
});
