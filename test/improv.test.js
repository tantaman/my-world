// The DC Improv (src/improv/): the comedy club on Connecticut Avenue. What's
// checked here: that the club keeps Washington's clock, summer and winter,
// and its week of shows, open from noon to one; that who's on a bill is the
// same for everyone and right for the night; that a show from the top keeps
// time, line after line, with whoever's talking on the stage, and that an
// improv game takes as long whatever's shouted; that the material is all
// there and says what it is; that downstairs is a place to be, with the
// stages and the counters in the way and the doorways open; that the room's
// laughter and applause are made, and loud enough; that the browser's
// voices are chosen and stopped as they should be; and that the club is
// built, an audience and all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { washington, atWashington, showsOn, showsAround, isOpen, lineupOf, dayAfter, WEEK, DOORS } from '../src/improv/schedule.js';
import { program, cursor, person, everyone, speakTime, LAUGH } from '../src/improv/performance.js';
import { COMICS, HOST, TROUPE, GAMES, ANNOUNCER } from '../src/improv/sets.js';
import { ClubSpace, siteOf, roomAt, ROOMS, DOORWAYS, STAGES, SEATS, TABLES, MARKS, STAIRS, STREET, DOOR, DEPTH, toWorld } from '../src/improv/club.js';
import { laughter, applause, murmur, shout, RATE, laughing, finish } from '../src/improv/laughs.js';
import { Voices } from '../src/core/speech.ts';
import { buildClub } from '../src/improv/room.js';
import { Templates, Audience } from '../src/improv/crowd.js';
import { HIKES } from '../src/world/hikes.js';
import * as THREE from 'three';

const SATURDAY = { y: 2026, m: 11, d: 28 };
const MONDAY = { y: 2026, m: 11, d: 30 };

// ── The clock and the week ───────────────────────────────────────────────────

test('the club keeps Washington’s clock, in summer time and out of it', () => {
  // 8 pm on the 3rd of July is midnight in Greenwich; on the 14th of January, 1 am
  const summer = washington(Date.UTC(2026, 6, 4, 0, 0));
  assert.deepEqual([summer.y, summer.m, summer.d, summer.minutes, summer.offset, summer.weekday], [2026, 7, 3, 20 * 60, -240, 5]);
  const winter = washington(Date.UTC(2026, 0, 15, 1, 0));
  assert.deepEqual([winter.y, winter.m, winter.d, winter.minutes, winter.offset], [2026, 1, 14, 20 * 60, -300]);
  assert.equal(atWashington({ y: 2026, m: 7, d: 3 }, 20 * 60), Date.UTC(2026, 6, 4, 0, 0));
  assert.equal(atWashington({ y: 2026, m: 1, d: 14 }, 20 * 60), Date.UTC(2026, 0, 15, 1, 0));
  assert.deepEqual(dayAfter({ y: 2026, m: 12, d: 31 }), { y: 2027, m: 1, d: 1, weekday: 5 });
});

test('a Saturday has two shows in the Main Showroom and three in the Lounge; a Monday only the open mic', () => {
  const sat = showsOn({ ...SATURDAY, weekday: 6 });
  assert.deepEqual(sat.map((s) => `${s.room} ${s.kind} ${s.at / 60}`), ['lounge improv 15', 'main standup 19', 'lounge improv 20', 'main standup 21.5', 'lounge improv 22.5']);
  for (const s of sat) assert.equal(washington(s.start).minutes, s.at, `${s.id} starts when it says, in Washington`);
  assert.equal(new Set(sat.map((s) => s.id)).size, sat.length);
  const mon = showsOn({ ...MONDAY, weekday: 1 });
  assert.deepEqual(mon.map((s) => `${s.room} ${s.kind}`), ['lounge openmic']);
  // every night has something on
  for (let d = 0; d < 7; d++) assert.ok(WEEK.some((w) => w.day === d), `day ${d}`);
  // and around now, the shows of the week to come, in order
  const now = atWashington(SATURDAY, 18 * 60);
  const around = showsAround(now);
  assert.ok(around.length >= 15 && around.every((s, i) => i === 0 || s.start >= around[i - 1].start));
});

test('the club is open from noon until one in the morning', () => {
  assert.equal(isOpen(atWashington(SATURDAY, 11 * 60 + 59)), false);
  assert.equal(isOpen(atWashington(SATURDAY, 12 * 60)), true);
  assert.equal(isOpen(atWashington(SATURDAY, 23 * 60 + 59)), true);
  assert.equal(isOpen(atWashington(SATURDAY, 24 * 60 + 30)), true, 'half past midnight');
  assert.equal(isOpen(atWashington(SATURDAY, 24 * 60 + 61)), false);
  // and every show is over before it shuts
  for (let d = 0; d < 7; d++) {
    for (const s of showsOn(dayAfter(SATURDAY, d))) {
      assert.ok(isOpen(s.start - DOORS * 60000), `${s.id}: the doors`);
      assert.ok(isOpen(s.start + program(s).length * 1000), `${s.id}: the end`);
    }
  }
});

test('who’s on a bill is the same every time, and right for the night', () => {
  for (let d = 0; d < 14; d++) {
    for (const s of showsOn(dayAfter(SATURDAY, d))) {
      const l = lineupOf(s);
      assert.deepEqual(lineupOf(s), l, 'the same bill');
      assert.equal(new Set(l.acts).size, l.acts.length, 'nobody on twice');
      for (const id of [l.host, ...l.acts]) assert.ok(person(id)?.look, `${id} is someone`);
      if (s.kind === 'standup') {
        assert.equal(l.acts.length, 3);
        const weekend = [5, 6, 0].includes(s.weekday);
        if (weekend) assert.equal(l.acts[2], 'earl', `${s.id}: Earl headlines a weekend`);
        else assert.notEqual(l.acts[2], 'earl');
      }
      if (s.kind === 'improv') assert.deepEqual([...l.acts].sort(), TROUPE.players.map((p) => p.id).sort());
      if (s.kind === 'openmic') assert.equal(l.acts.length, 5);
    }
  }
  // and not the same every night
  const bills = new Set();
  for (let d = 0; d < 14; d++) for (const s of showsOn(dayAfter(SATURDAY, d))) if (s.kind === 'standup') bills.add(lineupOf(s).acts.join());
  assert.ok(bills.size >= 6, `${bills.size} different bills in a fortnight`);
});

// ── A show, from the top ─────────────────────────────────────────────────────

const shows = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => showsOn(dayAfter(SATURDAY, d)));

test('a show keeps time: line after line, each when the last is done', () => {
  for (const s of shows) {
    const p = program(s);
    assert.deepEqual(program(s), p, `${s.id}: the same for everyone`);
    let t = 0;
    for (const e of p.entries) {
      assert.ok(Math.abs(e.t - t) < 1e-9, `${s.id}: ${e.text} starts when the last is done`);
      assert.ok(e.d > 0 && e.gap >= 0);
      t = e.t + e.d + e.gap;
    }
    assert.ok(Math.abs(p.length - t) < 1e-9);
    assert.ok(p.length > 6 * 60 && p.length < 20 * 60, `${s.id} runs ${(p.length / 60).toFixed(1)} min`);
  }
});

test('whoever is talking is on the stage (the booth is not), and the show ends with the stage empty', () => {
  for (const s of shows) {
    const p = program(s);
    for (const e of p.entries) {
      if (e.kind !== 'line') continue;
      if (e.who === 'booth') assert.ok(!('booth' in e.on));
      else assert.ok(e.who in e.on, `${s.id}: ${e.who} says “${e.text}” from the stage`);
    }
    assert.deepEqual(p.entries.at(-1).on, {}, 'and they all go off');
    // the first thing is the voice from the booth
    assert.equal(p.entries[0].who, 'booth');
  }
});

test('cursor finds the line going on at any moment', () => {
  const p = program(shows.find((s) => s.kind === 'standup'));
  assert.equal(cursor(p, -1), -1);
  assert.equal(cursor(p, p.length + 1), p.entries.length);
  p.entries.forEach((e, k) => {
    assert.equal(cursor(p, e.t), k);
    assert.equal(cursor(p, e.t + (e.d + e.gap) * 0.99), k);
  });
});

test('an improv game takes as long whatever is shouted, and the scene is the one shouted for', () => {
  const s = shows.find((q) => q.kind === 'improv');
  const p = program(s);
  assert.equal(p.games.length, GAMES.length * 2, 'the games, twice round');
  for (const g of p.games) {
    assert.ok(g.asked < g.decided, 'asked, then decided');
    assert.ok(!g.options.includes(g.crowd) && g.options.length >= 1);
    const mine = program(s, { [g.k]: g.options[0] });
    assert.ok(Math.abs(mine.length - p.length) < 1e-6, 'the show still ends when everyone else’s does');
    const took = mine.entries.find((e) => e.game === g.k && e.kind === 'line' && e.text.startsWith('I heard'));
    assert.ok(took.text.includes(g.options[0]), `“${took.text}”`);
    const scene = GAMES.find((q) => q.id === g.game).scenes[g.options[0]];
    assert.ok(mine.entries.some((e) => e.game === g.k && e.text === scene[0][1]), 'and they play that scene');
    // the next game starts at the same moment either way
    const next = p.games[g.k + 1];
    if (next) assert.ok(Math.abs(mine.games[g.k + 1].asked - next.asked) < 1e-6);
  }
  // a suggestion that isn't one of them is the room's
  const g = p.games[0];
  assert.equal(program(s, { 0: 'the moon' }).games[0].pick, g.crowd);
  // the second time round, a scene isn't played again
  for (const id of GAMES.map((q) => q.id)) {
    const picked = p.games.filter((q) => q.game === id).map((q) => q.pick);
    assert.equal(new Set(picked).size, picked.length, id);
  }
});

test('the material is all there: every line says something, and the room takes it somehow', () => {
  const lines = [
    ...ANNOUNCER.before,
    ...ANNOUNCER.lounge,
    ...HOST.open,
    ...HOST.close,
    ...HOST.between.flat(),
    ...COMICS.flatMap((c) => c.bits.flat()),
    ...TROUPE.open,
    ...TROUPE.close,
    ...TROUPE.between.flat(),
    ...GAMES.flatMap((g) => Object.values(g.scenes).flatMap((sc) => sc.map(([, text, laugh]) => [text, laugh]))),
  ];
  assert.ok(lines.length > 250, `${lines.length} lines`);
  for (const [text, laugh] of lines) {
    assert.ok(typeof text === 'string' && text.length > 1 && text.length < 240, text);
    assert.ok(Number.isInteger(laugh) && laugh >= 0 && laugh < LAUGH.length, text);
  }
  for (const c of COMICS) {
    assert.ok(c.bits.length >= 4, `${c.name} has a set`);
    for (const bit of c.bits) assert.ok(bit.some(([, , ]) => true) && bit.at(-1)[1] > 0, `${c.name}: a bit ends on a laugh`);
  }
  for (const g of GAMES) {
    assert.ok(Object.keys(g.scenes).length >= 3, `${g.id}: enough to be shouted out`);
    for (const [name, sc] of Object.entries(g.scenes)) {
      assert.ok(sc.some((l) => l[0] === 'A') && sc.some((l) => l[0] === 'B'), `${name}: two of them in it`);
      assert.ok(sc.at(-1)[2] >= 2, `${name}: ends on a laugh`);
    }
  }
  // and everyone has a look and a voice
  for (const p of everyone()) assert.ok(p.voice && p.look && p.name, p.id);
  assert.ok(speakTime('one two three four five') > speakTime('one two'));
});

// ── Downstairs ───────────────────────────────────────────────────────────────

const card = HIKES.find((h) => h.id === 'washington-dc');
const site = siteOf(card.at, 10);
const space = new ClubSpace(site);
const _in = { floor: 0, roof: 0 };
const _w = { d: 0, nx: 0, nz: 0 };
const at = (lx, lz) => toWorld(site, lx, lz);

test('the club is at 1140 Connecticut Avenue, and downstairs under the street', () => {
  const p = at(0, 0);
  assert.ok(Math.abs(p.x - (card.at[0] + DOOR.x)) < 1e-6 && Math.abs(p.z - (card.at[1] + DOOR.z)) < 1e-6);
  assert.equal(site.floor, 10 - DEPTH);
  // the way in is away from the avenue (the east side of the building's front: +x)
  const inward = at(0, 10);
  assert.ok(inward.x < p.x, 'in is west of the door');
  // the street itself isn't in it
  const s = at(STREET.x, STREET.z);
  assert.equal(space.inside(s.x, s.z, 10, _in), false);
  // and above the rooms, the street's height isn't either
  const lobby = at(0, 5);
  assert.equal(space.inside(lobby.x, lobby.z, 10.05, _in), false);
  assert.equal(space.inside(lobby.x, lobby.z, site.floor + 0.05, _in), true);
  assert.equal(_in.floor, site.floor);
  assert.ok(_in.roof > site.floor + 2.5);
});

test('downstairs is somewhere to be: its rooms, the ways between them open, the stages and counters in the way', () => {
  for (const [name, r] of Object.entries(ROOMS)) {
    const [x0, z0, x1, z1] = r.box;
    const m = at((x0 + x1) / 2, (z0 + z1) / 2);
    assert.ok(space.inside(m.x, m.z, site.floor, _in), `in ${name}`);
    assert.equal(roomAt((x0 + x1) / 2, (z0 + z1) / 2), name);
  }
  // through each doorway, nowhere near a wall
  for (const dw of DOORWAYS) {
    const [x0, z0, x1, z1] = dw.box;
    const m = at((x0 + x1) / 2, (z0 + z1) / 2);
    space.walls(m.x, m.z, _w);
    assert.ok(_w.d > 0.4, `${dw.between.join(' to ')}: ${_w.d.toFixed(2)} m to a wall`);
  }
  // beside a doorway, the wall
  const beside = at(3.5, 9);
  space.walls(beside.x, beside.z, _w);
  assert.ok(_w.d < 0.05);
  // the front of the main stage is a wall to the audience, pushing them back
  const front = STAGES.main.box[1];
  const p = at(0, front - 0.1);
  space.walls(p.x, p.z, _w);
  assert.ok(Math.abs(_w.d - 0.1) < 1e-6);
  const back = at(0, front - 1);
  assert.ok(_w.nx * (back.x - p.x) + _w.nz * (back.z - p.z) > 0, 'pushed back off it');
  // the camera's air: not inside the stage, open in the house
  const house = at(0, 18);
  assert.ok(space.air(house.x, site.floor + 1.6, house.z, 0.25));
  const onStage = at(0, 29);
  assert.equal(space.air(onStage.x, site.floor + 0.3, onStage.z, 0.25), false);
  assert.ok(space.light() >= 0.4 && space.light() < 1, 'lit, not dark enough for a headlamp');
});

test('every seat, mark and way in is where it can be got to', () => {
  for (const s of SEATS) {
    assert.equal(roomAt(s.x, s.z), s.room, `a seat at ${s.x}, ${s.z}`);
    const p = at(s.x, s.z);
    space.walls(p.x, p.z, _w);
    assert.ok(_w.d > 0.2, `a seat at ${s.x}, ${s.z} clear of the walls`);
  }
  assert.equal(SEATS.filter((s) => s.room === 'main').length, 2 * TABLES.length);
  for (const [room, M] of Object.entries(MARKS)) {
    const st = STAGES[room].box;
    for (const name of ['mic', 'left', 'right', 'wings', 'stool']) {
      const m = M[name];
      assert.ok(m.x >= st[0] && m.x <= st[2] && m.z >= st[1] && m.z <= st[3], `${room} ${name} is on the stage`);
    }
  }
  const foot = at(STAIRS.x, STAIRS.z);
  assert.ok(space.inside(foot.x, foot.z, site.floor, _in));
});

// ── The room ─────────────────────────────────────────────────────────────────

test('the room laughs, claps and murmurs: made, never silent, never out of range', () => {
  for (const [name, s] of [['a chuckle', laughter(0, 1)], ['a big laugh', laughter(3, 1)], ['applause', applause(4, 1, { cheer: 2 })], ['the murmur', murmur(6, 1)], ['a shout', shout(1)]]) {
    assert.equal(s.rate, RATE);
    let peak = 0;
    let sum = 0;
    for (const v of s.data) {
      assert.ok(Number.isFinite(v), name);
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    assert.ok(peak > 0.3 && peak <= 1, `${name} peaks at ${peak.toFixed(2)}`);
    assert.ok(Math.sqrt(sum / s.data.length) > 0.02, `${name} is heard`);
  }
  // the bigger the laugh, the longer it goes on
  assert.ok(laughter(3, 2).data.length > laughter(1, 2).data.length);
  // worked out a few voices at a time, it's the same as all at once
  const steps = laughing(2, 5);
  let n = 0;
  let r;
  while (!(r = steps.next()).done) n++;
  assert.ok(n > 2, `${n} steps`);
  assert.deepEqual(r.value.data, finish(laughing(2, 5)).data);
});

test('each person has a voice of their own, and nothing waits to be said late', () => {
  const said = [];
  let cancelled = 0;
  const synth = {
    pending: false,
    speaking: false,
    voices: [{ name: 'Samantha', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' }, { name: 'Google Deutsch', lang: 'de-DE' }, { name: 'Alex', lang: 'en-US' }],
    getVoices() {
      return this.voices;
    },
    speak(u) {
      said.push(u);
    },
    cancel() {
      cancelled++;
    },
  };
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  const v = new Voices(synth, Utterance);
  assert.ok(v.available);
  assert.equal(v.voiceOf(person('priya')).name, 'Samantha', 'hers');
  assert.ok(['Daniel', 'Alex'].includes(v.voiceOf(person('earl')).name), 'his');
  assert.equal(v.voiceOf(person('earl')), v.voiceOf(person('earl')), 'the same each time');
  let ended = 0;
  v.say('Hello, DC!', person('dana'), 3, { end: () => ended++ });
  const u = said.at(-1);
  assert.equal(u.text, 'Hello, DC!');
  assert.equal(u.volume, 1);
  assert.equal(u.pitch, person('dana').voice.pitch);
  u.onend();
  u.onend();
  assert.equal(ended, 1, 'it ends once');
  v.say('Interrupted.', person('dana'), 1, { end: () => ended++ });
  said.at(-1).onerror();
  assert.equal(ended, 1, 'no laugh for what was cut off');
  synth.pending = true;
  v.say('Late.', person('dana'));
  assert.equal(cancelled, 1, 'what was waiting is let go');
  // no speech at all: nothing said, nothing broken
  const mute = new Voices(null, null);
  assert.equal(mute.available, false);
  assert.equal(mute.say('anything', person('dana')), false);
});

// ── Built ────────────────────────────────────────────────────────────────────

test('the club is built: the front, the rooms, the stages, the pictures', () => {
  const { kits, pictures } = buildClub();
  for (const [name, k] of Object.entries(kits)) assert.ok(!k.empty, `${name} has faces`);
  const kinds = pictures.map((p) => p.kind);
  for (const k of ['name', 'blade', 'poster', 'board', 'logo', 'lounge', 'troupe', 'headshot']) assert.ok(kinds.includes(k), k);
  assert.ok(pictures.filter((p) => p.street).every((p) => p.z < 0), 'the street’s pictures are out on the street');
  const g = kits.stage.build();
  g.computeBoundingBox();
  assert.ok(g.boundingBox.max.z <= ROOMS.main.box[3] + 0.01, 'the stage is in its room');
});

test('the audience is sat down: people baked in their seats, as many as the room is full', () => {
  const templates = new Templates(7);
  let steps = 0;
  while (templates.pump()) steps++;
  assert.ok(templates.ready && steps > 3);
  const box = new THREE.Box3().setFromBufferAttribute(templates.geos[0].attributes.position);
  assert.ok(box.max.y > 1.0 && box.max.y < 1.55, `sitting, ${box.max.y.toFixed(2)} m tall`);
  assert.ok(box.min.y > -0.05, 'feet on the floor');
  const group = new THREE.Group();
  const seats = SEATS.filter((s) => s.room === 'main');
  const a = new Audience(seats, { material: new THREE.MeshBasicMaterial(), templates, seed: 3, group });
  a.fill(0.5, 11);
  assert.equal(a.count, Math.round(seats.length * 0.5));
  const taken = seats.filter((s, i) => a.taken(i)).length;
  assert.equal(taken, a.count);
  a.fill(0.75, 11);
  assert.equal(a.count, Math.round(seats.length * 0.75), 'more come in');
  a.dispose();
  templates.dispose();
});
