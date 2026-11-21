// Where snow lies on a place, from when and where a photo was taken on it.
// In winter it lies on everything but the lowest ground near the poles, and
// the line it lies above rises toward the equator until only the highest
// peaks in the tropics have any. A guess from the latitude alone (a coast
// under mountains gets more, a dry interior less): --snow says otherwise.
//
// A snow line is as a country has one (src/world/country.js): [from, to],
// the real heights over which snow comes to lie on all the gentle ground.

// The winter snow line (real m above the sea) at 20° from the equator, and how
// much lower it is for each degree further.
const LINE = { at20: 4200, perDegree: 125 };
// A month either side of winter (late autumn, early spring) it lies this much higher (m).
const SHOULDER = 600;
// Over this many real metres above where it starts, it comes to lie on all of it.
const DRIFTS = 200;
// Winter and the months either side of it, in the north (in the south, six months on).
const WINTER = [12, 1, 2, 3];
const EDGES = [11, 4];

// A snow line starting at m (real m above the sea).
export const snowlineFrom = (m) => [Math.round(m), Math.round(m) + DRIFTS];

// lat: degrees; taken: when, as EXIF writes it ("2025:01:18 10:42:07").
// -> the snow line, or undefined if it wasn't winter (or can't tell)
export function winterSnow({ lat, taken }) {
  const m = typeof taken === 'string' && /^\d{4}:(\d\d):/.exec(taken);
  if (!m || !Number.isFinite(lat)) return undefined;
  let month = Number(m[1]);
  if (lat < 0) month = ((month + 5) % 12) + 1;
  const edge = EDGES.includes(month);
  if (!WINTER.includes(month) && !edge) return undefined;
  const line = Math.max(0, LINE.at20 - LINE.perDegree * (Math.abs(lat) - 20));
  return snowlineFrom(line + (edge ? SHOULDER : 0));
}
