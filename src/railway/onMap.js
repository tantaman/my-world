// The railways on the map (M): each line as a railway is drawn on a map, a
// dark line with pale ties along it, and the trains on it where they are
// now. Drawn as a layer over the land (MapView.addLayer). The stations are
// places on the map (index.js), with this glyph on their badges.

const INK = '#211c17';
const TIES = '#d8cdaf';
const TRAIN = '#c5482e';

// A station: a little house with its roof, over a length of track.
export const STATION_GLYPH = ['..###..', '.#####.', '#######', '.#.#.#.', '.#####.', '.......', '#######'];

// get() -> { lines: [line], trains: [{ x, z, dx, dz, len }] }
export function railLayer(get) {
  return (pen) => {
    const { ctx, scale, unit, W, H } = pen;
    const { lines, trains } = get();
    for (const line of lines) {
      const a = pen.toScreen(line.box[0], line.box[1]);
      const b = pen.toScreen(line.box[2], line.box[3]);
      if (b.sx < 0 || a.sx > W || b.sy < 0 || a.sy > H) continue;
      // a point every few pixels is plenty
      const every = Math.max(1, Math.floor((3 * unit) / (scale * line.ds)));
      const pts = [];
      for (let i = 0; i <= line.n; i += every) {
        const k = i % line.n;
        pts.push(pen.toScreen(line.x[k], line.z[k]));
      }
      const first = pen.toScreen(line.x[0], line.z[0]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i].sx, pts[i].sy);
      ctx.lineTo(first.sx, first.sy);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, 3 * unit);
      ctx.stroke();
      ctx.setLineDash([2 * unit, 3 * unit]);
      ctx.strokeStyle = TIES;
      ctx.lineWidth = Math.max(1, unit);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const t of trains) {
      const p = pen.toScreen(t.x, t.z);
      if (p.sx < -20 || p.sy < -20 || p.sx > W + 20 || p.sy > H + 20) continue;
      const half = Math.max(3 * unit, (t.len * scale) / 2);
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.rotate(Math.atan2(t.dz, t.dx));
      ctx.fillStyle = INK;
      ctx.fillRect(-half - unit, -2.5 * unit, 2 * half + 2 * unit, 5 * unit);
      ctx.fillStyle = TRAIN;
      ctx.fillRect(-half, -1.5 * unit, 2 * half, 3 * unit);
      ctx.restore();
    }
  };
}
