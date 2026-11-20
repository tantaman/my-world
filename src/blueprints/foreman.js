// The foreman: puts up a staked-out blueprint for you, a piece at a time,
// walking the hiker from one job to the next and doing each one with the
// same tools and the same rules as building by hand. So it is no quicker
// than you and can't do anything you couldn't.
//
// It keeps the site (which plan is staked out where). While it's working,
// each frame it:
//   1. asks the plan what's next (plan.js nextJob): a notch to cut, a
//      footing, the nearest log of the lowest course, a roof. Before the
//      footings, if they can't all reach one level or the ground stands
//      above the sills, it levels the site first (grade.js);
//   2. checks it can be done, here and now, with the tools' own checks
//      (footingCheck, logCheck, roofCheck), and if not, stops and says why:
//      too steep to level, a tree is in the way, you're out of logs;
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
import { cutNotch } from '../build/tools/axe.js';
import { roofCheck, raiseRoof } from '../build/tools/roof.js';
import { spadeWork, digObstacles } from '../build/tools/shovel.js';
import { normalize, place, findBuilding, survey, nextJob, progress, standAt, route, grow, inside } from './plan.js';
import { levelling, nextSpot, siteGround, TOL } from './grade.js';

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
const REACH = { grade: 2.6, footing: 2.2, log: 4.5, notch: 2.6, roof: 6 };
const SPADE = { near: 0.5, off: 1.5 }; // m: no nearer than this to the spot you're levelling; stand this far off it
const STUCK = 1; // s of spade work without a spot moving before leaving it be
const SETTLE = 0.35; // s squaring up to a log or a roof before setting it down
const BREATHER = { grade: 0.05, footing: 0.4, log: 0.6, notch: 0.15, roof: 0.9 }; // s after each piece

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
    if (job.type === 'footing') {
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
    const key = jobKey(job);
    if (key !== this.key) this._begin(job, key);
    this.doing = describe(job);

    const chk = check(b, at, job);
    if (chk.reason) return this._stuck(b, chk.reason);
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
    if (v.mode === 'fill' && !b.have('soil', 0.02)) return { trouble: `out of soil to level with (about ${tenths(lv.fill)} m³ more): dig some with the shovel` };
    this.levelling = true;
    if (site.level === null) {
      site.level = lv.level;
      this.emit('change');
    }
    return { type: 'grade', x: v.ix, z: v.iz, mode: v.mode, level: lv.level };
  }

  // ── Getting there ─────────────────────────────────────────────────────────
  _begin(job, key) {
    this._reset();
    this.key = key;
    const P = this.player.pos;
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
  }
}

// Can the job be done, here and now? -> { reason, ...what doing it needs }
function check(b, at, job) {
  if (job.type === 'grade') return { reason: null };
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

function jobKey(j) {
  if (j.type === 'grade') return `g:${j.x}:${j.z}`;
  if (j.type === 'notch') return `n:${j.L.axis}:${j.L.line}:${j.L.s0}:${j.L.k}:${j.n}`;
  if (j.type === 'log') return `l:${j.axis}:${j.line}:${j.s0}:${j.s1}:${j.k}`;
  if (j.type === 'roof') return `r:${j.x0}:${j.z0}:${j.x1}:${j.z1}`;
  return `f:${j.x}:${j.z}`;
}

function describe(j) {
  if (j.type === 'grade') return `levelling the site: ${j.mode === 'dig' ? 'cutting' : 'filling'}`;
  if (j.type === 'footing') return 'setting a footing';
  if (j.type === 'notch') return 'cutting a notch';
  if (j.type === 'log') return `laying a ${j.s1 - j.s0} m ${j.kind === 'log' ? 'log' : 'timber'}, course ${Math.floor(j.k / 2) + 1}`;
  return 'raising the roof';
}

// How far p is from where the work is: a log's nearest point, or the spot.
function workDistance(j, p) {
  if (j.type !== 'log') return Math.hypot(j.x - p.x, j.z - p.z);
  const along = j.axis === 'x' ? p.x : p.z;
  const across = j.axis === 'x' ? p.z : p.x;
  const s = Math.max(j.s0, Math.min(j.s1, along));
  return Math.hypot(along - s, across - j.line);
}
