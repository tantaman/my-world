// How numbers are written for people.

export function formatDistance(d) {
  if (d < 1000) return `${Math.round(d)} m`;
  return `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km`;
}

// ── What a HUD says of where someone is ─────────────────────────────────────
// The game's own (ui/hud.js) says it of the hiker, and on a split screen each
// of the others has it said of them (splitscreen/partHud.ts): so it's here.

// The eighths of a turn: round the compass from north, and round from
// straight ahead of whoever is looking.
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
// Nearer than this (m) to where you're heading, you're there.
export const ARRIVED = 8;

// Which way a camera turned to camYaw (radians) looks, as a point of the
// compass. It looks along (-sin, -cos) of that, and north is -z.
export function formatHeading(camYaw) {
  const ang = (Math.atan2(-Math.sin(camYaw), Math.cos(camYaw)) * 180) / Math.PI;
  return COMPASS[Math.round((((ang % 360) + 360) % 360) / 45) % 8];
}

// An hour of the day (0..24, and the part of an hour past it) as a clock
// shows it: 07:05.
export function formatClock(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Where someone is, which way they're looking and the hour:
// "120, -45  ·  NE  ·  07:05".
export function formatWhere(pos, camYaw, hours) {
  return `${Math.round(pos.x)}, ${Math.round(pos.z)}  ·  ${formatHeading(camYaw)}  ·  ${formatClock(hours)}`;
}

// Somewhere to head for (mark: { label, x, z }), for someone at pos looking
// along camYaw: its name, how far it is and which way to go from where
// they're looking (↑ is straight ahead), or that they're there.
export function formatTrack(mark, pos, camYaw) {
  const dx = mark.x - pos.x;
  const dz = mark.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < ARRIVED) return `◆ ${mark.label} · you're here`;
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rel = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
  return `◆ ${mark.label} · ${formatDistance(d)} ${ARROWS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8]}`;
}
