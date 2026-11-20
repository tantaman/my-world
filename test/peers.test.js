// Other people, drawn from what they said (player/track.js): a moment behind,
// between two things they said, at the pace they really went; and what the
// server passes on of where they are (worker/world.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/player/track.js';
import { standing } from '../worker/world.js';

const RUN = 7.5; // m/s
const SAY_EVERY = 150; // ms, as save/worldSave.js
const SKEW = -4_321_000; // their clock less ours: the two never agree
const FRAME = 1000 / 60;

// Someone running east for 3 s, then north for 3 s.
const ran = (ms) => (ms < 3000 ? { x: (RUN * ms) / 1000, z: 0 } : { x: RUN * 3, z: (RUN * Math.min(ms - 3000, 3000)) / 1000 });
const offPath = (p) => Math.min(Math.hypot(p.z, Math.max(0, p.x - RUN * 3, -p.x)), Math.hypot(p.x - RUN * 3, Math.max(0, -p.z, p.z - RUN * 3)));

// What they said, as it reaches us: told on their frames whenever SAY_EVERY
// has passed, and taking 40 ms plus up to `jitter` ms to come, in order.
function told({ jitter = 60, seed = 7, until = 6500, where = ran, timed = true } = {}) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const out = [];
  let last = -Infinity;
  let came = 0;
  for (let n = 0; n * FRAME < until; n++) {
    const ms = n * FRAME;
    if (ms - last <= SAY_EVERY) continue;
    last = ms;
    came = Math.max(came, ms + 40 + rnd() * jitter);
    out.push({ ...where(ms), ms, t: timed ? Math.round(ms + SKEW) : undefined, came });
  }
  return out;
}

// Draw them at 60 fps for as long as `until`; -> [{ now, x, z }]
function watch(said, until = 6500, track = new Track()) {
  const seen = [];
  let i = 0;
  const out = { x: 0, z: 0, yaw: 0 };
  for (let n = 0; n * FRAME < until; n++) {
    const now = n * FRAME;
    while (i < said.length && said[i].came <= now) {
      const m = said[i++];
      track.hear(m.x, m.z, 0, m.t, m.came);
    }
    if (!i) continue;
    track.at(now, out);
    seen.push({ now, x: out.x, z: out.z });
  }
  return seen;
}

const paces = (seen) => seen.slice(1).map((p, i) => (Math.hypot(p.x - seen[i].x, p.z - seen[i].z) / FRAME) * 1000);

test('someone running is drawn at the pace they ran, round the corner where they turned', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const seen = watch(told({ seed }));
    const settled = seen.filter((p) => p.now > 2000 && p.now < 6000);
    // pace along the straights: across the corner they go the short way, on the chord
    const v = [...paces(settled.filter((p) => p.now < 2900)), ...paces(settled.filter((p) => p.now > 3600))];
    assert.ok(Math.min(...v) > RUN * 0.75 && Math.max(...v) < RUN * 1.1, `never surging (${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)} m/s)`);
    // and off their pace only for the odd frame, as a later message than any
    // lately moves them a few ms further back
    const off = v.filter((u) => Math.abs(u - RUN) > RUN * 0.05).length;
    assert.ok(off <= 6, `at their pace all but ${off} of ${v.length} frames`);
    const cut = Math.max(...settled.map(offPath));
    assert.ok(cut < 0.15, `and they keep to where they ran (${cut.toFixed(2)} m off it at worst)`);
    // drawn a moment behind: about one message and the line's jitter, not more
    const behind = settled.filter((p) => p.now < 2900).map((p) => p.now - 40 - (p.x / RUN) * 1000);
    const most = Math.max(...behind);
    assert.ok(most > 150 && most < 320, `a moment behind (${most.toFixed(0)} ms)`);
  }
});

test('a worse line draws them further back, and they still go at their pace; a better one brings them closer', () => {
  // 0–250 ms of jitter for the first 4 s, then a clean line
  const said = told({ jitter: 250, until: 20000, where: (ms) => ({ x: (RUN * ms) / 1000, z: 0 }) });
  for (const m of said) if (m.ms > 4000) m.came = Math.max(m.ms + 40, said[said.indexOf(m) - 1].came);
  const track = new Track();
  const seen = watch(said, 20000, track);
  const rough = seen.filter((p) => p.now > 2500 && p.now < 4000);
  const v = paces(rough);
  assert.ok(Math.min(...v) > RUN * 0.75 && Math.max(...v) < RUN * 1.1, `on a rough line, never a lurch (${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)} m/s)`);
  const behindThen = rough.at(-1).now - 40 - (rough.at(-1).x / RUN) * 1000;
  const behindNow = seen.at(-1).now - 40 - (seen.at(-1).x / RUN) * 1000;
  assert.ok(behindThen > 300, `further back while the line was rough (${behindThen.toFixed(0)} ms)`);
  assert.ok(behindNow < 260, `and closer again once it settles (${behindNow.toFixed(0)} ms)`);
});

test('when news is late they carry on a moment, then wait for it', () => {
  // running east, then nothing heard for 1.5 s, then running on as before
  const said = told({ jitter: 0, until: 6000, where: (ms) => ({ x: (RUN * ms) / 1000, z: 0 }) });
  for (const m of said) if (m.ms > 2000) m.came += 1500;
  const seen = watch(said, 6000);
  const gap = seen.filter((p) => p.now > 2400 && p.now < 3500);
  const furthest = Math.max(...gap.map((p) => p.x));
  const lastSaid = said.filter((m) => m.ms <= 2000).at(-1).x;
  assert.ok(furthest > lastSaid, 'they keep going past the last thing said');
  assert.ok(furthest < lastSaid + RUN * 0.26, `but only for a moment (${(furthest - lastSaid).toFixed(2)} m on)`);
  const waiting = paces(seen.filter((p) => p.now > 3000 && p.now < 3500));
  assert.ok(Math.max(...waiting) === 0, 'then they wait');
  assert.ok(seen.at(-1).x > said.filter((m) => m.came <= 6000).at(-2).x - 0.01, 'and go on once news comes');
});

test('somewhere else all at once is a jump, not a sprint', () => {
  const where = (ms) => (ms < 2000 ? { x: 0, z: (RUN * ms) / 1000 } : { x: 400, z: 0 });
  const seen = watch(told({ jitter: 30, until: 4000, where }), 4000);
  const v = paces(seen);
  assert.equal(v.filter((s) => s > 1000).length, 1, 'over in one frame');
  assert.ok(v.filter((s) => s > RUN * 1.2 && s < 1000).length === 0, `never streaking across (${v.filter((s) => s > RUN * 1.2).map((s) => s.toFixed(0))})`);
});

test('standing still, gone quiet a while (a hidden tab), then somewhere else: no slide across the gap', () => {
  const track = new Track();
  const out = { x: 0, z: 0, yaw: 0 };
  for (let ms = 0; ms < 2000; ms += 167) track.hear(10, 10, 0, ms + SKEW, ms + 50);
  for (let now = 0; now < 2100; now += FRAME) track.at(now, out);
  const xs = new Set();
  track.hear(60, 10, 0, 7000 + SKEW, 7050); // 50 m in 5 s would be a walk, but nothing was said between
  for (let now = 7050; now < 8000; now += FRAME) xs.add(track.at(now, out).x);
  assert.deepEqual([...xs], [10, 60]);
});

test('from a build that does not say when, they are taken as said when it came', () => {
  const seen = watch(told({ timed: false }));
  const settled = seen.filter((p) => p.now > 2000 && p.now < 6000);
  const v = paces(settled);
  assert.ok(Math.max(...v) < RUN * 1.5 && Math.min(...v) > RUN * 0.6, `rougher, but no lurching (${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)} m/s)`);
  assert.ok(Math.max(...settled.map(offPath)) < 0.2, 'and still round the corner');
});

test('the server passes on where someone is, and when they said it if they did', () => {
  assert.deepEqual(standing({ x: 1.5, z: -2, yaw: 0.3, ms: 81234 }), { x: 1.5, z: -2, yaw: 0.3, ms: 81234 });
  assert.equal(standing({ x: 1, z: 2, yaw: 0 }).ms, undefined, 'an older build says nothing of when');
  assert.equal(standing({ x: 1, z: 2, yaw: 0, ms: 'soon' }).ms, undefined, 'nonsense is not passed on');
  assert.equal(JSON.stringify({ t: 'at', ...standing({ x: 1, z: 2 }) }), '{"t":"at","x":1,"z":2,"yaw":0}');
});
