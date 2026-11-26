// When the shows are: the DC Improv's week, on Washington's own clock.
//
// The club keeps the clock on the wall in Washington (Eastern time, summer
// time and all), whoever is visiting and from wherever, the way the Metro's
// trains do: a show that starts at 8:00 pm starts when it's 8:00 pm on
// Connecticut Avenue, for everyone in every world at once. Not the forest's
// hour, which is each hiker's own (world/index.js).
//
// Two rooms, downstairs:
//   main     the Main Showroom: stand-up, a host and three comics, the last
//            the headliner
//   lounge   the Lounge, the little room: the house improv troupe making
//            scenes up from what the room shouts out, and open mic on a
//            Monday (and Sunday night)
//
// Who's on a bill is grown from the show's id, so the same show has the same
// bill for everyone, and the next night has another.
//
//   showsOn(day)          the shows on a day ({ y, m, d }), in Washington
//   showsAround(ms, h)    the shows starting from h hours before ms to a week on
//   washington(ms)        the date and time in Washington at ms
//   lineupOf(show)        who's on: { host, acts } (ids from sets.js)
//
// No three.js, no browser: the tests read it.

import { mulberry32 } from '../noise.js';
import { COMICS, TROUPE } from './sets.js';

export const ROOMS = {
  main: { name: 'the Main Showroom', short: 'Main Showroom' },
  lounge: { name: 'the Lounge', short: 'Lounge' },
};
export const KINDS = {
  standup: 'stand-up',
  improv: 'improv',
  openmic: 'open mic',
};

// The week. day: 0 Sunday .. 6 Saturday; at: minutes after midnight in
// Washington.
const H = (h, m = 0) => h * 60 + m;
export const WEEK = [
  // the Main Showroom: dark Monday and Tuesday, two shows on a Friday and a Saturday
  { room: 'main', kind: 'standup', day: 3, at: H(20) },
  { room: 'main', kind: 'standup', day: 4, at: H(20) },
  { room: 'main', kind: 'standup', day: 5, at: H(19, 30) },
  { room: 'main', kind: 'standup', day: 5, at: H(22) },
  { room: 'main', kind: 'standup', day: 6, at: H(19) },
  { room: 'main', kind: 'standup', day: 6, at: H(21, 30) },
  { room: 'main', kind: 'standup', day: 0, at: H(19) },
  // the Lounge: something every night, and in the afternoon at the weekend
  { room: 'lounge', kind: 'openmic', day: 1, at: H(20) },
  { room: 'lounge', kind: 'improv', day: 2, at: H(20) },
  { room: 'lounge', kind: 'improv', day: 3, at: H(20, 30) },
  { room: 'lounge', kind: 'improv', day: 4, at: H(20, 30) },
  { room: 'lounge', kind: 'improv', day: 5, at: H(20) },
  { room: 'lounge', kind: 'improv', day: 5, at: H(22, 30) },
  { room: 'lounge', kind: 'improv', day: 6, at: H(15) },
  { room: 'lounge', kind: 'improv', day: 6, at: H(20) },
  { room: 'lounge', kind: 'improv', day: 6, at: H(22, 30) },
  { room: 'lounge', kind: 'improv', day: 0, at: H(16) },
  { room: 'lounge', kind: 'openmic', day: 0, at: H(20, 30) },
];
// The doors: the box office opens at noon and the club shuts at one in the
// morning (minutes after the midnight before), and a room is let in this
// long before its show.
export const HOURS = { open: H(12), close: H(25) };
export const DOORS = 30; // min

// ── Washington's clock ───────────────────────────────────────────────────────
const ZONE = 'America/New_York';
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let fmt = null;
try {
  fmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
} catch {
  fmt = null; // (no time zones here: Eastern standard time, all year)
}

// The date and time in Washington at ms (since 1970):
// { y, m (1..12), d, weekday (0 Sunday), minutes (after midnight), offset (min from UTC) }
export function washington(ms) {
  if (!fmt) {
    const t = new Date(ms - 5 * 3600000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60, offset: -300 };
  }
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(ms))) p[type] = value;
  const [y, m, d, h, min, s] = [+p.year, +p.month, +p.day, +p.hour % 24, +p.minute, +p.second];
  const offset = Math.round((Date.UTC(y, m - 1, d, h, min, s) - Math.floor(ms / 1000) * 1000) / 60000);
  return { y, m, d, weekday: DAYS[p.weekday], minutes: h * 60 + min + s / 60, offset };
}

// ms (since 1970) of `minutes` after midnight on day { y, m, d } in Washington.
export function atWashington(day, minutes) {
  const naive = Date.UTC(day.y, day.m - 1, day.d) + minutes * 60000;
  // (the offset where it lands, asked twice in case that crosses a change of the clocks)
  let ms = naive - washington(naive).offset * 60000;
  ms = naive - washington(ms).offset * 60000;
  return ms;
}

// The day after (or n days after) { y, m, d }.
export function dayAfter(day, n = 1) {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay() };
}

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (day) => `${day.y}-${pad(day.m)}-${pad(day.d)}`;

// ── The shows ────────────────────────────────────────────────────────────────
// A show: { id, room, kind, start (ms), at (min after midnight), day, weekday }
export function showsOn(day) {
  const weekday = day.weekday ?? new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
  return WEEK.filter((w) => w.day === weekday)
    .map((w) => ({
      id: `${dayKey(day)}-${w.room}-${pad(Math.floor(w.at / 60))}${pad(w.at % 60)}`,
      room: w.room,
      kind: w.kind,
      at: w.at,
      day: { y: day.y, m: day.m, d: day.d },
      weekday,
      start: atWashington(day, w.at),
    }))
    .sort((a, b) => a.start - b.start);
}

// The shows that start from `back` hours before ms to a week after it.
export function showsAround(ms, back = 3) {
  const today = washington(ms);
  const out = [];
  for (let n = -1; n <= 7; n++) {
    for (const s of showsOn(dayAfter(today, n))) if (s.start >= ms - back * 3600000 && s.start <= ms + 7 * 86400000) out.push(s);
  }
  return out;
}

// Whether the club is open at ms: from noon until one in the morning.
export function isOpen(ms) {
  const w = washington(ms);
  return w.minutes >= HOURS.open || w.minutes < HOURS.close - 24 * 60;
}

// ── Who's on ─────────────────────────────────────────────────────────────────
// A number from a show's id, the same every time.
export function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffled(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stand-up: the host, then three comics, the last the headliner (Earl, on
// a weekend; otherwise whoever closes). Open mic: the host and five comics,
// a couple of bits each. Improv: the troupe's host and its players.
export function lineupOf(show) {
  const rnd = mulberry32(seedOf(show.id));
  if (show.kind === 'improv') return { host: TROUPE.host.id, acts: shuffled(TROUPE.players.map((p) => p.id), rnd) };
  const weekend = show.weekday === 5 || show.weekday === 6 || show.weekday === 0;
  const others = shuffled(COMICS.filter((c) => !c.headliner).map((c) => c.id), rnd);
  if (show.kind === 'openmic') return { host: 'dana', acts: others.slice(0, 5) };
  const head = weekend ? COMICS.find((c) => c.headliner).id : others.pop();
  return { host: 'dana', acts: [...others.slice(0, 2), head] };
}
