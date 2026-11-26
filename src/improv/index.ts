// The DC Improv: the comedy club at 1140 Connecticut Avenue NW, in
// Washington, DC, life size, where it really is, downstairs under the
// building as it is. Stand-up in the Main Showroom, improv in the Lounge,
// on a week of shows kept by Washington's clock: walk in while a show is
// on and you catch it, from whatever line they're on.
//
// This plugs it in: the door on the street and the act key at it, the club
// stood up as you come near (what builds it is fetched then: core/lazy.ts),
// downstairs as somewhere to be, the show going on in each room and you
// hearing it (the browser's voices for the lines, the room's laughter and
// applause made in code), the words on the screen, a seat to sit in,
// shouting a suggestion at the improv, the club on the map and in your
// pack, and the shows you've seen.
//
//   club.js         where it is, the rooms, what's where; downstairs as a space
//   schedule.js     the week of shows, on Washington's clock; who's on the bill
//   sets.js         the comics and their material, the troupe and its scenes
//   performance.js  a show from the top: every line, when, who's on the stage
//   captions.js     the words on the screen
//   laughs.js       laughter, applause, murmur: made from numbers
//   sound.js        the room: the murmur, the house music, the laughs
//   pictures.js     the club in your pack
//   look.js         (fetched) the club stood up:
//     room.js         its faces: the street front, the rooms, the stages, the tables
//     boards.js       the neon, the board of the week's shows, the posters
//     crowd.js        the audience in their seats; the performers
//
// From the console:
//   world.improv.schedule()        the week's shows, and who's on
//   world.improv.now()             what's on in each room, the line being said
//   await world.improv.go()        to the door on Connecticut Avenue
//   await world.improv.enter(room) downstairs: 'lobby', 'main' or 'lounge'
//   world.improv.soon(kind?, s?)   (to try it out) the next show (of that
//                                  kind) starting in s seconds (10)
//   world.improv.sit()             into the nearest free seat
//   world.improv.toSeat()          (to try it out) beside the nearest free seat
//   world.improv.shout()           shout a suggestion, at the improv
//   world.improv.club              the club, while it's stood up (null when it isn't)

import type { Game } from '../game/game.ts';
import { lazy } from '../core/lazy.ts';
import { formatDistance } from '../core/format.js';
import { SEAT_HIPS } from '../player/character.js';
import { DOOR, ADDRESS, STAIRS, STREET, SEATS, ClubSpace, siteOf, roomAt, toWorld, toLocal } from './club.js';
import { showsAround, washington as inDC, lineupOf, isOpen, ROOMS as HALLS, KINDS, DOORS, seedOf } from './schedule.js';
import { program, cursor, person } from './performance.js';
import { TROUPE } from './sets.js';
import { Voices } from '../core/speech.ts';
import { Captions } from './captions.js';
import { clubSounds } from './sound.js';
import * as pictures from './pictures.js';

type Club = import('./look.js').Club;
type Site = ReturnType<typeof siteOf>;
type Show = ReturnType<typeof showsAround>[number];
type Program = ReturnType<typeof program>;
type Entry = Program['entries'][number];
type Room = 'main' | 'lounge';

declare module '../game/game.ts' {
  interface Services {
    improv: ImprovService;
  }
}
interface ImprovService {
  readonly site: Site | null;
  readonly room: string | null;
  schedule(): Array<{ id: string; room: string; kind: string; when: string; bill: string[] }>;
  now(): Record<Room, { show: string; kind: string; at: number; length: number; who: string | null; line: string | null; kind_of: string | null } | null> & { room: string | null; caption: string };
  go(): Promise<boolean>;
  enter(room?: string): Promise<boolean>;
  soon(kind?: string, seconds?: number): string | null;
  sit(): boolean;
  toSeat(): boolean;
  shout(): string | null;
  readonly seated: boolean;
  readonly seen: string[];
  readonly club: Club | null;
}

const PLACE = 'washington-dc'; // the real place it's in (world/hikes.js)
// m from the door: nearer than WANT what builds it is sent for, and its
// sounds worked out; nearer than SHOW it's stood up, and past HIDE taken down
const WANT = 900;
const SHOW = 450;
const HIDE = 650;
const AT_HAND = 1.6; // m from the foot of the stairs, or a seat, that F reaches
const AFTER = 150; // s the room takes to empty after a show
const WATCHED = 120; // s of a show you have to see to have seen it
const HEARD_LOBBY = 0.3; // how much of a room's show you hear from the lobby
const SAY_LATE = 0.6; // share of a line gone by after which it isn't started (you came in on the end of it)
const ENCLOSED = 0.75; // how shut in it sounds downstairs (audio/soundscape.js)
// Sitting in a chair at a table: knees together, feet on the floor.
const SITTING = { spread: 0.12, hang: 0.48, fwd: 0.38, lean: -0.05, reins: 0 };
const SEAT_TOP = 0.46; // m, a chair's seat
const ID = 'improv:dc-improv';
// On the map's badge: a microphone on its stand.
const GLYPH = ['..###..', '..###..', '..###..', '...#...', '...#...', '...#...', '.#####.'];
// How the house is lit, and the stages: [house, stage] before a show and
// during it, and when there's no show.
const LIGHTS = { doors: [1, 0.7], on: [0.15, 1], dark: [0.8, 0.15] };

export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'act', 'caves', 'far', 'country', 'washington'];
export function installImprov(game: Game) {
  const { scene, gen, landforms, spaces, solids, player, map, hud, commands, save, sound, act, lights, pipeline, washington } = game;
  const card = landforms.cards.find((c: { id: string }) => c.id === PLACE);
  if (!card) return;
  const door = { x: card.at[0] + DOOR.x, z: card.at[1] + DOOR.z };
  let shift = 0; // ms added to the clock: only from the console, to try things out
  const clock = () => Date.now() + shift;

  // ── What's yours: the shows you've seen ───────────────────────────────────
  const seen: string[] = [];
  let been = false;
  save.register({
    id: 'improv',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ been, seen: [...seen] }),
    validate: (r: { been?: unknown; seen?: unknown }) => ({ been: r?.been === true, seen: Array.isArray(r?.seen) ? r.seen.filter((s: unknown) => typeof s === 'string' && s.length < 40).slice(-100) : [] }),
    restore(r: { been: boolean; seen: string[] }) {
      been = r.been;
      seen.length = 0;
      seen.push(...r.seen);
      // (left downstairs: it has to be there to be stood in)
      const a = player.arrival;
      if (a && Math.hypot(a.x - door.x, a.z - door.z) < 60) game.beforeArrival(ready().then(() => standUp()));
    },
  });

  // ── Where it is ───────────────────────────────────────────────────────────
  // The club's frame, once the ground it's on is here (the street's height
  // at its door), and downstairs as somewhere to be.
  let site: Site | null = null;
  let space: ClubSpace | null = null;
  function locate() {
    if (site || !landforms.has(PLACE)) return site;
    let street: number;
    try {
      street = gen.height(door.x, door.z);
    } catch {
      return null; // (the Earth under it hasn't come yet: next frame)
    }
    site = siteOf(card.at, street);
    space = new ClubSpace(site);
    spaces.add(space);
    return site;
  }
  async function ready() {
    if (!landforms.has(PLACE)) await landforms.ensure(PLACE);
    await look.ready();
    for (let i = 0; i < 600 && !locate(); i++) await new Promise((r) => setTimeout(r, 50));
    return site;
  }
  const world = (lx: number, lz: number) => toWorld(site!, lx, lz);

  // ── Standing it up ────────────────────────────────────────────────────────
  const look = lazy(() => import('./look.js'));
  let club: Club | null = null;
  const room = clubSounds();
  sound.addLayer(room);
  function standUp() {
    if (club || !site) return club;
    const m = look.want();
    if (!m) return null;
    club = new m.Club({ site, seed: (gen.seed ?? 1) | 0 });
    scene.add(club.front, club.below);
    solids.set('improv', club.solids);
    painted = '';
    return club;
  }
  function takeDown() {
    if (!club) return;
    // (gone from under you all at once, the map's go here, say: quiet, and the lights out)
    voices.stop();
    room.stop();
    for (const l of Object.values(glow)) if (l) l.power = 0;
    scene.remove(club.front, club.below);
    solids.clear('improv');
    club.dispose();
    club = null;
  }
  game.budget.add({
    name: 'improv',
    work(ms: number) {
      const d = Math.hypot(player.pos.x - door.x, player.pos.z - door.z);
      if (d > WANT) return false;
      // (performers before they're on, then the room's sounds, then the
      // people in the seats: a person at a time, each a few milliseconds)
      if (club && club.wanted.length) return club.pump();
      if (!room.ready) return room.pump(ms);
      return club ? club.pump() : false;
    },
  });

  // ── The lights ────────────────────────────────────────────────────────────
  // Over each stage, the spot; over the house, and the lobby, the house
  // lights. (Plain sources, read every frame: render/lights.js.)
  const glow = { main: null as null | Light, lounge: null as null | Light, house: null as null | Light, lobby: null as null | Light };
  type Light = { x: number; y: number; z: number; color: number[]; power: number; range: number; decay?: number; shadow?: boolean };
  function light(lx: number, ly: number, lz: number, color: number[], range: number, shadow = true): Light {
    const p = world(lx, lz);
    return lights.add(scene, { x: p.x, y: site!.floor + ly, z: p.z, color, power: 0, range, decay: 1.6, shadow });
  }

  // ── The shows ─────────────────────────────────────────────────────────────
  let shows: Show[] = [];
  let showsAt = -Infinity;
  const progs = new Map<string, Program>();
  const picks = new Map<string, Record<number, string>>(); // what you shouted, by show
  function upcoming(now: number) {
    if (Math.abs(now - showsAt) > 10 * 60000) {
      shows = showsAround(now, 4);
      showsAt = now;
    }
    return shows;
  }
  function progOf(show: Show): Program {
    let p = progs.get(show.id);
    if (!p) {
      p = program(show, picks.get(show.id) || {});
      progs.set(show.id, p);
      if (progs.size > 40) progs.delete(progs.keys().next().value!);
    }
    return p;
  }
  // The show in a room now (from its doors opening until the room's
  // emptied after it), and how far into it (s; < 0 before it starts).
  function playing(r: Room, now: number) {
    for (const show of upcoming(now)) {
      if (show.room !== r) continue;
      const prog = progOf(show);
      const s = (now - show.start) / 1000;
      if (s >= -DOORS * 60 && s <= prog.length + AFTER) return { show, prog, s };
    }
    return null;
  }
  const nextShow = (now: number, r?: Room, kind?: string) => upcoming(now).find((s) => s.start > now - 60000 && (!r || s.room === r) && (!kind || s.kind === kind)) || null;

  // ── Saying things the way people do ───────────────────────────────────────
  const pad2 = (n: number) => String(n).padStart(2, '0');
  function timeOf(ms: number) {
    const w = inDC(ms);
    const h = Math.floor(w.minutes / 60);
    const m = Math.floor(w.minutes % 60);
    return `${h % 12 || 12}:${pad2(m)} ${h < 12 ? 'am' : 'pm'}`;
  }
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dayOf(ms: number, now: number) {
    const a = inDC(ms);
    const b = inDC(now);
    if (a.y === b.y && a.m === b.m && a.d === b.d) return a.minutes >= 17 * 60 ? 'tonight' : 'today';
    const tomorrow = inDC(now + 86400000);
    if (a.y === tomorrow.y && a.m === tomorrow.m && a.d === tomorrow.d) return 'tomorrow';
    return DAY[a.weekday];
  }
  function billOf(show: Show) {
    const l = lineupOf(show);
    if (show.kind === 'improv') return [TROUPE.name];
    return l.acts.map((id: string) => person(id)!.name);
  }
  function whatOf(show: Show) {
    if (show.kind === 'improv') return `improv: ${TROUPE.name}, in ${HALLS[show.room as Room].name}`;
    if (show.kind === 'openmic') return `open mic, in ${HALLS[show.room as Room].name}`;
    const bill = billOf(show);
    return `stand-up: ${bill.at(-1)}, with ${bill.slice(0, -1).join(' and ')}, in ${HALLS[show.room as Room].name}`;
  }
  const whenOf = (show: Show, now: number) => `${dayOf(show.start, now)} at ${timeOf(show.start)}`;
  function untilOf(ms: number) {
    const min = Math.max(1, Math.round(ms / 60000));
    return min < 60 ? `in ${min} min` : min < 180 ? `in ${Math.floor(min / 60)} h ${pad2(min % 60)}` : '';
  }

  // ── What's painted ────────────────────────────────────────────────────────
  // The board in the lobby (the next shows), the posters out front, the
  // headshots: painted again as the shows go by.
  let painted = '';
  function paint(now: number) {
    if (!club) return;
    const list = upcoming(now).filter((s) => s.start + progOf(s).length * 1000 > now).slice(0, 12);
    const key = `${list[0]?.id}|${dayOf(list[0]?.start ?? now, now)}`;
    if (key === painted) return;
    painted = key;
    const board = list.map((s) => ({
      day: dayOf(s.start, now).replace(/^\w/, (c) => c.toUpperCase()).slice(0, 9),
      time: timeOf(s.start),
      what: s.kind === 'standup' ? `Stand-up · ${HALLS[s.room as Room].short}` : s.kind === 'improv' ? `Improv · ${HALLS[s.room as Room].short}` : `Open mic · ${HALLS[s.room as Room].short}`,
      who: billOf(s).join(', '),
      now: s.start <= now,
    }));
    const posterOf = (r: Room) => {
      const s = list.find((q) => q.room === r);
      if (!s) return { head: 'DC IMPROV', big: HALLS[r].short, lines: ['see the box office'] };
      const same = list.filter((q) => q.room === r && dayOf(q.start, now) === dayOf(s.start, now)).map((q) => timeOf(q.start));
      const bill = billOf(s);
      const head = dayOf(s.start, now).toUpperCase();
      if (s.kind === 'improv') return { head, big: TROUPE.name, lines: ['improv, made up on the spot', 'in the Lounge', same.join(' & ')] };
      if (s.kind === 'openmic') return { head, big: 'Open Mic', lines: bill.slice(0, 3), sub: same.join(' & ') };
      return { head, big: bill.at(-1)!, lines: [`with ${bill.slice(0, -1).join(' & ')}`, 'hosted by Dana Okafor', same.join(' & ')] };
    };
    const comics = list.filter((s) => s.kind === 'standup').flatMap((s) => lineupOf(s).acts);
    const headshots = [...new Set(comics)].slice(0, 4).map((id) => {
      const p = person(id)!;
      return { head: 'COMING UP', big: p.name, lines: ['from' in p && p.from ? `from ${p.from}` : ''] };
    });
    club.paint({ board, posters: { main: posterOf('main'), lounge: posterOf('lounge') }, headshots });
  }

  // ── Hearing it ────────────────────────────────────────────────────────────
  const voices = new Voices();
  const captions = new Captions();
  const crowdVoice = { id: 'crowd', name: 'someone in the crowd', voice: { pitch: 1.2, rate: 1.15, her: true } };
  let heard: { id: string; k: number } = { id: '', k: -2 };
  const laughed = new Set<string>();
  let laughing = { at: -Infinity, level: 0 };
  function laughFor(show: Show, k: number, e: Entry, heardShare: number) {
    const key = `${show.id}:${k}`;
    if (laughed.has(key) || e.laugh <= 0) return;
    laughed.add(key);
    if (laughed.size > 400) laughed.clear();
    if (heardShare > 0) room.laugh(e.laugh);
    laughing = { at: performance.now(), level: e.laugh };
  }
  // A new line in the room you're listening to: say it (if you're in the
  // room and it's not mostly gone by), and the room's applause and shouting.
  function hear(show: Show, prog: Program, k: number, s: number, inRoom: boolean, heardShare: number) {
    const e = prog.entries[k];
    if (!e) return;
    if (e.kind === 'applause') {
      if (heardShare > 0) room.applause(e.d, !!e.music && e.d > 4);
      return;
    }
    if (e.kind === 'shout') {
      if (heardShare > 0) room.shout();
      if (inRoom && sound.enabled && sound.running) voices.say(`${e.pick}!`, crowdVoice, 0.9);
      return;
    }
    const who = person(e.who);
    if (inRoom && sound.enabled && sound.running && who && voices.available && s - e.t < e.d * SAY_LATE) {
      voices.say(e.text, who, 1, { end: () => laughFor(show, k, e, heardShare) });
    }
  }

  // ── Sitting down ──────────────────────────────────────────────────────────
  let hold: { release(): void } | null = null;
  let seat: (typeof SEATS)[number] | null = null;
  const _seat = { x: 0, y: 0, z: 0 };
  const seatPlace = {
    place(out: { x: number; y: number; z: number; yaw: number }) {
      if (!seat || !site) return;
      const p = world(seat.x, seat.z);
      Object.assign(_seat, p);
      out.x = p.x;
      out.y = site.floor + SEAT_TOP - SEAT_HIPS;
      out.z = p.z;
      out.yaw = site.yaw + seat.yaw;
    },
    slack: 2,
  };
  function freeSeatNear(x: number, z: number) {
    if (!site || !club) return null;
    const l = toLocal(site, x, z);
    let best: { d: number; s: (typeof SEATS)[number] } | null = null;
    for (const s of SEATS) {
      const d = Math.hypot(s.x - l.x, s.z - l.z);
      if (d > AT_HAND || (best && d > best.d)) continue;
      if (club.audiences[s.room as Room].taken(SEATS.filter((q) => q.room === s.room).indexOf(s))) continue;
      best = { d, s };
    }
    return best;
  }
  function sitIn(s: (typeof SEATS)[number]) {
    const taken = player.rides.take({
      by: 'improv',
      what: 'your seat',
      aboard: seatPlace,
      lost() {
        hold = null;
        seat = null;
        player.character.seat(null);
      },
    });
    if (!taken) {
      hud.flash(player.rides.why());
      return false;
    }
    hold = taken;
    seat = s;
    player.vel.set(0, 0, 0);
    player.character.seat(SITTING);
    return true;
  }
  function getUp() {
    if (!hold || !seat || !site) return false;
    const s = seat;
    hold.release();
    hold = null;
    seat = null;
    player.character.seat(null);
    // a step back into the aisle
    const p = world(s.x - Math.sin(s.yaw) * 0.7, s.z - Math.cos(s.yaw) * 0.7);
    player.spawn(p.x, p.z, site.yaw + s.yaw, site.yaw + s.yaw + Math.PI, site.floor);
    return true;
  }

  // ── Going in and out ──────────────────────────────────────────────────────
  // In: down the stairs to the lobby (or straight into a room, from the
  // console). Out: up them to the street.
  const ARRIVE: Record<string, { x: number; z: number; yaw: number }> = {
    lobby: { x: STAIRS.x, z: STAIRS.z, yaw: 0 },
    main: { x: 0, z: 14.5, yaw: 0 },
    lounge: { x: 6.2, z: 5.3, yaw: Math.PI / 2 },
  };
  async function enter(r = 'lobby') {
    const at = ARRIVE[r];
    if (!at) throw new Error(`no room called ${r}: lobby, main or lounge`);
    await ready();
    if (!standUp()) return false;
    const p = world(at.x, at.z);
    player.camPitch = 0.05;
    player.spawn(p.x, p.z, site!.yaw + at.yaw, site!.yaw + at.yaw + Math.PI, site!.floor);
    if (r === 'lobby') hud.flash(`the DC Improv · ${ADDRESS}`, 3000);
    if (!been) {
      been = true;
      save.touch();
    }
    return true;
  }
  function out() {
    if (!site) return false;
    if (hold) getUp();
    const p = world(STREET.x, STREET.z + 0.4);
    player.camPitch = 0.1;
    player.spawn(p.x, p.z, site.yaw + Math.PI, site.yaw, Infinity);
    hud.flash('Connecticut Avenue', 2500);
    return true;
  }
  async function go() {
    await ready();
    standUp();
    // (the street last, and you set down on it at once: until you're there,
    // the city takes down whatever's far from you, frame by frame)
    await washington.standUp(door.x, door.z);
    const p = world(STREET.x, STREET.z - 1.5);
    player.camPitch = -0.12;
    player.spawn(p.x, p.z, site!.yaw, site!.yaw + Math.PI, Infinity);
    return true;
  }

  // ── The act key ───────────────────────────────────────────────────────────
  const where = () => {
    if (!site || !space || player.space !== space) return null;
    const l = toLocal(site, player.pos.x, player.pos.z);
    return { room: roomAt(l.x, l.z), x: l.x, z: l.z };
  };
  act.offer({
    id: 'improv-door',
    at() {
      if (!site || player.space) return null;
      const l = toLocal(site, player.pos.x, player.pos.z);
      const d = Math.hypot(l.x - STREET.x, l.z - STREET.z);
      if (d > STREET.reach || Math.abs(player.pos.y - site.y) > 2) return null;
      const now = clock();
      if (!isOpen(now)) {
        const n = nextShow(now);
        return { d, word: 'read the schedule', run: () => hud.flash(`the DC Improv is closed · the box office opens at noon${n ? ` · next: ${whatOf(n)}, ${whenOf(n, now)}` : ''}`, 6000), icon: pictures.MIC };
      }
      return { d, word: 'go in', run: () => enter('lobby'), icon: pictures.MIC };
    },
  });
  act.offer({
    id: 'improv-stairs',
    at() {
      const w = where();
      if (!w || w.room !== 'lobby' || hold) return null;
      const d = Math.hypot(w.x - STAIRS.foot.x, w.z - STAIRS.foot.z);
      return d < AT_HAND + 0.6 ? { d, word: 'go up to the street', run: out, icon: pictures.MIC } : null;
    },
  });
  // At the improv, while the host is asking for a suggestion: shout one.
  // (Offered before the seat, so it's what F does then, sitting or not.)
  function shoutable() {
    const w = where();
    if (!w || w.room !== 'lounge') return null;
    const now = clock();
    const p = playing('lounge', now);
    if (!p || p.show.kind !== 'improv') return null;
    const g = p.prog.games.find((q: Program['games'][number]) => p.s >= q.asked && p.s < q.decided - 0.4);
    if (!g || (picks.get(p.show.id) || {})[g.k]) return null;
    const mine = g.options[(g.k + seedOf(p.show.id)) % g.options.length];
    return mine ? { show: p.show, g, mine } : null;
  }
  function shout() {
    const s = shoutable();
    if (!s) return null;
    picks.set(s.show.id, { ...(picks.get(s.show.id) || {}), [s.g.k]: s.mine });
    progs.delete(s.show.id);
    hud.flash(`you shout “${s.mine}!” · and the host heard you`, 3500);
    return s.mine;
  }
  act.offer({
    id: 'improv-shout',
    at() {
      const s = shoutable();
      return s ? { d: 0, word: `shout “${s.mine}!”`, run: shout, icon: pictures.MIC } : null;
    },
  });

  act.offer({
    id: 'improv-seat',
    at() {
      if (hold) return { d: 0, word: 'get up', run: getUp, icon: pictures.MIC };
      const w = where();
      if (!w || (w.room !== 'main' && w.room !== 'lounge') || !player.rides.free) return null;
      const s = freeSeatNear(player.pos.x, player.pos.z);
      return s ? { d: s.d, word: 'take a seat', run: () => sitIn(s.s), icon: pictures.MIC } : null;
    },
  });
  // ── On the map, and in your pack ──────────────────────────────────────────
  function note() {
    const now = clock();
    const on = (['main', 'lounge'] as Room[]).map((r) => playing(r, now)).find((p) => p && p.s >= 0 && p.s < p.prog.length);
    if (on) return `${ADDRESS} · on now: ${whatOf(on.show)}`;
    const n = nextShow(now);
    return `${ADDRESS} · next: ${n ? `${whatOf(n)}, ${whenOf(n, now)}` : 'see the board'}`;
  }
  const place = () => {
    const at = site ? world(STREET.x, STREET.z) : { x: door.x + Math.sin(DOOR.yaw + Math.PI) * 2, z: door.z + Math.cos(DOOR.yaw + Math.PI) * 2 };
    return { id: ID, x: at.x, z: at.z, yaw: DOOR.yaw, name: 'DC Improv', kind: 'comedy club', note: `${note()}${seen.length ? ` · ${seen.length} show${seen.length > 1 ? 's' : ''} seen` : ''}`, words: 'washington dc comedy club stand-up improv jokes laugh connecticut avenue', glyph: GLYPH, visited: been };
  };
  map.places.addSource({
    list: 'washington',
    destinations: () => [place()],
    within: (x0: number, z0: number, x1: number, z1: number) => (door.x >= x0 - 5 && door.x <= x1 + 5 && door.z >= z0 - 5 && door.z <= z1 + 5 ? [place()] : []),
    get: (id: string) => (id === ID ? place() : null),
  });
  commands.add({
    id: 'improv',
    group: 'WASHINGTON',
    label: 'DC Improv: what’s on',
    icon: pictures.MIC,
    run() {
      const now = clock();
      const d = Math.hypot(player.pos.x - door.x, player.pos.z - door.z);
      const list = upcoming(now).filter((s) => s.start + progOf(s).length * 1000 > now).slice(0, 3);
      const what = list.map((s) => `${whatOf(s)}, ${whenOf(s, now)}${s.start > now ? ` (${untilOf(s.start - now)})` : ' (on now)'}`.replace(/ \(\)$/, ''));
      hud.flash(`the DC Improv, ${ADDRESS}, ${d < 30 ? 'right here' : `${formatDistance(d)} off`} · ${what.join(' · ')}`, 9000);
      return true;
    },
  });

  // ── Each frame ────────────────────────────────────────────────────────────
  let watched = { id: '', since: 0 };
  let wasIn: string | null = null;
  game.addSystem({
    name: 'improv',
    phase: 'world',
    update({ dt }) {
      const d = Math.hypot(player.pos.x - door.x, player.pos.z - door.z);
      if (d > HIDE && !club) {
        captions.hide();
        return;
      }
      if (d < WANT) {
        look.want();
        locate();
      }
      if (d < SHOW && site && look.loaded) standUp();
      else if (d > HIDE) {
        takeDown();
        captions.hide();
        hud.cue(null, 'improv');
        return;
      }
      if (!club || !site) return;
      const now = clock();
      paint(now);
      if (!glow.main) {
        glow.main = light(0, 4.0, 26.2, [1, 0.92, 0.78], 11);
        glow.lounge = light(13.4, 3.1, 5.0, [1, 0.9, 0.74], 7);
        glow.house = light(0, 4.0, 17.5, [1, 0.8, 0.62], 15, false);
        glow.lobby = light(0, 2.9, 5, [1, 0.82, 0.66], 8, false);
      }

      // where you are: on the street, or downstairs in which room
      const w = where();
      const inside = w?.room ?? null;
      club.below.visible = !!w;
      if (inside !== wasIn) {
        if (wasIn && wasIn !== 'lobby') voices.stop();
        if (!inside) room.stop();
        wasIn = inside;
        heard = { id: '', k: -2 };
      }
      if (w) {
        sound.setEnclosed(Math.max(sound.enclosed || 0, ENCLOSED));
        pipeline.haze = 0;
        pipeline.fogFar = 1e5;
      }

      // the shows in each room, and the one you're listening to: the
      // room you're in, or from the lobby whichever has a show on
      const on = { main: playing('main', now), lounge: playing('lounge', now) };
      const listen: Room | null = inside === 'main' || inside === 'lounge' ? inside : inside === 'lobby' ? ((['main', 'lounge'] as Room[]).find((r) => on[r] && on[r]!.s >= 0 && on[r]!.s < on[r]!.prog.length) ?? null) : null;
      const inRoom = !!listen && listen === inside;
      const share = inRoom ? 1 : listen ? HEARD_LOBBY : 0;

      // each room: how full, how lit, who's on its stage
      for (const r of ['main', 'lounge'] as Room[]) {
        const p = on[r];
        if (!p) {
          club.fill(r, 0, 0);
          continue;
        }
        const len = p.prog.length;
        const target = fullness(p.show);
        const arriving = Math.min(1, Math.max(0.12, (p.s + DOORS * 60) / (DOORS * 60 - 240)));
        const leaving = p.s > len ? Math.max(0, 1 - (p.s - len) / AFTER) : 1;
        club.fill(r, Math.round(target * arriving * leaving * 40) / 40, seedOf(p.show.id));
      }
      const L = listen && on[listen] ? on[listen]! : null;
      const stageOf = (r: Room) => {
        const p = on[r];
        if (!p || p.s < 0 || p.s > p.prog.length) return LIGHTS[p ? 'doors' : 'dark'];
        return LIGHTS.on;
      };
      const here = inside === 'main' || inside === 'lounge' ? inside : listen;
      const [houseLit, stageLit] = here ? stageOf(here) : LIGHTS.doors;
      club.lit(inside === 'lobby' ? 1 : houseLit, stageLit);
      // the lights: up only while you're downstairs
      const showOn = (r: Room) => !!on[r] && on[r]!.s >= -DOORS * 60 && on[r]!.s <= on[r]!.prog.length;
      glow.main!.power = w ? (showOn('main') ? 60 : 8) : 0;
      glow.lounge!.power = w ? (showOn('lounge') ? 30 : 5) : 0;
      glow.house!.power = w ? 25 * houseLit : 0;
      glow.lobby!.power = w && inside === 'lobby' ? 14 : 0;

      // the performers: only on the stage you can see
      const laughAge = (performance.now() - laughing.at) / 1000;
      const laughNow = Math.max(0, (laughing.level / 3) * (1 - laughAge / (1 + laughing.level * 1.2)));
      if (here) {
        const p = on[here];
        const k = p ? cursor(p.prog, p.s) : -1;
        const e = p && k >= 0 && k < p.prog.entries.length ? p.prog.entries[k] : null;
        // everyone on the bill made before they're wanted
        if (p) club.cast(castOf(p.show), person);
        const talking = e && e.kind === 'line' && p!.s < e.t + e.d ? e.who : null;
        club.perform(here, e ? e.on : {}, dt, { speaking: talking, laugh: inRoom ? laughNow : 0, people: person });
      }

      // what's said: a line at a time, as the show reaches it
      if (L && listen) {
        const k = cursor(L.prog, L.s);
        if (L.show.id !== heard.id || k !== heard.k) {
          const was = heard;
          heard = { id: L.show.id, k };
          // (a line you came in on the end of isn't said: just its words)
          if (k >= 0 && k < L.prog.entries.length && !(was.id === '' && L.s - L.prog.entries[k].t > 3)) hear(L.show, L.prog, k, L.s, inRoom, share);
        }
        // the room laughs once a line's been said: when the voice is done
        // with it, or by the end of its time if there's no voice to say it
        if (k >= 0 && k < L.prog.entries.length) {
          const e = L.prog.entries[k];
          const spoken = inRoom && voices.available && sound.enabled && sound.running;
          if (e.kind === 'line' && L.s >= e.t + e.d + (spoken ? e.gap * 0.6 : 0)) laughFor(L.show, k, e, share);
        }
        // seen it, once you've watched long enough
        if (inRoom && L.s >= 0 && L.s <= L.prog.length) {
          if (watched.id !== L.show.id) watched = { id: L.show.id, since: L.s };
          else if (L.s - watched.since > WATCHED && !seen.includes(L.show.id)) {
            seen.push(L.show.id);
            if (seen.length > 100) seen.shift();
            hud.flash(`you caught ${whatOf(L.show)} · ${seen.length} show${seen.length > 1 ? 's' : ''} seen at the DC Improv`, 4000);
            save.touch();
          }
        }
      }

      // the room's sound: how much you hear of it, the crowd, the music
      const P = L;
      const lineOn = P && P.s >= 0 && P.s <= P.prog.length;
      const entry = P && lineOn ? P.prog.entries[Math.max(0, cursor(P.prog, P.s))] : null;
      room.set({
        heard: share * (sound.enabled ? 1 : 0),
        murmur: P && !lineOn ? Math.min(1, crowdOf(P)) : 0,
        music: P ? (lineOn ? (entry?.music ? 1 : 0) : 0.45) : 0,
      });

      // the words on the screen, and what F would do
      if (P && lineOn && entry && (inRoom || (share > 0 && entry.kind !== 'line'))) {
        if (entry.kind === 'line') captions.show(person(entry.who)?.name ?? '', entry.text);
        else if (entry.kind === 'shout') captions.show('the crowd', (entry.texts || []).map((t: string) => `“${t}”`).join('   '), { tone: 'room' });
        else captions.show('', entry.music ? '(applause, and music)' : '(applause)', { tone: 'room' });
      } else captions.hide();
      cue(w, on, now);
    },
  });

  // How full a show's room is: a weekend's stand-up all but sold out, a
  // Monday's open mic a few friends of the comics.
  function fullness(show: Show) {
    const r = ((seedOf(show.id) >>> 8) % 1000) / 1000;
    if (show.kind === 'openmic') return 0.3 + r * 0.25;
    if (show.kind === 'improv') return 0.5 + r * 0.4;
    const weekend = show.weekday === 5 || show.weekday === 6;
    return weekend ? 0.85 + r * 0.13 : 0.55 + r * 0.3;
  }
  function crowdOf(p: { show: Show; s: number; prog: Program }) {
    const arriving = Math.min(1, Math.max(0, (p.s + DOORS * 60) / (DOORS * 60 - 240)));
    const leaving = p.s > p.prog.length ? Math.max(0, 1 - (p.s - p.prog.length) / AFTER) : 1;
    return fullness(p.show) * arriving * leaving;
  }
  function castOf(show: Show) {
    const l = lineupOf(show);
    return [l.host, ...l.acts];
  }

  // What the HUD says: at the door, what's on; downstairs, when the next
  // show starts, and anything F would do.
  function cue(w: ReturnType<typeof where>, on: Record<Room, ReturnType<typeof playing>>, now: number) {
    const F = (word: string) => act.key(word);
    const here = act.here();
    const verb = here && here.id.startsWith('improv-') ? ` · ${F(here.word)} to ${here.word}` : '';
    if (!w) {
      const l = site ? toLocal(site, player.pos.x, player.pos.z) : null;
      if (!l || Math.hypot(l.x - STREET.x, l.z - STREET.z) > STREET.reach + 2 || player.space) return void hud.cue(null, 'improv');
      const n = (['main', 'lounge'] as Room[]).map((r) => on[r]).find((p) => p && p.s >= -DOORS * 60 && p.s < p.prog.length);
      const nx = nextShow(now);
      const what = n ? `${n.s < 0 ? 'doors are open' : 'on now'}: ${whatOf(n.show)}` : nx ? `next: ${whatOf(nx)}, ${whenOf(nx, now)}` : '';
      return void hud.cue({ html: `<b>DC Improv</b> · ${what}${verb}` }, 'improv');
    }
    if (hold) return void hud.cue({ html: `in your seat${verb}` }, 'improv');
    if (w.room === 'lobby') {
      const parts = (['main', 'lounge'] as Room[]).map((r) => {
        const p = on[r];
        if (p && p.s >= 0 && p.s < p.prog.length) return `${HALLS[r].short}: on now`;
        if (p && p.s < 0) return `${HALLS[r].short}: ${KINDS[p.show.kind as keyof typeof KINDS]} at ${timeOf(p.show.start)}, doors open`;
        const n = nextShow(now, r);
        return n ? `${HALLS[r].short}: next ${dayOf(n.start, now)} at ${timeOf(n.start)}` : '';
      });
      return void hud.cue({ html: `${parts.filter(Boolean).join(' · ')}${verb}` }, 'improv');
    }
    const r = w.room as Room;
    const p = on[r];
    if (p && p.s < 0) return void hud.cue({ html: `the show starts at ${timeOf(p.show.start)} (${untilOf(-p.s * 1000)})${verb}` }, 'improv');
    if (p && p.s > p.prog.length) {
      const n = nextShow(now, r);
      return void hud.cue({ html: `that’s the show${n ? ` · next in here: ${dayOf(n.start, now)} at ${timeOf(n.start)}` : ''}${verb}` }, 'improv');
    }
    if (!p) {
      const n = nextShow(now, r);
      return void hud.cue({ html: `no show on in ${HALLS[r].name}${n ? ` · next: ${whatOf(n)}, ${whenOf(n, now)}` : ''}${verb}` }, 'improv');
    }
    // during the show: only what F would do
    if (verb) hud.cue({ html: verb.slice(3) }, 'improv');
    else hud.cue(null, 'improv');
  }

  game.provide('improv', {
    get site() {
      return site;
    },
    get room() {
      return where()?.room ?? null;
    },
    schedule() {
      const now = clock();
      return upcoming(now).map((s) => ({ id: s.id, room: s.room, kind: s.kind, when: whenOf(s, now), bill: billOf(s) }));
    },
    now() {
      const now = clock();
      const of = (r: Room) => {
        const p = playing(r, now);
        if (!p) return null;
        const k = cursor(p.prog, p.s);
        const e = k >= 0 && k < p.prog.entries.length ? p.prog.entries[k] : null;
        return { show: p.show.id, kind: p.show.kind, at: Math.round(p.s * 10) / 10, length: Math.round(p.prog.length), who: e ? e.who : null, line: e ? e.text : null, kind_of: e ? e.kind : null };
      };
      return { main: of('main'), lounge: of('lounge'), room: where()?.room ?? null, caption: captions.text };
    },
    go,
    enter,
    soon(kind?: string, seconds = 10) {
      const now = clock();
      const n = nextShow(now + 1000, undefined, kind);
      if (!n) return null;
      shift += n.start - now - seconds * 1000;
      return n.id;
    },
    sit() {
      const s = freeSeatNear(player.pos.x, player.pos.z);
      return s ? sitIn(s.s) : false;
    },
    toSeat() {
      // (to try it out) beside the free seat nearest you, in the room you're in
      const w = where();
      if (!w || !club || (w.room !== 'main' && w.room !== 'lounge')) return false;
      const list = SEATS.filter((q) => q.room === w.room);
      let best: (typeof SEATS)[number] | null = null;
      for (const [i, q] of list.entries()) {
        if (club.audiences[w.room].taken(i)) continue;
        if (!best || Math.hypot(q.x - w.x, q.z - w.z) < Math.hypot(best.x - w.x, best.z - w.z)) best = q;
      }
      if (!best) return false;
      const p = world(best.x - Math.sin(best.yaw) * 0.5, best.z - Math.cos(best.yaw) * 0.5);
      player.spawn(p.x, p.z, site!.yaw + best.yaw, site!.yaw + best.yaw + Math.PI, site!.floor);
      return true;
    },
    shout,
    get seated() {
      return !!hold;
    },
    get club() {
      return club;
    },
    get seen() {
      return [...seen];
    },
  });
}

