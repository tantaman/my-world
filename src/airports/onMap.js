// The airfields on the map (M): each is a place there (index.js), drawn as
// its strip and apron, with this glyph on its badge. Over the land, a layer
// (MapView.addLayer) draws the routes out of the airfield you're at or near
// to the others, dashed, as far as they go on the map; and while you're
// flying, your own route, and the plane on it.

const ROUTE = 'rgba(33, 28, 23, 0.55)';
const MINE = '#c5482e';
const PLANE = '#f4efe2';

// A plane, seen from above.
export const FIELD_GLYPH = ['...#...', '...#...', '#######', '.#####.', '...#...', '..###..', '.......'];

// get() -> { from: { x, z } | null, to: [{ x, z }], flying: { ax, az, bx, bz, f } | null }
export function routeLayer(get) {
  return (pen) => {
    const { ctx, unit } = pen;
    const { from, to, flying } = get();
    ctx.save();
    ctx.lineCap = 'round';
    if (from) {
      const a = pen.toScreen(from.x, from.z);
      ctx.strokeStyle = ROUTE;
      ctx.lineWidth = Math.max(1, unit * 1.2);
      ctx.setLineDash([5 * unit, 4 * unit]);
      for (const t of to) {
        const b = pen.toScreen(t.x, t.z);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(...clip(a, b));
        ctx.stroke();
      }
    }
    if (flying) {
      const a = pen.toScreen(flying.ax, flying.az);
      const b = pen.toScreen(flying.bx, flying.bz);
      // the plane, part way along, and the route either side of it
      const p = { sx: a.sx + (b.sx - a.sx) * flying.f, sy: a.sy + (b.sy - a.sy) * flying.f };
      ctx.strokeStyle = MINE;
      ctx.lineWidth = Math.max(1.5, unit * 2);
      ctx.setLineDash([6 * unit, 3 * unit]);
      ctx.beginPath();
      ctx.moveTo(...clip(p, a));
      ctx.lineTo(...clip(p, b));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.translate(p.sx, p.sy);
      ctx.rotate(Math.atan2(b.sy - a.sy, b.sx - a.sx) + Math.PI / 2);
      const u = Math.max(1.5, unit * 1.6);
      ctx.fillStyle = MINE;
      ctx.strokeStyle = PLANE;
      ctx.lineWidth = Math.max(1, unit * 0.8);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, -4 * u);
      ctx.lineTo(0.8 * u, -0.5 * u);
      ctx.lineTo(4 * u, 0.5 * u);
      ctx.lineTo(0.8 * u, 1 * u);
      ctx.lineTo(0.6 * u, 3 * u);
      ctx.lineTo(1.6 * u, 4 * u);
      ctx.lineTo(-1.6 * u, 4 * u);
      ctx.lineTo(-0.6 * u, 3 * u);
      ctx.lineTo(-0.8 * u, 1 * u);
      ctx.lineTo(-4 * u, 0.5 * u);
      ctx.lineTo(-0.8 * u, -0.5 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };
}

// A route can run thousands of kilometres off the edge of the map: draw it
// only as far as a little past the edge, so the canvas isn't handed a line
// to the far side of the Earth.
const FAR = 4000; // px
function clip(a, b) {
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  const l = Math.hypot(dx, dy);
  if (l <= FAR) return [b.sx, b.sy];
  return [a.sx + (dx / l) * FAR, a.sy + (dy / l) * FAR];
}
