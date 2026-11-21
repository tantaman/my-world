// A route uses world metres. Each walking leg is a compass bearing across
// open country. Airfields in this world all fly directly to one another.
const FLIGHT_SAVING = 2000; // metres of walking saved before suggesting a flight
const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

function leg(mode, from, to) {
  const angle = Math.atan2(to.x - from.x, from.z - to.z);
  return { mode, from, to, distance: distance(from, to), bearing: WAYS[(Math.round(angle / (Math.PI / 4)) + 8) % 8] };
}

function closest(fields, point) {
  return fields.reduce((best, field) => !best || distance(field, point) < distance(best, point) ? field : best, null);
}

export function planRoute(start, destination, { fields = [], here, landing, surveying = false } = {}) {
  const legs = [];
  // A flight already under way has a fixed landing field.
  let from = start;
  if (landing) {
    legs.push(leg('flight', start, landing));
    from = landing;
  }
  const direct = distance(from, destination);
  // A partial survey could send someone to the wrong continent just because
  // its runway was found first.
  if (direct > FLIGHT_SAVING && surveying) {
    legs.push(leg('survey', from, destination));
    return legs;
  }
  if (direct > FLIGHT_SAVING && fields.length > 1) {
    const depart = landing || here || closest(fields, from);
    const arrive = closest(fields, destination);
    const walk = distance(from, depart) + distance(arrive, destination);
    if (depart.id !== arrive.id && direct - walk > FLIGHT_SAVING) {
      if (!landing && !here) legs.push(leg('walk', from, depart));
      legs.push(leg('flight', here && !landing ? start : depart, arrive));
      from = arrive;
    }
  }
  if (!legs.length || from.id !== destination.id) legs.push(leg('walk', from, destination));
  return legs;
}

// Clip each dashed leg before stroking it. World-spanning flights can be
// millions of screen pixels long even when only a few pixels are visible.
export function drawRoute(pen, legs, color) {
  const { ctx, unit, W, H } = pen;
  ctx.save();
  ctx.lineWidth = 2 * unit;
  for (const { from, to, mode } of legs) {
    if (mode === 'survey') continue;
    const a = pen.toScreen(from.x, from.z);
    const b = pen.toScreen(to.x, to.z);
    const dx = b.sx - a.sx, dy = b.sy - a.sy;
    let lo = 0, hi = 1;
    for (const [origin, delta, limit] of [[a.sx, dx, W], [a.sy, dy, H]]) {
      if (!delta) {
        if (origin < 0 || origin > limit) hi = -1;
        continue;
      }
      const t0 = -origin / delta, t1 = (limit - origin) / delta;
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
    }
    if (lo >= hi) continue;
    ctx.setLineDash(mode === 'flight' ? [9 * unit, 5 * unit] : [4 * unit, 6 * unit]);
    ctx.lineDashOffset = -pen.t * 20 * unit;
    ctx.strokeStyle = color;
    ctx.shadowColor = '#15140f';
    ctx.shadowOffsetX = ctx.shadowOffsetY = unit;
    ctx.beginPath();
    ctx.moveTo(a.sx + dx * lo, a.sy + dy * lo);
    ctx.lineTo(a.sx + dx * hi, a.sy + dy * hi);
    ctx.stroke();
  }
  ctx.restore();
}
