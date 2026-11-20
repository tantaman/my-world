// The foreman: puts up a staked-out blueprint for you, a piece at a time,
// walking the hiker from one job to the next and doing each one with the
// same tools and the same rules as building by hand. So it is no quicker
// than you and can't do anything you couldn't.
//
// It keeps the site (which plan is staked out where). While it's working,
// each frame it:
//   1. asks the plan what's next (plan.js nextJob): a notch to cut, a
//      footing, the nearest log of the lowest course, a roof. Before the
//      footings it clears the site of trees, stumps and brush (clear.js),
//      and if the footings can't all reach one level or the ground stands
//      above the sills, it levels it (grade.js);
//   2. checks it can be done, here and now, with the tools' own checks
//      (footingCheck, logCheck, roofCheck). Short of stones, logs, timber or
//      soil, it goes and gets what the rest of the plan needs (gather.js):
//      picks up stones, fells, limbs and bucks trees, hews logs square,
//      digs soil. Anything else it can't get round (too steep to level, a
//      tree in the way of a wall), it stops and says;
//   3. walks there, round the building rather than through it (Player.steer);
//   4. does it: cuts or fills a spadeful towards grade, digs the footing,
//      lays the log, swings the axe at the notch, raises the roof
//      (spadeWork, digFooting, layLog, cutNotch, raiseRoof).
// Touch the controls and you have the hiker back: it pauses.
//
// work() is called from the blueprint tool's own work() while that tool is in
// hand, so the bench (build/builder.js) swings the axe, fills the progress
// bar and puts what the foreman says on the prompt.
//
// Emits:
//   'change'  ()       a site was staked out, or the stakes pulled up
//   'done'    (name)   the last piece went in

import { Emitter } from '../core/events.js';
import { tenths } from '../build/inventory.js';
import { JOIN_RADIUS, height } from '../build/constants.js';
import { footingCheck, digFooting } from '../build/tools/footing.js';
import { logCheck, layLog } from '../build/tools/wall.js';
import { axe, cutNotch, swingAt, hew, HEW } from '../build/tools/axe.js';
import { roofCheck, raiseRoof } from '../build/tools/roof.js';
import { spadeWork, digObstacles, grubStump, clearBrush, BRUSH } from '../build/tools/shovel.js';
import { pickUp } from '../build/tools/hands.js';
import { SPECIES, treeName } from '../build/forestry.js';
import { LIFTABLE } from '../build/constants.js';
import { TREE_KINDS } from '../world/flora.js';
import { normalize, place, findBuilding, survey, nextJob, progress, standAt, route, grow, inside } from './plan.js';
import { levelling, nextSpot, siteGround, TOL } from './grade.js';
import { stillNeeded, pickTree, fellingSpot, trunkSpot, pickStone, borrowSpots, middle, RANGE } from './gather.js';
import { zone, lyingOn, nextClearing, BRUSH_ZONE } from './clear.js';

const STAND_OFF = 1.2; // m outside the footprint that work is done from
const KEEP_OFF = 0.9; // m the way round keeps clear of the footprint (walls, log ends)
const ARRIVE = 0.45; // m from the spot is there
const WAYPOINT = 0.6; // m from a corner of the way round is past it
const RUN_FROM = 7; // m: further than this, run
const STALL = 1.2; // s without getting any closer before trying another way
const SIDESTEP = 1.6; // m to one side, to get round whatever is in the way
const TRIES = 4; // sidesteps before giving up and asking for help
// m from the work that will do, if where it's meant to be done from can't be
// reached; a notch is cut from wherever you stand, if it's this close
const REACH = { grade: 2.6, footing: 2.2, log: 4.5, notch: 2.6, roof: 6, fell: 2, buck: 2.3, stone: 2.2, borrow: 2.6, grub: 2.2, brush: 2.2 };
const BRUSH_REACH = 1.3; // m round where the spade goes in that one swing clears of brush
const SPADE = { near: 0.5, off: 1.5 }; // m: no nearer than this to the spot you're levelling; stand this far off it
const STUCK = 1; // s of spade work without a spot moving before leaving it be
const SETTLE = 0.35; // s squaring up to a log or a roof before setting it down
const BREATHER = { grade: 0.05, footing: 0.4, log: 0.6, notch: 0.15, roof: 0.9, fell: 0.1, buck: 0.1, hew: 0.05, stone: 0.2, borrow: 0.05, grub: 0.3, brush: 0.1 }; // s after each piece
const BORROW_DEPTH = 0.4; // m: soil is dug this deep at a spot, at most, before moving on
const SOIL_SPARE = 0.3; // m³ more than levelling needs, dug while at it
const FALLEN_RANGE = RANGE + 15; // m from the site a tree already down is worth bucking

// A site as it is saved (one of 'yours': see index.js). `level` is the grade
// levelling began to, if it has, so it carries on to the same one.
// -> tidy, or null.
export function validSite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const plan = normalize(raw.plan);
  if (!plan || !Number.isInteger(raw.x) || !Number.isInteger(raw.z)) return null;
  const rot = Number.isInteger(raw.rot) ? ((raw.rot % 4) + 4) % 4 : 0;
  return { plan, x: raw.x, z: raw.z, rot, level: Number.isFinite(raw.level) ? raw.level : null };
}

export class Foreman extends Emitter {
  constructor({ player }) {
    super();
    this.player = player;
    this.site = null; // { plan, x, z, rot, level }
    this.placed = null; // the plan on the ground (plan.js place)
    this.state = 'idle'; // idle | working | paused
    this.why = ''; // why it stopped
    this.bad = false; // ...and whether that's a problem to fix (red)
    this.doing = ''; // what it's on, in words
    this.levelling = false; // a pass of levelling is under way
    this.skip = new Set(); // 'ix,iz' of spots levelling couldn't move
    // what it has gone to get, while it does: { kind: 'stone' | 'log' |
    // 'timber' | 'soil', until (soil), tree, rock, spot: the one it's on, dug }
    this.gathering = null;
    this._reset();
  }

  // ── The site ──────────────────────────────────────────────────────────────
  stake(plan, x, z, rot = 0) {
    this.stop();
    this.site = validSite({ plan, x, z, rot });
    this.placed = this.site && place(this.site.plan, x, z, this.site.rot);
    this.emit('change');
    return !!this.site;
  }

  // Forget the site; whatever is built stays built.
  pullUp() {
    this.stop();
    this.site = null;
    this.placed = null;
    this.emit('change');
  }

  serialize() {
    const s = this.site;
    return s ? { plan: normalize(s.plan), x: s.x, z: s.z, rot: s.rot, level: s.level } : null;
  }

  load(data) {
    this.stop();
    this.site = validSite(data);
    this.placed = this.site && place(this.site.plan, this.site.x, this.site.z, this.site.rot);
  }

  // The building on the site, and any other close enough to get in the way.
  building(buildings) {
    return this.placed ? findBuilding(this.placed, buildings.list, JOIN_RADIUS) : { b: null, clash: null };
  }

  // ── Working ───────────────────────────────────────────────────────────────
  start() {
    if (!this.site) return false;
    this.state = 'working';
    this.why = '';
    this.bad = false;
    this.skip.clear();
    this._reset();
    return true;
  }

  pause(why = '', bad = false) {
    if (!this.site) return;
    this.state = 'paused';
    this.why = why;
    this.bad = bad;
    this._release();
  }

  stop() {
    this.state = 'idle';
    this.why = '';
    this.bad = false;
    this.levelling = false;
    this.gathering = null;
    this._release();
    this._hold(null);
  }

  toggle() {
    if (this.state === 'working') this.pause();
    else this.start();
  }

  // What to put on the prompt. -> { text, bad }
  status(buildings) {
    if (!this.site) return { text: '', bad: false };
    const p = progress(this.placed, this.building(buildings).b);
    const name = this.site.plan.name;
    const count = `<i>(${p.done} of ${p.total} pieces)</i>`;
    if (this.state === 'working') return { text: `building the ${name}: ${this.doing} ${count} · <b>click</b> pause`, bad: false };
    if (this.state === 'paused' && this.why) return { text: `${this.why} · <b>click</b> carry on · <b>right-click</b> pull up the stakes`, bad: this.bad };
    const verb = this.state === 'paused' ? 'carry on' : 'build it for me';
    return { text: `the ${name} is staked out ${count} · <b>click</b> ${verb} · <b>right-click</b> pull up the stakes`, bad: false };
  }

  // Every frame, whatever else is going on (a swing, say): your own keys
  // take the hiker back.
  watch(b) {
    if (this.state !== 'working' || !this.player.manual) return;
    this.pause('paused: you took over');
    b.dropHold();
  }

  // One frame of work. b: the bench. -> true while busy at a piece (which
  // slows the hiker and turns them to face it).
  work(b, dt) {
    if (this.state !== 'working' || !this.site) return false;
    const P = this.player;
    if (P.manual) {
      this.watch(b);
      return false;
    }
    if (this.rest > 0) {
      this.rest -= dt;
      return true;
    }
    const { b: at, clash } = this.building(b.buildings);
    if (clash) return this._stuck(b, `another building is closer than ${JOIN_RADIUS} m: its footings would join this one`);
    const first = at ? null : survey(this.placed, (x, z) => b.chunks.heightAt(x, z)).first;
    let job = nextJob(this.placed, at, P.pos, first);
    // before the footings: clear the site, then level it
    let clearing = job.type === 'footing' && this._clear(b);
    if (clearing) job = clearing;
    else if (job.type === 'footing') {
      const grade = this._grade(b, at);
      if (grade && grade.trouble) return this._stuck(b, grade.trouble);
      if (grade) job = grade;
    }
    if (job.type === 'done') {
      const name = this.site.plan.name;
      this.pullUp();
      this.emit('done', name);
      return false;
    }
    let chk = check(b, at, job);
    // a tree or a stump in the way of a wall: clear the site, then carry on
    if (job.type === 'log' && chk.blocked) clearing = this._clear(b);
    if (clearing) {
      job = clearing;
      chk = { reason: null };
    }
    // short of something for it? go and get what the rest of the plan needs
    const lack = chk.short ? lacking(job) : null;
    if (lack && !this.gathering) this.gathering = { kind: lack, until: job.type === 'grade' ? job.fill + SOIL_SPARE : 0, dug: new Set() };
    if (this.gathering && !clearing) {
      const g = this._gather(b, at);
      if (g && g.trouble) return this._stuck(b, g.trouble);
      if (g) {
        job = g;
        chk = { reason: null };
      } else {
        this.gathering = null;
        if (lack) return this._stuck(b, chk.reason);
      }
    }
    if (chk.reason) return this._stuck(b, chk.reason);
    const key = jobKey(job);
    if (key !== this.key) this._begin(job, key);
    const words = describe(job, b.chunks.gen);
    this.doing = clearing ? `clearing the site: ${words}` : this.gathering ? `${this._gatheringWords(b, at)}: ${words}` : words;
    if (job.type === 'hew' || job.type === 'wait') this.there = true; // done where you stand
    if (!this.there && !this._walk(b, job, dt)) return false;
    P.steer = null;
    return this._do(b, at, job, chk, dt);
  }

  // ── Levelling ─────────────────────────────────────────────────────────────
  // Before the footings: is there levelling to do? -> a 'grade' job (the
  // next spot to bring to grade), { trouble } if it can't be levelled, or
  // null to get on with the footings.
  _grade(b, at) {
    const site = this.site;
    const built = new Set(at ? [...at.footings.values()].map((f) => `${f.x},${f.z}`) : []);
    const lv = levelling(this.placed, siteGround(b, this.placed.rect), { y0: at ? at.y0 : null, level: site.level, built, earn: !b.creative });
    if (!lv.need && !this.levelling) return null;
    if (lv.need && lv.trouble) return { trouble: lv.trouble };
    // keep at the spot in hand till it's done, or the nearest-and-worst
    // would change its mind every step
    const [ix, iz] = this.key && this.key.startsWith('g:') ? this.key.slice(2).split(':').map(Number) : [];
    const v = lv.work.find((w) => w.ix === ix && w.iz === iz && !this.skip.has(`${ix},${iz}`)) || nextSpot(lv.work, this.player.pos, this.skip);
    if (!v) {
      // done, or nothing more a spade can do: the footings will say if that's not enough
      this.levelling = false;
      return null;
    }
    this.levelling = true;
    if (site.level === null) {
      site.level = lv.level;
      this.emit('change');
    }
    return { type: 'grade', x: v.ix, z: v.iz, mode: v.mode, level: lv.level, fill: lv.fill };
  }

  // ── Clearing ──────────────────────────────────────────────────────────────
  // Anything standing on the site to clear? -> a 'wait' (a tree coming
  // down), 'buck', 'fell', 'grub' or 'brush' job, or null once it's clear.
  _clear(b) {
    const rect = this.placed.rect;
    const Z = zone(rect);
    const pad = grow(rect, BRUSH_ZONE);
    const F = b.forest;
    const c = middle(rect);
    const R = Math.hypot(Z.x1 - c.x, Z.z1 - c.z) + 1;
    const about = { falling: [], down: [], trees: [], stumps: [], brush: [] };
    for (const f of F.felled.values()) {
      if (f.state === 'falling') {
        if (inside(f, Z)) about.falling.push(f);
      } else if (lyingOn(f, trunkTop(F, f), rect)) about.down.push(f);
    }
    b.chunks.forEachPlant(c.x, c.z, R, TREE_KINDS, (ch, kind, k, x, y, z) => {
      if (inside({ x, z }, Z)) about.trees.push({ x, z });
    });
    for (const s of F.stumps.values()) if (inside(s, Z)) about.stumps.push(s);
    b.chunks.forEachPlant(c.x, c.z, R, BRUSH, (ch, kind, k, x, y, z, s) => {
      if (inside({ x, z }, pad) && (kind !== 'rock' || s <= LIFTABLE)) about.brush.push({ x, z });
    });
    // nearest to where it last worked: it keeps at one thing, and works outward
    const P = this.player.pos;
    const next = nextClearing(about, this.lastAt || P);
    if (!next) return null;
    const it = next.it;
    if (next.type === 'wait') return { type: 'wait', f: it, x: it.x, z: it.z };
    if (next.type === 'buck') return buckJob(F, it, P);
    if (next.type === 'grub') return { type: 'grub', stump: it, x: it.x, z: it.z, stand: toward(it, P, it.r + 1) };
    if (next.type === 'brush') return { type: 'brush', x: it.x, z: it.z, stand: toward(it, P, 1.2) };
    const tree = F.treeNear(it.x, it.z, 0.05);
    const r = SPECIES[tree.kind].r * tree.s;
    return { type: 'fell', tree, r, x: tree.x, z: tree.z, stand: fellingSpot({ x: tree.x, z: tree.z, r }, rect, P) };
  }

  // ── Gathering ─────────────────────────────────────────────────────────────
  // The next thing to do for what it went to get. -> a job, { trouble } if
  // there's none of it to be had, or null once it has enough.
  _gather(b, at) {
    const g = this.gathering;
    const need = stillNeeded(this.placed, at);
    const inv = b.inv;
    if (g.kind === 'stone') return b.have('stone', need.stone) ? null : this._stone(b, need.stone);
    if (g.kind === 'soil') return b.have('soil', g.until) ? null : this._borrow(b);
    // logs enough for the walls, and for whatever timber is still to hew
    if (g.kind === 'log') return b.have('log', need.log + Math.max(0, need.timber - inv.timber)) ? null : this._wood(b);
    if (b.have('timber', need.timber)) return null;
    // hew what the walls can spare, or go and get more wood
    if (inv.log - need.log >= HEW - 1e-6) return { type: 'hew', x: this.player.pos.x, z: this.player.pos.z };
    return this._wood(b);
  }

  // Wood: a tree that is down near the site, or else one to fell.
  _wood(b) {
    const F = b.forest;
    const c = middle(this.placed.rect);
    const P = this.player.pos;
    let down = null;
    for (const f of F.felled.values()) {
      if (Math.hypot(f.x - c.x, f.z - c.z) > FALLEN_RANGE) continue;
      if (f.state === 'falling') return { type: 'wait', f, x: f.x, z: f.z };
      if (!down || Math.hypot(f.x - P.x, f.z - P.z) < Math.hypot(down.x - P.x, down.z - P.z)) down = f;
    }
    if (down) return buckJob(F, down, P);
    // the tree it chose, while it stands; else the best about
    const g = this.gathering;
    let tree = g.tree && F.treeNear(g.tree.x, g.tree.z, 0.05);
    if (!tree) {
      const trees = [];
      b.chunks.forEachPlant(c.x, c.z, RANGE, TREE_KINDS, (ch, kind, k, x, y, z, s) => trees.push({ x, z, r: SPECIES[kind].r * s, meters: SPECIES[kind].meters(s) }));
      const t = pickTree(trees, this.placed.rect, P);
      if (!t) return { trouble: `no trees within ${RANGE} m to fell for logs` };
      tree = F.treeNear(t.x, t.z, 0.05);
      g.tree = { x: tree.x, z: tree.z };
    }
    const r = SPECIES[tree.kind].r * tree.s;
    return { type: 'fell', tree, r, x: tree.x, z: tree.z, stand: fellingSpot({ x: tree.x, z: tree.z, r }, this.placed.rect) };
  }

  // A small stone to pick up: the one it chose while it's there, else the nearest.
  _stone(b, want) {
    const g = this.gathering;
    let rock = g.rock && rockAt(b, g.rock);
    if (!rock) {
      const c = middle(this.placed.rect);
      const stones = [];
      b.chunks.forEachPlant(c.x, c.z, RANGE, ['rock'], (ch, kind, k, x, y, z, s) => {
        if (s <= LIFTABLE) stones.push({ ch, kind, k, x, y, z, s });
      });
      rock = pickStone(stones, this.placed.rect, this.player.pos);
      if (!rock) return { trouble: `no stones small enough to lift within ${RANGE} m: bring ${want - b.inv.stone} more` };
      g.rock = { x: rock.x, z: rock.z };
    }
    return { type: 'stone', rock, x: rock.x, z: rock.z, stand: toward(rock, this.player.pos, 1) };
  }

  // Somewhere round the site to dig soil from, a little at each spot.
  _borrow(b) {
    const g = this.gathering;
    if (!g.spot) {
      const wet = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
      const at = borrowSpots(this.placed.rect, this.player.pos).find((s) => !g.dug.has(`${s.x},${s.z}`) && !digObstacles(b, s.x, s.z).roots && !b.chunks.waterAt(s.x, s.z, wet));
      if (!at) return { trouble: 'nowhere left to dig soil near the site: bring some' };
      g.spot = { ...at, floor: b.chunks.heightAt(at.x, at.z) - BORROW_DEPTH };
    }
    const { x, z } = g.spot;
    return { type: 'borrow', x, z, floor: g.spot.floor, stand: toward(g.spot, this.player.pos, SPADE.off) };
  }

  // "gathering logs (12 of 82 m)" and the like, for the prompt.
  _gatheringWords(b, at) {
    const g = this.gathering;
    const need = stillNeeded(this.placed, at);
    const inv = b.inv;
    if (g.kind === 'stone') return `gathering stones (${inv.stone} of ${need.stone})`;
    if (g.kind === 'soil') return `digging soil to level with (${tenths(inv.soil)} of ${tenths(g.until)} m³)`;
    if (g.kind === 'log') return `gathering logs (${tenths(inv.log)} of ${tenths(need.log + Math.max(0, need.timber - inv.timber))} m)`;
    return `making timber (${tenths(inv.timber)} of ${tenths(need.timber)} m)`;
  }

  // ── Getting there ─────────────────────────────────────────────────────────
  _begin(job, key) {
    this._reset();
    this.key = key;
    this.lastAt = { x: job.x, z: job.z };
    const P = this.player.pos;
    if (job.stand) {
      this.spot = job.stand;
      this.path = route({ x: P.x, z: P.z }, this.spot, grow(this.placed.rect, KEEP_OFF));
      return;
    }
    if (job.type === 'grade') {
      // nothing is built yet: stand a little off the spot, on the side you're on
      const dx = P.x - job.x;
      const dz = P.z - job.z;
      const d = Math.hypot(dx, dz) || 1;
      this.spot = { x: job.x + (dx / d) * SPADE.off, z: job.z + (dz / d) * SPADE.off };
      this.path = [this.spot];
      return;
    }
    this.spot = standAt(job.x, job.z, this.placed.rect, STAND_OFF, P);
    this.path = route({ x: P.x, z: P.z }, this.spot, grow(this.placed.rect, KEEP_OFF));
  }

  // -> true once there
  _walk(b, job, dt) {
    const P = this.player.pos;
    const d0 = workDistance(job, P);
    const near = d0 < REACH[job.type];
    // a notch is cut, and a spot levelled, from wherever you stand, if you're near enough already
    if (job.type === 'notch' && near && !inside(P, grow(this.placed.rect, 0.3))) return this._arrive();
    if (job.type === 'grade' && near && d0 > SPADE.near) return this._arrive();
    const target = this.path[0];
    const d = Math.hypot(target.x - P.x, target.z - P.z);
    const last = this.path.length === 1;
    if (d < (last ? ARRIVE : WAYPOINT)) {
      if (last) return this._arrive();
      this.path.shift();
      this.best = Infinity;
      this.stalled = 0;
      return false;
    }
    if (d < this.best - 0.15) {
      this.best = d;
      this.stalled = 0;
    } else this.stalled += dt;
    if (this.stalled > STALL) {
      if (near) return this._arrive();
      if (++this.tries > TRIES) {
        this._stuck(b, "I can't find a way there: walk me closer");
        return false;
      }
      // step aside, one way then the other
      const side = this.tries % 2 ? 1 : -1;
      const l = d || 1;
      this.path.unshift({ x: P.x + ((-(target.z - P.z) / l) * side + ((target.x - P.x) / l) * 0.3) * SIDESTEP, z: P.z + (((target.x - P.x) / l) * side + ((target.z - P.z) / l) * 0.3) * SIDESTEP });
      this.best = Infinity;
      this.stalled = 0;
    }
    let ahead = d;
    for (let i = 1; i < this.path.length; i++) ahead += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
    this.player.steer = { x: target.x, z: target.z, run: ahead > RUN_FROM };
    return false;
  }

  _arrive() {
    this.there = true;
    this.player.steer = null;
    return true;
  }

  // ── Doing it ──────────────────────────────────────────────────────────────
  _do(b, at, job, chk, dt) {
    if (job.type === 'wait') {
      // a tree coming down: watch it land
      b.face(job.x, job.z);
      return false;
    }
    if (job.type === 'fell' || job.type === 'buck' || job.type === 'hew') {
      this._hold('axe');
      if (job.type === 'fell') swingAt(b, { type: 'tree', tree: job.tree });
      else if (job.type === 'hew') hew(b, axe);
      else {
        const fl = b.forest.felledNear(job.x, job.z, 1.6);
        if (fl && fl.f === job.f) swingAt(b, { type: 'felled', ...fl });
      }
      this.rest = BREATHER[job.type];
      return true;
    }
    if (job.type === 'grub') {
      this._hold('shovel');
      if (grubStump(b, job.stump, dt)) this.rest = BREATHER.grub;
      return true;
    }
    if (job.type === 'brush') {
      this._hold('shovel');
      b.face(job.x, job.z);
      b.swing('dig', 0.7, 0.5, () => clearBrush(b, job.x, job.z, BRUSH_REACH));
      this.rest = BREATHER.brush;
      return true;
    }
    if (job.type === 'stone') {
      this._hold(null);
      pickUp(b, job.rock);
      this.gathering.rock = null;
      this.rest = BREATHER.stone;
      return true;
    }
    if (job.type === 'borrow') {
      this._hold('shovel');
      const moved = spadeWork(b, job.x, job.z, 'dig', dt, job.floor, digObstacles(b, job.x, job.z).blocked);
      this.still = moved ? 0 : this.still + dt;
      if (this.still > STUCK || b.terrain.vertexHeight(job.x, job.z) <= job.floor + 0.01) {
        // as deep as it goes here: the next spot
        this.gathering.dug.add(`${job.x},${job.z}`);
        this.gathering.spot = null;
        this.rest = BREATHER.borrow;
      }
      return true;
    }
    if (job.type === 'grade') {
      this._hold('shovel');
      const h = b.terrain.vertexHeight(job.x, job.z);
      spadeWork(b, job.x, job.z, job.mode, dt, job.level, digObstacles(b, job.x, job.z).blocked);
      const now = b.terrain.vertexHeight(job.x, job.z);
      // stuck (a fill short of soil, a vertex at the most a spade can move it): leave it be
      this.still = Math.abs(now - h) > 1e-4 ? 0 : this.still + dt;
      if (this.still > STUCK) this.skip.add(`${job.x},${job.z}`);
      if (Math.abs(now - job.level) <= TOL || this.still > STUCK) this.rest = BREATHER.grade;
      return true;
    }
    if (job.type === 'footing') {
      this._hold('shovel');
      if (digFooting(b, chk.node, chk.c, dt)) this.rest = BREATHER.footing;
      return true;
    }
    if (job.type === 'notch') {
      this._hold('axe');
      const y = b.buildings.logBottom(at, job.L) + height(job.L.kind) / 2;
      cutNotch(b, { b: at, L: job.L, n: job.n, x: job.x, y, z: job.z });
      this.rest = BREATHER.notch;
      return true;
    }
    // a log or a roof: square up to it, then set it down
    this._hold(null);
    b.face(job.x, job.z);
    this.settle += dt;
    if (this.settle < SETTLE) return true;
    if (job.type === 'log') layLog(b, at, job.kind, job.axis, job.line, job.s0, job.s1);
    else raiseRoof(b, at, chk.c);
    this.rest = BREATHER[job.type];
    return true;
  }

  // What the hiker has in hand for the job. Left there on a pause (a swing
  // may still be finishing); picking up another tool puts it away anyway.
  _hold(name) {
    if (this.player.character.tool !== name) this.player.character.setTool(name);
  }

  _stuck(b, why) {
    this.pause(why, true);
    b.dropHold();
    return false;
  }

  _release() {
    this.player.steer = null;
    this._reset();
  }

  _reset() {
    this.key = null;
    this.spot = null;
    this.path = null;
    this.there = false;
    this.best = Infinity;
    this.stalled = 0;
    this.tries = 0;
    this.settle = 0;
    this.rest = 0;
    this.still = 0;
    this.lastAt = null;
  }
}

// Can the job be done, here and now? -> { reason, ...what doing it needs }
function check(b, at, job) {
  if (job.type === 'notch' || !CHECKED.has(job.type)) return { reason: null };
  if (job.type === 'grade') {
    if (job.mode === 'fill' && !b.have('soil', 0.02)) return { short: true, reason: `out of soil to level with (about ${tenths(job.fill)} m³ more): dig some with the shovel` };
    return { reason: null };
  }
  if (job.type === 'footing') return footingCheck(b, job.x, job.z);
  if (job.type === 'notch') return { reason: null };
  if (job.type === 'log') {
    const chk = logCheck(b, at, job.kind, job.axis, job.line, job.s0, job.s1);
    if (!chk.reason && chk.c.k !== job.k) return { reason: 'something not in the plan is built where its next log goes' };
    return chk;
  }
  const chk = roofCheck(b, at, job.x, job.z);
  const r = chk.c.roof;
  if (!chk.reason && (r.x0 !== job.x0 || r.z0 !== job.z0 || r.x1 !== job.x1 || r.z1 !== job.z1)) return { reason: 'the room under this roof is not the one in the plan' };
  return chk;
}

// The jobs a plan is made of, which the tools' own checks look at first;
// clearing and gathering are checked as they're chosen.
const CHECKED = new Set(['grade', 'footing', 'notch', 'log', 'roof']);

// Working a felled trunk f: near its foot, from beside it. P: where you are.
function buckJob(F, f, P) {
  const d = F.axisOf(f);
  const l = Math.hypot(d.x, d.z) || 1;
  const { work, stand } = trunkSpot(f.x, f.z, d.x / l, d.z / l, F.reach(f), P);
  return { type: 'buck', f, x: work.x, z: work.z, stand };
}

// Where a felled trunk's top end is, on the ground.
function trunkTop(F, f) {
  const d = F.axisOf(f);
  const len = F.reach(f);
  return { x: f.x + d.x * len, z: f.z + d.z * len };
}

// What a job that's short is short of.
function lacking(job) {
  if (job.type === 'footing') return 'stone';
  if (job.type === 'log') return job.kind;
  if (job.type === 'roof') return 'timber';
  return 'soil';
}

// Is the stone that was at { x, z } still there? -> it (as forEachPlant gives it), or null
function rockAt(b, at) {
  let rock = null;
  b.chunks.forEachPlant(at.x, at.z, 0.05, ['rock'], (ch, kind, k, x, y, z, s) => (rock = { ch, kind, k, x, y, z, s }));
  return rock;
}

// A point `off` metres from `p` toward `from`.
function toward(p, from, off) {
  const dx = from.x - p.x;
  const dz = from.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: p.x + (dx / d) * off, z: p.z + (dz / d) * off };
}

function jobKey(j) {
  if (j.type === 'fell') return `t:${j.x}:${j.z}`;
  if (j.type === 'buck' || j.type === 'wait') return `${j.type}:${j.f.id}`;
  if (j.type === 'stone') return `s:${j.x}:${j.z}`;
  if (j.type === 'borrow') return `p:${j.x}:${j.z}`;
  if (j.type === 'hew') return 'h';
  if (j.type === 'grub') return `u:${j.stump.id}`;
  if (j.type === 'brush') return `c:${j.x}:${j.z}`;
  if (j.type === 'grade') return `g:${j.x}:${j.z}`;
  if (j.type === 'notch') return `n:${j.L.axis}:${j.L.line}:${j.L.s0}:${j.L.k}:${j.n}`;
  if (j.type === 'log') return `l:${j.axis}:${j.line}:${j.s0}:${j.s1}:${j.k}`;
  if (j.type === 'roof') return `r:${j.x0}:${j.z0}:${j.x1}:${j.z1}`;
  return `f:${j.x}:${j.z}`;
}

// gen: the world, which knows what a tree is called where it stands
function describe(j, gen) {
  if (j.type === 'fell') return `felling ${treeName(j.tree.kind, gen.countryAt(j.tree.x, j.tree.z)).a}`;
  if (j.type === 'wait') return 'timber!';
  if (j.type === 'buck') return j.f.state === 'limbed' ? 'bucking it into logs' : 'limbing it';
  if (j.type === 'hew') return 'hewing a log square';
  if (j.type === 'stone') return 'picking up a stone';
  if (j.type === 'borrow') return 'digging';
  if (j.type === 'grub') return 'grubbing out a stump';
  if (j.type === 'brush') return 'clearing brush';
  if (j.type === 'grade') return `levelling the site: ${j.mode === 'dig' ? 'cutting' : 'filling'}`;
  if (j.type === 'footing') return 'setting a footing';
  if (j.type === 'notch') return 'cutting a notch';
  if (j.type === 'log') return `laying a ${j.s1 - j.s0} m ${j.kind === 'log' ? 'log' : 'timber'}, course ${Math.floor(j.k / 2) + 1}`;
  return 'raising the roof';
}

// How far p is from where the work is: a log's nearest point, or the spot.
function workDistance(j, p) {
  if (j.type === 'fell') return Math.hypot(j.x - p.x, j.z - p.z) - j.r;
  if (j.type !== 'log') return Math.hypot(j.x - p.x, j.z - p.z);
  const along = j.axis === 'x' ? p.x : p.z;
  const across = j.axis === 'x' ? p.z : p.x;
  const s = Math.max(j.s0, Math.min(j.s1, along));
  return Math.hypot(along - s, across - j.line);
}
