// The tower on the map, close up: its octagon with the ramp's ring and the
// open middle, the slide's run-out, and the footbridge and path up to it. A
// layer of the map's own (map/mapView.js: map.addLayer); its place has a
// badge of its own, at the foot of the ramp.

import { TOWER, onOctagon, slidePath, apothemOf, bridgeLine, pathLine } from './tower.js';

const FROM = 0.6; // px per metre (per DPR) from which it's drawn
const STEEL = 'rgba(150, 156, 158, 0.95)';
const DECK = 'rgba(96, 100, 100, 0.9)';
const PATH = 'rgba(176, 150, 108, 0.9)';
const BOARDS = 'rgba(138, 106, 72, 0.95)';

// draw(pen, at): at, the tower's middle [x, z] in the world
export function drawWhorl(pen, at) {
  if (pen.scale < FROM * pen.dpr) return;
  const [X, Z] = at;
  const R = 160;
  const a = pen.toScreen(X - R, Z - R);
  const b = pen.toScreen(X + R, Z + R);
  if (b.sx < 0 || a.sx > pen.W || b.sy < 0 || a.sy > pen.H) return;
  const ctx = pen.ctx;
  const line = (pts, width, color) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      const q = pen.toScreen(X + x, Z + z);
      if (i) ctx.lineTo(q.sx, q.sy);
      else ctx.moveTo(q.sx, q.sy);
    });
    ctx.lineWidth = Math.max(1, width * pen.scale);
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  const ring = (apothem) => Array.from({ length: 9 }, (_, k) => onOctagon(22.5 + k * 45, apothem));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  line(pathLine(), 2.2, PATH);
  line(bridgeLine(), 2.4, BOARDS);
  // the ramp's ring and the top deck's, and the slide's way out
  line(ring((TOWER.rampIn + TOWER.rampOut) / 2), TOWER.rampOut - TOWER.rampIn, DECK);
  line(ring((TOWER.core + TOWER.rampIn) / 2), TOWER.rampIn - TOWER.core, STEEL);
  const out = slidePath().pts.filter((q) => apothemOf(q[0], q[2]) > TOWER.core).map((q) => [q[0], q[2]]);
  line(out, 1.1, STEEL);
  ctx.restore();
}
