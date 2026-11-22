// The roads on the map (M), as a map draws them: a band with a dark edge
// either side, pale yellow for a paved road and tan for a gravel one (the
// footpaths are dashed). Drawn as a layer over the land (MapView.addLayer),
// under the places' badges, the towns among them.

const EDGE = '#3e352b';
const FILL = { paved: '#f3e2a8', gravel: '#a8865a' };

// get(pen) -> [road]: the roads to draw, given the map as it is now
export function roadLayer(get) {
  return (pen) => {
    const { ctx, scale, unit, W, H } = pen;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const road of get(pen)) {
      const a = pen.toScreen(road.box[0], road.box[1]);
      const b = pen.toScreen(road.box[2], road.box[3]);
      if (Math.max(a.sx, b.sx) < 0 || Math.min(a.sx, b.sx) > W || Math.max(a.sy, b.sy) < 0 || Math.min(a.sy, b.sy) > H) continue;
      // a point every few pixels is plenty
      const every = Math.max(1, Math.floor((3 * unit) / (scale * road.ds)));
      ctx.beginPath();
      for (let i = 0; i < road.n; i += every) {
        const p = pen.toScreen(road.x[i], road.z[i]);
        (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.sx, p.sy);
      }
      const end = pen.toScreen(road.x[road.n - 1], road.z[road.n - 1]);
      ctx.lineTo(end.sx, end.sy);
      const paved = road.surface === 'paved';
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = Math.max(3, (paved ? 4.5 : 3.8) * unit);
      ctx.stroke();
      ctx.strokeStyle = FILL[road.surface] || FILL.gravel;
      ctx.lineWidth = Math.max(1.5, (paved ? 2.6 : 2) * unit);
      ctx.stroke();
    }
  };
}
