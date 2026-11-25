// The Metro on the map (M): each line in its own colour along the track it
// runs on, side by side where lines share a track, as Metro's own map has
// them; and its trains where they are now, in their line's colour. A layer
// over the land (MapView.addLayer). The stations are places on the map
// (index.ts), with this glyph on their badges.

const INK = '#1a1713';
// px apart (per unit) that lines sharing a track are drawn
const APART = 2.4;

// An M.
export const METRO_GLYPH = ['#######', '##.#.##', '#.#.#.#', '#.###.#', '#.....#', '#.....#', '#######'];

// get() -> { lines: [{ colour, k, pts: [x, z, ...] }], trains: [{ x, z, dx, dz, len, colour }] }
export function metroLayer(get) {
  return (pen) => {
    const got = get();
    if (!got) return;
    const { ctx, scale, unit, W, H } = pen;
    const { lines, trains } = got;
    const width = Math.max(2, 2.2 * unit);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const line of lines) {
      const pts = [];
      let on = false;
      // a point every few pixels is plenty
      const every = Math.max(1, Math.floor((2 * unit) / Math.max(scale * 12, 1e-6)));
      for (let i = 0; i < line.pts.length; i += 2 * every) {
        const p = pen.toScreen(line.pts[i], line.pts[i + 1]);
        pts.push(p);
        if (p.sx > -50 && p.sy > -50 && p.sx < W + 50 && p.sy < H + 50) on = true;
      }
      if (!on || pts.length < 2) continue;
      // moved across its way by its place among the lines, so shared track shows each
      const off = (line.k - 2.5) * APART * unit;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.sx - a.sx;
        const dy = b.sy - a.sy;
        const l = Math.hypot(dx, dy) || 1;
        const x = pts[i].sx - (dy / l) * off;
        const y = pts[i].sy + (dx / l) * off;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = width + 1.5 * unit;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = line.colour;
      ctx.lineWidth = width;
      ctx.stroke();
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
      ctx.fillStyle = t.colour;
      ctx.fillRect(-half, -1.5 * unit, 2 * half, 3 * unit);
      ctx.restore();
    }
    ctx.restore();
  };
}
