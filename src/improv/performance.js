// A show, from the top: every line said in it, who says it, when, how long
// it takes, and how the room takes it; who's on the stage, and where.
//
// It's worked out from the show alone (its id, its bill: schedule.js), so
// everyone in the room hears the same joke at the same moment, and someone
// who walks in late comes in on the line being said, not at the top. Only
// the times are fixed here; the words are the browser's to say (sound.js),
// a little sooner or later, and the room laughs when they've been said.
//
//   program(show, picks?) -> { entries, length (s), games }
//     an entry: { t (s from the top), d (s to say it), gap (s the room
//     takes after it), kind, who (a person's id, 'booth' or 'crowd'),
//     text, laugh (0..3), on ({ id: mark }: who's on the stage, and where),
//     music (walk-on music under it), game (the improv game it belongs to) }
//     kinds: 'line' (someone says something), 'applause', 'shout' (the room
//     calls out suggestions: texts, one of them `pick`)
//   cursor(program, s) -> the index of the entry going on s seconds from
//     the top (-1 before it starts, entries.length once it's over)
//   person(id) -> who that is: { id, name, voice, look }
//
// An improv show's games are made up from what the room shouts out: `picks`
// ({ [game]: suggestion }) is what you shouted, where you did, in place of
// what the room did. Every game takes as long whichever suggestion is taken
// (as long as its longest scene, with applause after a shorter one), so the
// show keeps time with everyone else's however it went for you.
//
// The marks on the stage: 'mic' (the stand at the front), 'left' and
// 'right' (a scene's two players), 'back' (the troupe waiting along the
// brick wall); anyone not on is in the wings.

import { mulberry32 } from '../noise.js';
import { ANNOUNCER, HOST, COMICS, TROUPE, GAMES, HECKLES } from './sets.js';
import { lineupOf, seedOf, shuffled } from './schedule.js';

const WPS = 2.55; // words a second at a voice's rate of 1
// s the room takes after a line, by how it laughs (sets.js: 0..3)
export const LAUGH = [0.45, 1.5, 2.7, 4.3];
const APPLAUSE = { walkOn: 4.2, walkOff: 3.4, start: 3, end: 5, scene: 3.2 }; // s
const SHOUT = 2.8; // s the room spends calling out suggestions
const BITS = { standup: 4, openmic: 2 }; // bits a comic does, who isn't headlining
const ROUNDS = 2; // times round the troupe's games

// Everyone who can be on the bill, by id.
const PEOPLE = new Map();
for (const p of [HOST, ...COMICS, TROUPE.host, ...TROUPE.players]) PEOPLE.set(p.id, p);
PEOPLE.set('booth', { id: 'booth', name: ANNOUNCER.name, voice: ANNOUNCER.voice });
export const person = (id) => PEOPLE.get(id) || null;
export const everyone = () => [...PEOPLE.values()].filter((p) => p.look);

// How long it takes to say a line, at a voice's rate (s).
export function speakTime(text, rate = 1) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/[,;:—]/g) || []).length * 0.12 + (text.match(/[.!?](\s|$)/g) || []).length * 0.22;
  return 0.3 + words / (WPS * rate) + pauses;
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function program(show, picks = {}) {
  const rnd = mulberry32(seedOf(show.id) ^ 0x5bd1e995);
  const lineup = lineupOf(show);
  const entries = [];
  let t = 0;
  let on = {};
  const say = (who, text, laugh, extra = {}) => {
    const p = person(who);
    const d = speakTime(text, p?.voice?.rate ?? 1);
    entries.push({ t, d, gap: LAUGH[laugh], kind: 'line', who, text, laugh, on, ...extra });
    t += d + LAUGH[laugh];
  };
  const clap = (d, extra = {}) => {
    entries.push({ t, d, gap: 0, kind: 'applause', who: 'crowd', text: '', laugh: 0, on, ...extra });
    t += d;
  };
  const stage = (next) => (on = next);
  const games = [];

  if (show.kind === 'improv') {
    const host = lineup.host;
    const troupe = lineup.acts;
    const back = Object.fromEntries(troupe.map((id) => [id, 'back']));
    for (const [text, laugh] of ANNOUNCER.lounge) say('booth', text, laugh);
    stage({ [host]: 'mic', ...back });
    clap(APPLAUSE.start, { music: true });
    for (const [text, laugh] of TROUPE.open) say(host, text, laugh);
    const taken = new Map(); // game id -> suggestions taken already
    for (let r = 0; r < ROUNDS; r++) {
      for (const [gi, game] of GAMES.entries()) {
        const k = games.length;
        if (k > 0) {
          stage({ [host]: 'mic', ...back });
          for (const [text, laugh] of TROUPE.between[Math.floor(rnd() * TROUPE.between.length)]) say(host, text, laugh);
        }
        // the room's suggestion, and the others it might have been
        const had = taken.get(game.id) || [];
        const options = Object.keys(game.scenes).filter((s) => !had.includes(s));
        const crowd = options[Math.floor(rnd() * options.length)];
        const pick = picks[k] && options.includes(picks[k]) ? picks[k] : crowd;
        taken.set(game.id, [...had, pick]);
        // the two players: round the troupe, a pair at a time
        const A = troupe[(k * 2) % troupe.length];
        const B = troupe[(k * 2 + 1) % troupe.length];
        // (how long the longest of them would take: the host saying what
        // was shouted, and the scene)
        const rate = person(host).voice.rate;
        const longest = Math.max(...Object.entries(game.scenes).map(([s, lines]) => speakTime(fill(game.took, { s }), rate) + LAUGH[1] + sceneLength(lines, A, B)));
        stage({ [host]: 'mic', ...back });
        const asked = entries.length;
        say(host, game.ask, 0);
        const shouts = shuffled(HECKLES, rnd).slice(0, 2);
        shouts.splice(Math.floor(rnd() * 3), 0, `${pick}!`);
        entries.push({ t, d: SHOUT, gap: 0.3, kind: 'shout', who: 'crowd', text: shouts.join(' '), texts: shouts, pick, laugh: 0, on, game: k });
        t += SHOUT + 0.3;
        const top = t;
        say(host, fill(game.took, { s: pick }), 1, { game: k });
        stage({ [A]: 'left', [B]: 'right' });
        for (const [who, text, laugh] of game.scenes[pick]) say(who === 'A' ? A : B, text, laugh, { game: k });
        // (a shorter scene than the longest: the applause runs on)
        const pad = Math.max(0, top + longest - t);
        stage({ [host]: 'mic', ...back });
        say(host, 'Scene!', 0, { game: k });
        clap(APPLAUSE.scene + pad, { game: k });
        games.push({ k, game: game.id, title: game.title, asked: entries[asked].t, decided: entries[asked + 2].t, crowd, pick, options: options.filter((s) => s !== crowd), players: [A, B], index: gi });
      }
    }
    stage({ [host]: 'mic', ...back });
    for (const [text, laugh] of TROUPE.close) say(host, text, laugh);
    stage({}); // (off, in the applause)
    clap(APPLAUSE.end, { music: true });
    return { entries, length: t, games };
  }

  // Stand-up, and open mic: the host, and each act brought up in turn.
  const host = lineup.host;
  for (const [text, laugh] of ANNOUNCER.before) say('booth', text, laugh);
  stage({ [host]: 'mic' });
  clap(APPLAUSE.start, { music: true });
  for (const [text, laugh] of HOST.open) say(host, text, laugh);
  const between = shuffled(HOST.between, rnd);
  const intros = shuffled(HOST.intro, rnd);
  for (const [k, id] of lineup.acts.entries()) {
    const comic = person(id);
    const last = k === lineup.acts.length - 1;
    stage({ [host]: 'mic' });
    if (k > 0) for (const [text, laugh] of between[(k - 1) % between.length]) say(host, text, laugh);
    const headline = last && show.kind === 'standup';
    say(host, fill(headline ? HOST.headliner : intros[k % intros.length], { name: comic.name, credit: cap(comic.credit) }), 0);
    stage({ [id]: 'mic' });
    clap(APPLAUSE.walkOn, { music: true });
    // their set: the bits in an order of their own, all of them for a
    // headliner (who finishes on their closer), some for everyone else
    const closer = comic.headliner ? comic.bits.at(-1) : null;
    const bits = shuffled(comic.bits.filter((b) => b !== closer), rnd).slice(0, headline || comic.headliner ? comic.bits.length : BITS[show.kind]);
    if (closer) bits.push(closer);
    for (const bit of bits) for (const [text, laugh] of bit) say(id, text, laugh);
    if (!closer) say(id, `That’s my time. I’m ${comic.name}, you’ve been great!`, 1);
    clap(APPLAUSE.walkOff);
    stage({ [host]: 'mic' });
  }
  for (const [text, laugh] of HOST.close) say(host, text, laugh);
  stage({}); // (off, in the applause)
  clap(APPLAUSE.end, { music: true });
  return { entries, length: t, games };
}

// How long a scene takes, played by A and B.
function sceneLength(lines, A, B) {
  let s = 0;
  for (const [who, text, laugh] of lines) s += speakTime(text, person(who === 'A' ? A : B)?.voice?.rate ?? 1) + LAUGH[laugh];
  return s;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The entry going on s seconds from the top: -1 before, entries.length after.
export function cursor(prog, s) {
  const E = prog.entries;
  if (s < 0) return -1;
  if (s >= prog.length) return E.length;
  let lo = 0;
  let hi = E.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (E[mid].t <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
