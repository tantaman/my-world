// Washington on the map, close up: its streets and sidewalks and its roofs,
// for each tile of it that's stood up (look.js). A layer of the map's own
// (map/mapView.js: map.addLayer). Each tile makes its shapes into paths once,
// in its own metres (CityTile.paths), and they're drawn scaled onto wherever
// the tile is.

const FROM = 0.35; // px per metre (per DPR) from which it's drawn
const ROAD = 'rgba(64, 62, 60, 0.85)';
const WALK = 'rgba(168, 160, 146, 0.9)';
const ROOF = 'rgba(96, 74, 58, 0.95)';
const INK = '#15140f';

// tiles: those stood up (look.js's CityTile, ready).
export function drawCity(pen, tiles) {
  if (pen.scale < FROM * pen.dpr || !tiles.length) return;
  const ctx = pen.ctx;
  // (the map is north up: a tile's metres onto the screen are a scale and a shift)
  const o = pen.toScreen(0, 0);
  const u = pen.toScreen(1000, 1000);
  const [kx, kz] = [(u.sx - o.sx) / 1000, (u.sy - o.sy) / 1000];
  ctx.save();
  for (const t of tiles) {
    const a = pen.toScreen(t.box[0], t.box[1]);
    const b = pen.toScreen(t.box[2], t.box[3]);
    if (Math.max(a.sx, b.sx) < 0 || Math.min(a.sx, b.sx) > pen.W || Math.max(a.sy, b.sy) < 0 || Math.min(a.sy, b.sy) > pen.H) continue;
    const paths = t.paths();
    const c = pen.toScreen(t.corner[0], t.corner[1]);
    ctx.setTransform(kx, 0, 0, kz, c.sx, c.sy);
    ctx.fillStyle = ROAD;
    ctx.fill(paths.roads, 'evenodd');
    ctx.fillStyle = WALK;
    ctx.fill(paths.walks, 'evenodd');
    ctx.fillStyle = ROOF;
    ctx.fill(paths.roofs);
    if (pen.scale > FROM * 4 * pen.dpr) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = (pen.dpr * 0.75) / kx;
      ctx.stroke(paths.roofs);
    }
  }
  ctx.restore();
}
