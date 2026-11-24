// The zoo on the map, close up: its pens, its paths and plazas, and its
// buildings, as the site has them (site.js), once it's been stood up. A layer
// of the map's own (map/mapView.js: map.addLayer): the zoo's place has a
// badge of its own, at the gate.

const FROM = 0.35; // px per metre (per DPR) from which it's drawn
const PEN = 'rgba(120, 150, 80, 0.55)';
const PAVED = 'rgba(176, 150, 108, 0.9)';
const ROOF = 'rgba(74, 56, 36, 0.92)';
const INK = '#15140f';

// draw(pen, site): site, or null while the zoo isn't stood up
export function drawZoo(pen, site) {
  if (!site || pen.scale < FROM * pen.dpr) return;
  const ctx = pen.ctx;
  // on screen at all?
  const a = pen.toScreen(site.box[0], site.box[1]);
  const b = pen.toScreen(site.box[2], site.box[3]);
  if (b.sx < 0 || a.sx > pen.W || b.sy < 0 || a.sy > pen.H) return;
  const ring = (r) => {
    ctx.beginPath();
    r.forEach(([x, z], i) => {
      const q = pen.toScreen(x, z);
      if (i) ctx.lineTo(q.sx, q.sy);
      else ctx.moveTo(q.sx, q.sy);
    });
    ctx.closePath();
  };
  ctx.save();
  ctx.fillStyle = PEN;
  for (const e of site.exhibits) {
    if (!e.pen || e.shared) continue;
    ring(e.pen);
    ctx.fill();
  }
  ctx.fillStyle = PAVED;
  for (const ar of site.areas) {
    for (const r of ar.rings) {
      ring(r);
      ctx.fill();
    }
  }
  ctx.strokeStyle = PAVED;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of site.paths) {
    ctx.lineWidth = Math.max(1, p.width * pen.scale);
    ctx.beginPath();
    for (let k = 0; k + 1 < p.pts.length; k += 2) {
      const q = pen.toScreen(p.pts[k], p.pts[k + 1]);
      if (k) ctx.lineTo(q.sx, q.sy);
      else ctx.moveTo(q.sx, q.sy);
    }
    ctx.stroke();
  }
  ctx.fillStyle = ROOF;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, pen.dpr * 0.75);
  for (const bld of site.buildings) {
    for (const f of bld.faces) {
      ring(f[0]);
      ctx.fill();
      if (pen.scale > FROM * 4 * pen.dpr) ctx.stroke();
    }
  }
  ctx.restore();
}
