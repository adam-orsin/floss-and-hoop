// Flat cross-stitch chart: symbol grid, 10-stitch guide lines, backstitch, knots, and a thread key.
import { hexToRgb } from './color.js';

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function drawChart(pattern, { title, fabricHex, fabricName, cell = 26 } = {}) {
  const { gridW: W, gridH: H, cells, threads, knots, backstitch } = pattern;
  const pad = 70;
  const keyRowH = 46;
  const keyH = 120 + threads.length * keyRowH + 120;
  const gridPxW = W * cell, gridPxH = H * cell;
  const width = Math.max(gridPxW + pad * 2, 1300);
  const height = 150 + gridPxH + pad + keyH;
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const x0 = Math.round((width - gridPxW) / 2), y0 = 150;
  ctx.fillStyle = '#222';
  ctx.font = '600 34px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText(title, pad, 62);
  ctx.font = '20px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#555';
  const fabricLine = `${W} × ${H} stitches · ${fabricName} Aida · finished size on 14-count: ${(W / 14).toFixed(1)} × ${(H / 14).toFixed(1)} in (${(W / 14 * 2.54).toFixed(1)} × ${(H / 14 * 2.54).toFixed(1)} cm)`;
  ctx.fillText(fabricLine, pad, 98);
  ctx.fillText('Cross stitch with 2 strands. Backstitch and French knots with 2 strands. Arrows mark the center.', pad, 126);

  // Cells.
  ctx.fillStyle = fabricHex;
  ctx.fillRect(x0, y0, gridPxW, gridPxH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(cell * 0.62)}px -apple-system, "Apple Symbols", Helvetica, sans-serif`;
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const t = cells[cy * W + cx];
      if (t < 0) continue;
      const th = threads[t];
      ctx.fillStyle = th.hex;
      ctx.fillRect(x0 + cx * cell, y0 + cy * cell, cell, cell);
      ctx.fillStyle = luminance(th.hex) > 0.55 ? '#1a1a1a' : '#ffffff';
      ctx.fillText(th.symbol, x0 + cx * cell + cell / 2, y0 + cy * cell + cell / 2 + 1);
    }
  }

  // Grid lines, bolder every 10.
  for (let i = 0; i <= W; i++) {
    ctx.strokeStyle = i % 10 === 0 ? '#333' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = i % 10 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x0 + i * cell + 0.5, y0); ctx.lineTo(x0 + i * cell + 0.5, y0 + gridPxH); ctx.stroke();
  }
  for (let j = 0; j <= H; j++) {
    ctx.strokeStyle = j % 10 === 0 ? '#333' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = j % 10 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x0, y0 + j * cell + 0.5); ctx.lineTo(x0 + gridPxW, y0 + j * cell + 0.5); ctx.stroke();
  }
  // Column and row numbers every 10.
  ctx.fillStyle = '#444';
  ctx.font = '15px -apple-system, Helvetica, Arial, sans-serif';
  for (let i = 10; i <= W; i += 10) ctx.fillText(String(i), x0 + i * cell, y0 - 14);
  ctx.textAlign = 'right';
  for (let j = 10; j <= H; j += 10) ctx.fillText(String(j), x0 - 8, y0 + j * cell);
  ctx.textAlign = 'center';

  // Center arrows.
  ctx.fillStyle = '#c0392b';
  const midX = x0 + Math.round(W / 2) * cell, midY = y0 + Math.round(H / 2) * cell;
  const arrow = (x, y, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dy * 9 - dx * 16, y - dx * 9 - dy * 16);
    ctx.lineTo(x + dy * 9 - dx * 16, y + dx * 9 - dy * 16);
    ctx.closePath(); ctx.fill();
  };
  arrow(midX, y0 - 2, 0, 1); arrow(midX, y0 + gridPxH + 2, 0, -1);
  arrow(x0 - 2, midY, 1, 0); arrow(x0 + gridPxW + 2, midY, -1, 0);

  // Backstitch, drawn hole to hole with a light halo so it reads on any color.
  for (const b of backstitch) {
    const ax = x0 + b.x1 * cell, ay = y0 + b.y1 * cell, bx = x0 + b.x2 * cell, by = y0 + b.y2 * cell;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = threads[b.thread].hex; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  // French knots: filled dots on the hole.
  for (const k of knots) {
    const x = x0 + k.hx * cell, y = y0 + k.hy * cell;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, cell * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = threads[k.thread].hex;
    ctx.beginPath(); ctx.arc(x, y, cell * 0.27, 0, Math.PI * 2); ctx.fill();
  }

  // Thread key.
  let ky = y0 + gridPxH + pad + 20;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#222';
  ctx.font = '600 26px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText('Thread key', pad, ky);
  ky += 44;
  const cols = [pad, pad + 70, pad + 150, pad + 400, pad + 740, pad + 900, pad + 1040];
  ctx.font = '600 17px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#555';
  ['Symbol', 'Color', 'Artwork color', 'Closest DMC floss', 'Cross', 'Backstitch', 'Knots'].forEach((h, i) => ctx.fillText(h, cols[i], ky));
  ky += 34;
  ctx.font = '19px -apple-system, Helvetica, Arial, sans-serif';
  threads.forEach((t) => {
    ctx.fillStyle = t.hex;
    ctx.fillRect(cols[0], ky - 16, 34, 32);
    ctx.fillStyle = luminance(t.hex) > 0.55 ? '#1a1a1a' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(t.symbol, cols[0] + 17, ky + 1);
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
    ctx.strokeRect(cols[0] + 0.5, ky - 15.5, 34, 32);
    ctx.fillStyle = t.hex;
    ctx.fillRect(cols[1], ky - 16, 56, 32);
    ctx.strokeRect(cols[1] + 0.5, ky - 15.5, 56, 32);
    ctx.fillStyle = '#222';
    const label = t.brand ? `${t.hex.toUpperCase()} (${t.brand[0].toUpperCase() + t.brand.slice(1)})` : t.hex.toUpperCase();
    ctx.fillText(label, cols[2], ky);
    ctx.fillText(t.skipped ? 'Not stitched: matches the fabric' : `${t.dmc.code} ${t.dmc.name}`.slice(0, 34), cols[3], ky);
    ctx.fillText(String(t.stitches), cols[4], ky);
    ctx.fillText(String(t.backstitch), cols[5], ky);
    ctx.fillText(String(t.knots), cols[6], ky);
    ky += keyRowH;
  });
  ky += 10;
  ctx.fillStyle = '#666';
  ctx.font = '16px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText('DMC matches are the nearest by color math (CIEDE2000) against published RGB values. Check them against a real DMC color card before buying.', pad, ky);
  ctx.fillText('Thread colors are the artwork\'s own colors. Merged colors keep the color of the larger area.', pad, ky + 26);
  return c;
}
