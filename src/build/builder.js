// The building game: tools in your hands, what you're aiming at, and what
// happens when you swing, dig or lay a log.
//
//   1 hands    pick up stones
//   2 axe      fell trees, limb and buck them into logs, cut notches,
//              right-click: hew a round log into a squared timber
//   3 shovel   dig (left) and fill (right); G sets a grade stake and the
//              shovel then cuts and fills to that level; grub out stumps
//   4 footing  dig a footing and set a stone pier on a grid node
//   5 log      lay round-log walls between two grid nodes
//   6 timber   the same with hewn timbers
//   7 roof     raise a gable roof over a finished rectangular room
//
// Everything you change is saved in localStorage per world seed.

import * as THREE from 'three';
import { Solids } from './solids.js';
import { TerrainEdits } from './terrainEdits.js';
import { Forestry, SPECIES, TREE_KINDS, BUCK_LEN } from './forestry.js';
import { Buildings } from './buildings.js';
import { Mesher, addRoof, makeStake } from './geometry.js';
import { DIG, HALF, LOG_D, TIMBER_W, PIER, ROOF, height } from './constants.js';
import { createVegetationMaterial } from '../world/materials.js';

export const TOOLS = [
  { id: 'hands', label: 'hands', short: 'hand' },
  { id: 'axe', label: 'axe', short: 'axe' },
  { id: 'shovel', label: 'shovel', short: 'dig' },
  { id: 'footing', label: 'footing', short: 'pier' },
  { id: 'log', label: 'log wall', short: 'log' },
  { id: 'timber', label: 'timber', short: 'hewn' },
  { id: 'roof', label: 'roof', short: 'roof' },
];

const REACH = { hands: 3, axe: 2.2, shovel: 5, build: 10 };
const STORE_KEY = (seed) => `my-world:build:${seed}`;
const SWING = { chop: 0.62, low: 0.66, hew: 0.8 };
const PICK_STONES = (s) => (s < 0.45 ? 1 : s < 0.65 ? 2 : 3);
const LIFTABLE = 0.8; // rocks bigger than this stay put

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ndc = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();

export class Builder {
  constructor({ scene, camera, gen, chunks, grass, player, input, hud, sound }) {
    this.scene = scene;
    this.camera = camera;
    this.gen = gen;
    this.chunks = chunks;
    this.grass = grass;
    this.player = player;
    this.input = input;
    this.hud = hud;
    this.sound = sound;
    this.creative = new URLSearchParams(location.search).has('creative');

    const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.materials = { wood, still: createVegetationMaterial({ sway: false }) };
    this.solids = new Solids();
    this.terrain = new TerrainEdits(gen, chunks);
    this.forest = new Forestry({ scene, chunks, models: chunks.models, solids: this.solids, materials: this.materials });
    this.buildings = new Buildings({ scene, solids: this.solids, material: wood });

    player.solids = this.solids;
    player.cameraBlock = (o, d, max) => {
      const hit = this.buildings.raycast(o, d, max);
      return hit ? hit.t : Infinity;
    };
    this.forest.onCrash = (f, w) => {
      this.sound.sfx('crash', { strength: Math.min(1, 0.4 + w * 0.3) });
      const d = this.forest.axisOf(f);
      const L = SPECIES[f.kind].h * f.s * 0.6;
      const at = new THREE.Vector3(f.x + d.x * L, 0, f.z + d.z * L);
      at.y = this.chunks.heightAt(at.x, at.z) + 0.6;
      this.particles.burst(at, 40, 0x3a5a22, 4, 1.8);
      this.particles.burst(at, 16, 0x6b5a40, 3, 1.2);
    };

    this.inv = { log: 0, timber: 0, stone: 0, soil: 0 };
    this.tool = 'hands';
    this.datum = null; // { x, y, z } grade stake
    this.pending = null; // first node of a wall being laid { x, z, kind }
    this.act = null; // a swing in progress
    this.hold = null; // a press-and-hold in progress
    this.digSound = 0;
    this.grassDirty = null;
    this.grassTimer = 0;
    this.saveAt = 0;
    this.tgt = null;

    this._makePreviews();
    this.particles = new Particles(scene, chunks);
    this.load();
    this.hud.buildTools(TOOLS, (i) => this.select(TOOLS[i].id));
    this.hud.onStake = () => this._toggleStake();
    this.select(this.tool, true);
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
  }

  // ── Tools ─────────────────────────────────────────────────────────────────
  select(id, quiet = false) {
    if (this.tool !== id) this.pending = null;
    this.tool = id;
    this.player.character.setTool(id === 'axe' ? 'axe' : id === 'shovel' ? 'shovel' : null);
    this.hud.selectTool(TOOLS.findIndex((t) => t.id === id));
    this.hud.showStake(id === 'shovel' || id === 'footing');
    if (!quiet) this.hud.flash(TOOLS.find((t) => t.id === id).label);
  }

  have(kind, n) {
    return this.creative || this.inv[kind] >= n - 1e-6;
  }

  spend(kind, n) {
    if (!this.creative) this.inv[kind] = Math.max(0, this.inv[kind] - n);
    this.invDirty = true;
  }

  gain(kind, n) {
    this.inv[kind] += n;
    this.invDirty = true;
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  update(dt) {
    const input = this.input;
    for (let i = 0; i < TOOLS.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`) || input.wasPressed(`Numpad${i + 1}`)) this.select(TOOLS[i].id);
    }
    if (input.wasPressed('Escape')) this.pending = null;

    this._aim();
    if (input.wasPressed('KeyG')) this._toggleStake();
    this.tgt = this._target();

    this._work(dt);

    this.forest.update(dt);
    this.particles.update(dt);
    this._updatePreviews(dt);
    this._updateHud();

    // regrow grass where the ground changed, a few times a second at most
    this.grassTimer -= dt;
    if (this.grassDirty && this.grassTimer <= 0) {
      const r = this.grassDirty;
      this.grass.invalidate(r[0], r[1], r[2], r[3]);
      this.grassDirty = null;
      this.grassTimer = 0.35;
    }

    if (this.terrain.dirty || this.forest.dirty || this.buildings.dirty || this.invDirty) {
      this.terrain.dirty = this.forest.dirty = this.buildings.dirty = this.invDirty = false;
      if (!this.saveAt) this.saveAt = performance.now() + 1500;
    }
    if (this.saveAt && performance.now() > this.saveAt) this.save();
  }

  // Where the crosshair points: ground and/or a built piece.
  _aim() {
    _ray.setFromCamera(_ndc, this.camera);
    _o.copy(_ray.ray.origin);
    _d.copy(_ray.ray.direction);
    this.aimO = _o.clone();
    this.aimD = _d.clone();
    this.ground = groundRay(this.chunks, _o, _d, 45);
    const hit = this.buildings.raycast(_o, _d, this.ground ? this.ground.t : 45, this.tool !== 'roof');
    this.piece = hit;
    this.aimPoint = hit ? _o.clone().addScaledVector(_d, hit.t) : this.ground ? this.ground.p.clone() : null;
  }

  _dist(x, z) {
    return Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
  }

  // ── What the tool in hand would do right now ─────────────────────────────
  // Returns { prompt, ok, ...data }.
  _target() {
    switch (this.tool) {
      case 'hands':
        return this._tHands();
      case 'axe':
        return this._tAxe();
      case 'shovel':
        return this._tShovel();
      case 'footing':
        return this._tFooting();
      case 'log':
      case 'timber':
        return this._tLog(this.tool);
      case 'roof':
        return this._tRoof();
      default:
        return null;
    }
  }

  _tHands() {
    const g = this.ground;
    if (!g) return null;
    let rock = null;
    this.chunks.forEachPlant(g.p.x, g.p.z, 1.3, ['rock'], (ch, kind, k, x, y, z, s) => {
      const d = Math.hypot(x - g.p.x, z - g.p.z) - s * 0.6;
      if (!rock || d < rock.d) rock = { ch, kind, k, x, y, z, s, d };
    });
    if (!rock || rock.d > 0.8) return { prompt: '' };
    if (this._dist(rock.x, rock.z) > REACH.hands + rock.s) return { prompt: 'a stone: <i>come closer</i>' };
    if (rock.s > LIFTABLE) return { prompt: 'a boulder: <i>far too heavy to lift</i>', bad: true };
    const n = PICK_STONES(rock.s);
    return { type: 'rock', ok: true, rock, x: rock.x, z: rock.z, prompt: `<b>click</b> pick up ${n === 1 ? 'a stone' : `${n} stones`}` };
  }

  _treeOnRay() {
    // nearest standing trunk hit by the aim ray, else the nearest tree in front of you
    let best = null;
    const P = this.player.pos;
    this.chunks.forEachPlant(P.x, P.z, 7, TREE_KINDS, (ch, kind, k, x, y, z, s) => {
      const r = SPECIES[kind].r * s + 0.2;
      const t = rayCircle(this.aimO, this.aimD, x, z, r);
      if (t === null) return;
      const hy = this.aimO.y + this.aimD.y * t;
      if (hy < y - 0.5 || hy > y + 5) return;
      if (!best || t < best.t) best = { t, tree: { ch, kind, k, x, y, z, s } };
    });
    if (best) {
      best.tree.key = `${best.tree.kind}@${Math.round(best.tree.x * 100)},${Math.round(best.tree.z * 100)}`;
      return best.tree;
    }
    const near = this.forest.treeNear(P.x, P.z, 1.8);
    if (near) {
      const fx = Math.sin(this.player.yaw);
      const fz = Math.cos(this.player.yaw);
      const dx = near.x - P.x;
      const dz = near.z - P.z;
      if ((dx * fx + dz * fz) / Math.hypot(dx, dz) > 0.5) return near;
    }
    return null;
  }

  _tAxe() {
    const P = this.player.pos;
    const hew = this.have('log', 0.5) ? ' · <b>right-click</b> hew a timber' : '';
    // a notch to cut?
    const ref = this.aimPoint;
    if (ref) {
      const nn = this.buildings.notchNear(ref, 1.3);
      if (nn && this._dist(nn.x, nn.z) < 3.4) {
        if (!nn.ready) return { prompt: 'notch the log underneath first', bad: true };
        return { type: 'notch', ok: true, ...nn, prompt: `<b>click</b> cut the notch${hew}` };
      }
    }
    // a standing tree?
    const tree = this._treeOnRay();
    if (tree) {
      const sp = SPECIES[tree.kind];
      const reach = this._dist(tree.x, tree.z) - sp.r * tree.s;
      const n = this.forest.hitsOn(tree);
      const need = this.forest.hitsNeeded(tree);
      if (reach > REACH.axe) return { prompt: `${sp.a}: <i>come closer</i>${hew}` };
      return { type: 'tree', ok: true, tree, x: tree.x, z: tree.z, prompt: `<b>click</b> chop the ${sp.name} ${n ? `(${n}/${need})` : `· about ${sp.meters(tree.s)} m of log`}${hew}` };
    }
    // a felled tree?
    const at = this.ground ? this.ground.p : null;
    if (at) {
      const fl = this.forest.felledNear(at.x, at.z, 1.4);
      if (fl && this._dist(fl.x, fl.z) < 2.6) {
        const f = fl.f;
        const what = f.state === 'down' ? 'limb the tree' : `buck off ${Math.min(BUCK_LEN, f.left)} m of log (${f.left} m left)`;
        return { type: 'felled', ok: true, ...fl, prompt: `<b>click</b> ${what}${hew}` };
      }
    }
    // nothing? maybe a stump
    if (at && this.forest.stumpNear(at.x, at.z, 0.6)) return { prompt: `a stump: <i>grub it out with the shovel</i>${hew}` };
    if (hew) return { type: 'none', prompt: `<b>right-click</b> hew a log into a timber` };
    return { prompt: 'find a tree to fell' };
  }

  _blockedFn() {
    // vertices the shovel can't move: roots of standing trees, stumps,
    // boulders and footings.
    const trees = [];
    const g = this.ground.p;
    this.chunks.forEachPlant(g.x, g.z, DIG.radius + 2, TREE_KINDS, (ch, kind, k, x, y, z, s) => trees.push([x, z, SPECIES[kind].r * s + 0.9]));
    this.chunks.forEachPlant(g.x, g.z, DIG.radius + 3, ['rock'], (ch, kind, k, x, y, z, s) => s > LIFTABLE && trees.push([x, z, s * 1.05]));
    for (const s of this.forest.stumps.values()) if (Math.hypot(s.x - g.x, s.z - g.z) < 4) trees.push([s.x, s.z, s.r + 0.7]);
    for (const b of this.buildings.list) {
      for (const f of b.footings.values()) if (Math.hypot(f.x - g.x, f.z - g.z) < 4) trees.push([f.x, f.z, 0.62]);
    }
    return { list: trees, fn: (ix, iz) => trees.some(([x, z, r]) => (ix - x) ** 2 + (iz - z) ** 2 < r * r) };
  }

  _tShovel() {
    const g = this.ground;
    if (!g) return null;
    if (this._dist(g.p.x, g.p.z) > REACH.shovel) return { prompt: 'too far to dig', far: true };
    const stump = this.forest.stumpNear(g.p.x, g.p.z, 0.7);
    if (stump) return { type: 'stump', ok: true, stump, x: stump.x, z: stump.z, prompt: '<b>hold click</b> grub out the stump' };
    const blocked = this._blockedFn();
    const roots = blocked.list.some(([x, z, r]) => Math.hypot(x - g.p.x, z - g.p.z) < r);
    let txt;
    if (this.datum) {
      const dh = g.p.y - this.datum.y;
      const rel = Math.abs(dh) < 0.03 ? 'on grade' : `${dh > 0 ? '+' : '−'}${Math.round(Math.abs(dh) * 100)} cm`;
      txt = `<b>hold click</b> cut · <b>right</b> fill to grade <i>(${rel})</i> · <b>G</b> move stake`;
    } else txt = '<b>hold click</b> dig · <b>right</b> fill · <b>G</b> set a grade stake';
    if (roots) txt += ' · <i>roots or stone in the way</i>';
    return { type: 'ground', ok: true, x: g.p.x, z: g.p.z, blocked, prompt: txt };
  }

  _tFooting() {
    const g = this.ground;
    if (!g) return null;
    const x = Math.round(g.p.x);
    const z = Math.round(g.p.z);
    if (this._dist(x, z) > REACH.build) return { prompt: 'too far away', far: true, node: { x, z } };
    // remove?
    if (this.piece && this.piece.type === 'footing') {
      const f = this.piece.piece;
      const why = this.buildings.canRemoveFooting(this.piece.b, f);
      return { type: 'footing', node: { x, z }, existing: f, b: this.piece.b, why, prompt: why ? `can't lift this footing: ${why}` : '<b>right-click</b> lift this footing (+2 stones)' };
    }
    const ground = this.chunks.heightAt(x, z);
    const c = this.buildings.footingCandidate(x, z, ground);
    const node = { x, z, ground, y0: c.y0 ?? (c.b ? c.b.y0 : ground + PIER.first) };
    let bad = c.ok ? null : c.reason;
    if (!bad && this.forest.stumpNear(x, z, 0.5)) bad = 'a stump is in the way';
    if (!bad && this.forest.treeNear(x, z, 0.9)) bad = 'a tree is in the way';
    if (!bad && !this.have('stone', 2)) bad = 'you need 2 stones (hands: pick some up)';
    if (bad) return { type: 'footing', node, bad: true, prompt: bad };
    const note = c.b ? `pier ${Math.round(c.pier * 100)} cm` : 'starts a new building at this level';
    return { type: 'footing', ok: true, node, c, prompt: `<b>hold click</b> dig a footing and set the stones <i>(${note})</i>` };
  }

  _tLog(kind) {
    const p = this.aimPoint;
    if (!p) return null;
    const x = Math.round(p.x);
    const z = Math.round(p.z);
    const node = { x, z };
    const removable = this.piece && this.piece.type === 'log' && this.piece.piece.kind === kind ? this.piece : null;
    if (!this.pending) {
      if (this._dist(x, z) > REACH.build) return { prompt: 'too far away', far: true };
      const b = this.buildings.buildingFor(x, z);
      if (!b) return { node, prompt: 'lay footings first (4), then run walls between them', bad: true };
      let txt = `<b>click</b> start a wall here`;
      if (removable && !this.buildings.canRemoveLog(removable.b, removable.piece)) txt += ' · <b>right-click</b> take this one down';
      return { type: 'start', ok: true, node, b, removable, prompt: txt };
    }
    const A = this.pending;
    const dx = x - A.x;
    const dz = z - A.z;
    const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
    const line = axis === 'x' ? A.z : A.x;
    const s0 = axis === 'x' ? Math.min(A.x, x) : Math.min(A.z, z);
    const s1 = axis === 'x' ? Math.max(A.x, x) : Math.max(A.z, z);
    const b = this.buildings.buildingFor((A.x + x) / 2, (A.z + z) / 2) || this.buildings.buildingFor(A.x, A.z);
    if (!b) return { node, prompt: 'lay footings first', bad: true };
    const c = this.buildings.logCandidate(b, axis, line, s0, s1);
    const len = s1 - s0;
    const name = kind === 'log' ? 'log' : 'timber';
    const ghost = { b, axis, line, s0, s1, k: c.k, kind };
    if (!c.ok) return { node, ghost: c.k !== undefined && len >= 1 ? ghost : null, bad: true, prompt: `${c.reason} · <b>right-click</b> cancel` };
    const blocker = this._inTheWay(axis, line, s0, s1, c.k);
    if (blocker) return { node, ghost, bad: true, prompt: `${blocker} is in the way · <b>right-click</b> cancel` };
    if (!this.have(kind, len)) return { node, ghost, bad: true, prompt: `you need ${len} m of ${name} (have ${fmt(this.inv[kind])})` };
    const course = Math.floor(c.k / 2) + 1;
    return {
      type: 'lay',
      ok: true,
      node,
      b,
      ghost,
      len,
      prompt: `<b>click</b> lay a ${len} m ${name} <i>(course ${course})</i> · <b>right-click</b> done`,
    };
  }

  // A standing tree (or, for the lowest courses, a stump) on a wall line.
  _inTheWay(axis, line, s0, s1, k) {
    const pt = (n) => (axis === 'x' ? [n, line] : [line, n]);
    const [ax, az] = pt(s0 - 0.3);
    const [bx, bz] = pt(s1 + 0.3);
    const near = (x, z, r) => {
      const t = axis === 'x' ? x : z;
      const o = axis === 'x' ? z : x;
      return t > s0 - 0.3 - r && t < s1 + 0.3 + r && Math.abs(o - line) < r + 0.2;
    };
    let what = null;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const R = (s1 - s0) / 2 + 2;
    this.chunks.forEachPlant(mx, mz, R, TREE_KINDS, (ch, kind, i, x, y, z, s) => {
      if (!what && near(x, z, SPECIES[kind].r * s)) what = SPECIES[kind].a;
    });
    if (!what && k <= 2) {
      for (const st of this.forest.stumps.values()) if (near(st.x, st.z, st.r)) what = 'a stump';
    }
    return what;
  }

  _tRoof() {
    const p = this.aimPoint;
    if (!p) return null;
    if (this.piece && this.piece.type === 'roof') {
      return { type: 'roof', existing: this.piece.piece, b: this.piece.b, prompt: '<b>right-click</b> take the roof down' };
    }
    const q = p.clone().addScaledVector(this.aimD, 0.35);
    const b = this.buildings.buildingFor(q.x, q.z);
    if (!b) return { prompt: 'aim inside a room of a building', bad: true };
    let c = this.buildings.roofCandidate(b, q.x, q.z);
    if (!c.room) c = this.buildings.roofCandidate(b, p.x, p.z);
    if (!c.ok) return { prompt: c.reason, bad: true, room: c.room };
    if (!this.have('timber', c.cost)) return { prompt: `a roof here takes ${c.cost} m of hewn timber (have ${fmt(this.inv.timber)})`, bad: true, room: c.room, ghostRoof: c.roof };
    const r = c.room;
    return { type: 'roof', ok: true, b, c, ghostRoof: c.roof, prompt: `<b>click</b> raise the roof over this ${r.x1 - r.x0} × ${r.z1 - r.z0} m room <i>(${c.cost} m timber)</i>` };
  }

  // ── Doing the work ────────────────────────────────────────────────────────
  _work(dt) {
    const input = this.input;
    const t = this.tgt;
    const ch = this.player.character;
    let busy = false;

    // a swing already under way runs to completion
    if (this.act) {
      const a = this.act;
      a.t += dt;
      if (!a.hit && a.t >= a.hitAt) {
        a.hit = true;
        a.onHit();
      }
      if (a.t >= a.dur) this.act = null;
      busy = true;
    }

    const use = input.holding('use');
    const alt = input.holding('alt');
    const useTap = input.tapped('use');
    const altTap = input.tapped('alt');

    if (!this.act) {
      switch (this.tool) {
        case 'hands':
          if (useTap && t && t.type === 'rock') this._pickRock(t.rock);
          break;
        case 'axe':
          if (use && t && t.ok) this._swingAxe(t);
          else if (alt && this.have('log', 0.5)) this._hew();
          else if ((useTap && (!t || !t.ok)) || (altTap && !this.have('log', 0.5))) this._deny(t);
          break;
        case 'shovel':
          busy = this._shovel(dt, use, alt, t) || busy;
          break;
        case 'footing':
          busy = this._footing(dt, use, altTap, t) || busy;
          break;
        case 'log':
        case 'timber':
          if (useTap) this._layClick(t);
          if (altTap) {
            if (this.pending) this.pending = null;
            else if (t && t.removable) this._removeLog(t.removable);
          }
          break;
        case 'roof':
          if (useTap && t && t.ok) this._raiseRoof(t);
          else if (useTap) this._deny(t);
          if (altTap && t && t.existing) {
            this.buildings.removeRoof(t.b, t.existing);
            if (!this.creative) this.gain('timber', Math.ceil(((t.existing.x1 - t.existing.x0) * (t.existing.z1 - t.existing.z0)) * ROOF.cost));
            this.sound.sfx('thud', { size: 1 });
          }
          break;
      }
    }

    busy = busy || !!this.act || !!this.hold;
    this.player.busy += ((busy ? 1 : 0) - this.player.busy) * (1 - Math.exp(-dt * 12));
    if (!busy) {
      this.player.faceTo = null;
      if (ch.action && ch.action.loop) ch.stop();
    }
  }

  _deny(t) {
    if (t && t.prompt) this.hud.nudgePrompt();
    this.sound.sfx('deny');
  }

  _face(x, z) {
    this.player.faceTo = { x, z };
  }

  _swing(anim, dur, hitAt, onHit) {
    this.act = { t: 0, dur, hitAt: dur * hitAt, hit: false, onHit };
    this.player.character.play(anim, dur);
  }

  _swingAxe(t) {
    if (t.type === 'tree') {
      const tree = t.tree;
      this._face(tree.x, tree.z);
      this._swing('chop', SWING.chop, 0.6, () => {
        const sp = SPECIES[tree.kind];
        const P = this.player.pos;
        const dx = P.x - tree.x;
        const dz = P.z - tree.z;
        const l = Math.hypot(dx, dz) || 1;
        const at = new THREE.Vector3(tree.x + (dx / l) * sp.r * tree.s, P.y + 1.1, tree.z + (dz / l) * sp.r * tree.s);
        this.sound.sfx('chop', { size: Math.min(1, sp.r * tree.s * 2) });
        this.particles.burst(at, 7, 0xd8b27a, 2.2, 0.4, dx / l, dz / l);
        if (this.forest.chop(tree, P.x, P.z)) {
          this.sound.sfx('creak');
          this.hud.flash(`timber! the ${sp.name} is coming down`);
          this.grassDirty = growRect(this.grassDirty, tree.x, tree.z, 1);
        }
      });
    } else if (t.type === 'felled') {
      this._face(t.x, t.z);
      this._swing('chopLow', SWING.low, 0.6, () => {
        this.sound.sfx('chop', { size: 0.4 });
        const at = new THREE.Vector3(t.x, t.y + 0.3, t.z);
        const r = this.forest.buck(t.f);
        this.particles.burst(at, 6, r.limbed ? 0x3a5a22 : 0xd8b27a, 2, 0.4);
        if (r.limbed) this.hud.flash('limbed: now buck it into logs');
        if (r.meters) {
          this.gain('log', r.meters);
          this.sound.sfx('thud', { size: 0.6 });
          this.hud.flash(`+${r.meters} m of log`);
        }
      });
    } else if (t.type === 'notch') {
      const P = this.player.pos;
      this._face(t.x, t.z);
      this._swing(t.y - P.y > 1.15 ? 'chop' : 'chopLow', SWING.chop, 0.6, () => {
        this.sound.sfx('notch');
        this.particles.burst(new THREE.Vector3(t.x, t.y, t.z), 6, 0xd8b27a, 2, 0.3);
        const seated = this.buildings.notch(t.b, t.L, t.n);
        if (seated) {
          this.sound.sfx('thud', { size: 0.8 });
          const left = t.b.logs.filter((L) => !L.seated).length;
          this.hud.flash(left ? `notched in · ${left} more to notch` : 'notched in');
        }
      });
    }
  }

  _hew() {
    // a log lying at your feet while you square it up
    const P = this.player.pos;
    const fx = Math.sin(this.player.yaw);
    const fz = Math.cos(this.player.yaw);
    const at = new THREE.Vector3(P.x + fx * 0.95, 0, P.z + fz * 0.95);
    at.y = this.chunks.heightAt(at.x, at.z) + 0.17;
    this.workLog.position.copy(at);
    this.workLog.rotation.y = this.player.yaw + Math.PI / 2;
    this.workLog.visible = true;
    this.workLogTimer = 1.2;
    this._swing('chopLow', SWING.hew, 0.62, () => {
      this.sound.sfx('hew');
      this.particles.burst(at.clone().setY(at.y + 0.15), 7, 0xe0c08a, 2, 0.4);
      this.spend('log', 0.5);
      this.gain('timber', 0.5);
      if (!this.have('log', 0.5) && !this.creative) this.hud.flash('out of logs to hew');
    });
  }

  _pickRock(rock) {
    this._face(rock.x, rock.z);
    this._swing('bend', 0.7, 0.55, () => {
      this.forest.removePlant(rock.ch, 'rock', rock.k);
      const n = PICK_STONES(rock.s);
      this.gain('stone', n);
      this.sound.sfx('stone');
      this.hud.flash(`+${n} stone${n > 1 ? 's' : ''}`);
    });
  }

  _shovel(dt, use, alt, t) {
    if (!t || !t.ok) {
      this.hold = null;
      return false;
    }
    const ch = this.player.character;
    if (t.type === 'stump') {
      if (!use) {
        this.hold = null;
        return false;
      }
      if (!this.hold || this.hold.key !== t.stump) this.hold = { key: t.stump, t: 0, dur: 2.4 };
      this.hold.t += dt;
      this._face(t.x, t.z);
      ch.play('dig', 0.85, true);
      this._digNoise(dt, 'grub', t.stump, 0x5a4330);
      if (this.hold.t >= this.hold.dur) {
        const s = t.stump;
        this.forest.removeStump(s);
        this.terrain.clear(s.x, s.z, s.r + 0.9, -0.12);
        this.grassDirty = growRect(this.grassDirty, s.x, s.z, 2);
        this.sound.sfx('thud', { size: 0.5 });
        this.hud.flash('stump grubbed out');
        this.hold = null;
      }
      return true;
    }
    this.hold = null;
    if (!use && !alt) return false;
    const mode = use ? 'dig' : 'fill';
    const g = this.ground.p;
    if (mode === 'fill' && !this.have('soil', 0.001)) {
      if (this.input.tapped('alt')) {
        this.hud.flash('no soil to fill with: dig some first');
        this.sound.sfx('deny');
      }
      return false;
    }
    // clear the undergrowth and pick up any small stones in the way
    this.chunks.forEachPlant(g.x, g.z, DIG.radius * 0.85, ['bush', 'fern', 'log', 'rock'], (c, kind, k, x, y, z, s) => {
      if (kind === 'rock') {
        if (s > LIFTABLE) return;
        this.gain('stone', PICK_STONES(s));
      }
      this.forest.removePlant(c, kind, k);
    });
    const r = this.terrain.stroke({
      x: g.x,
      z: g.z,
      mode,
      dt,
      datum: this.datum ? this.datum.y : null,
      soil: this.creative ? Infinity : this.inv.soil,
      blocked: t.blocked.fn,
    });
    if (r.soil > 0) this.gain('soil', r.soil);
    else if (r.soil < 0) this.spend('soil', -r.soil);
    this.grassDirty = growRect(this.grassDirty, g.x, g.z, DIG.radius + 1);
    this._face(g.x, g.z);
    ch.play('dig', 0.9, true);
    if (r.moved) this._digNoise(dt, mode, g, 0x4a3524);
    return true;
  }

  _digNoise(dt, kind, at, color) {
    this.digSound -= dt;
    if (this.digSound > 0) return;
    this.sound.sfx(kind);
    const p = new THREE.Vector3(at.x, this.chunks.heightAt(at.x, at.z) + 0.1, at.z);
    this.particles.burst(p, 6, color, 1.8, 0.5);
    this.digSound = 0.9;
  }

  _footing(dt, use, altTap, t) {
    if (altTap && t && t.existing) {
      if (t.why) this._deny(t);
      else {
        this.buildings.removeFooting(t.b, t.existing);
        if (!this.creative) this.gain('stone', 2);
        this.sound.sfx('stone');
      }
      return false;
    }
    if (!use || !t || !t.ok) {
      if (use && this.input.tapped('use')) this._deny(t);
      this.hold = null;
      return false;
    }
    const key = `${t.node.x},${t.node.z}`;
    if (!this.hold || this.hold.key !== key) this.hold = { key, t: 0, dur: 1.3 };
    this.hold.t += dt;
    this._face(t.node.x, t.node.z);
    this.player.character.play('dig', 0.85, true);
    this._digNoise(dt, 'dig', t.node, 0x4a3524);
    if (this.hold.t >= this.hold.dur) {
      this.hold = null;
      const { x, z, ground } = t.node;
      this.terrain.clear(x, z, 0.75);
      const fresh = !t.c.b;
      const b = this.buildings.addFooting(x, z, ground);
      if (b) {
        this.spend('stone', 2);
        this.sound.sfx('stone');
        this.grassDirty = growRect(this.grassDirty, x, z, 1.5);
        if (fresh) {
          if (!this.datum) this._setStake(x, ground, z);
          this.hud.flash('a new building: its other footings must match this level');
        }
      }
    }
    return true;
  }

  _layClick(t) {
    if (!t) return;
    if (!this.pending) {
      if (t.type === 'start') this.pending = { x: t.node.x, z: t.node.z };
      else this._deny(t);
      return;
    }
    if (t.type !== 'lay') {
      this._deny(t);
      return;
    }
    const g = t.ghost;
    const L = this.buildings.addLog(t.b, g.kind, g.axis, g.line, g.s0, g.s1);
    if (!L) return;
    this.spend(g.kind, t.len);
    const [mx, mz] = g.axis === 'x' ? [(g.s0 + g.s1) / 2, g.line] : [g.line, (g.s0 + g.s1) / 2];
    this._face(mx, mz);
    this.player.character.play('bend', 0.6);
    this.sound.sfx('thud', { size: Math.min(1, t.len / 6) });
    if (!L.seated) this.hud.flash(`it rides on ${L.below.length} crossing${L.below.length > 1 ? 's' : ''}: notch it in with the axe`);
  }

  _removeLog(hit) {
    const why = this.buildings.canRemoveLog(hit.b, hit.piece);
    if (why) {
      this.hud.flash(`can't: ${why}`);
      this.sound.sfx('deny');
      return;
    }
    const L = hit.piece;
    this.buildings.removeLog(hit.b, L);
    if (!this.creative) this.gain(L.kind, L.s1 - L.s0);
    this.sound.sfx('thud', { size: 0.4 });
  }

  _raiseRoof(t) {
    this.buildings.addRoof(t.b, t.c.roof);
    this.spend('timber', t.c.cost);
    this.player.character.play('bend', 0.6);
    this.sound.sfx('thud', { size: 1 });
    this.hud.flash('the roof is on');
  }

  // ── Grade stake ───────────────────────────────────────────────────────────
  _toggleStake() {
    const g = this.ground;
    if (this.datum && g && Math.hypot(g.p.x - this.datum.x, g.p.z - this.datum.z) < 1.2) {
      this.datum = null;
      this.stake.visible = false;
      this.hud.flash('grade stake pulled up');
      this.invDirty = true;
      return;
    }
    if (!g || this._dist(g.p.x, g.p.z) > REACH.build) {
      this.hud.flash('aim at the ground nearby to set a grade stake');
      return;
    }
    this._setStake(g.p.x, g.p.y, g.p.z);
    this.hud.flash('grade stake set: the shovel now cuts and fills to this level');
  }

  _setStake(x, y, z) {
    this.datum = { x, y, z };
    this.stake.position.set(x, y, z);
    this.stake.visible = true;
    this.invDirty = true;
  }

  // ── Previews ──────────────────────────────────────────────────────────────
  _makePreviews() {
    const ghost = (color) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
    this.ghostOk = ghost(0x9fe07a);
    this.ghostBad = ghost(0xe06a4a);
    this.ghostLog = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostOk);
    this.ghostFooting = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1, 0.46), this.ghostOk);
    this.ghostRoof = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostOk);
    this.ghostRoofKey = '';
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xf0c060, toneMapped: false });
    this.marker = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), markerMat);
    for (const o of [this.ghostLog, this.ghostFooting, this.ghostRoof, this.marker]) {
      o.visible = false;
      o.renderOrder = 10;
      this.scene.add(o);
    }

    // brush ring that hugs the ground
    const ringN = 40;
    const ring = new THREE.BufferGeometry();
    ring.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringN * 3), 3));
    this.ring = new THREE.LineLoop(ring, new THREE.LineBasicMaterial({ color: 0xf2e2b0, transparent: true, opacity: 0.85, toneMapped: false }));
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    this.scene.add(this.ring);

    // grid nodes around where you're aiming
    const R = 5;
    const dots = new THREE.BufferGeometry();
    dots.setAttribute('position', new THREE.BufferAttribute(new Float32Array((2 * R + 1) ** 2 * 3), 3));
    this.dots = new THREE.Points(dots, new THREE.PointsMaterial({ color: 0xe8dcb0, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.dotsR = R;
    this.scene.add(this.dots);

    // grade stake and the "water level" plane at grade
    this.stake = makeStake();
    this.stake.visible = false;
    this.scene.add(this.stake);
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uCenter: { value: new THREE.Vector2() } },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec2 uCenter;
          varying vec3 vW;
          void main() {
            vec2 g = abs(fract(vW.xz + 0.5) - 0.5);
            float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
            float d = length(vW.xz - uCenter);
            float fade = 1.0 - smoothstep(7.0, 12.5, d);
            vec3 col = mix(vec3(0.25, 0.55, 0.75), vec3(0.85, 0.95, 1.0), line);
            gl_FragColor = vec4(col * 0.9, (0.26 + line * 0.4) * fade);
          }`,
      }),
    );
    this.plane.visible = false;
    this.plane.renderOrder = 5;
    this.scene.add(this.plane);

    // a log at your feet while hewing
    const geo = new THREE.CylinderGeometry(0.17, 0.17, 2.2, 9, 3);
    geo.rotateZ(Math.PI / 2);
    this.workLog = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
    this.workLog.castShadow = true;
    this.workLog.visible = false;
    this.workLogTimer = 0;
    this.scene.add(this.workLog);
  }

  _updatePreviews(dt) {
    const t = this.tgt;
    const tool = this.tool;
    this.ghostLog.visible = false;
    this.ghostFooting.visible = false;
    this.ghostRoof.visible = false;
    this.marker.visible = false;
    this.ring.visible = false;
    this.dots.visible = false;

    const building = tool === 'footing' || tool === 'log' || tool === 'timber' || tool === 'roof';
    this.plane.visible = !!this.datum && (tool === 'shovel' || tool === 'footing');
    if (this.plane.visible) {
      this.plane.position.set(this.datum.x, this.datum.y, this.datum.z);
      this.plane.material.uniforms.uCenter.value.set(this.datum.x, this.datum.z);
    }

    if (this.workLogTimer > 0) {
      this.workLogTimer -= dt;
      if (this.workLogTimer <= 0) this.workLog.visible = false;
    }

    if (tool === 'shovel' && t && t.type === 'ground') {
      this._placeRing(t.x, t.z, DIG.radius);
    }
    if (building && t && t.node && tool !== 'roof') this._placeDots(t.node.x, t.node.z);

    if (tool === 'footing' && t && t.node && !t.existing && !t.far) {
      const { x, z } = t.node;
      const ground = t.node.ground ?? this.chunks.heightAt(x, z);
      const top = t.node.y0 ?? ground + PIER.first;
      const h = Math.max(0.05, top - ground + 0.1);
      this.ghostFooting.scale.set(1, h, 1);
      this.ghostFooting.position.set(x, ground - 0.1 + h / 2, z);
      this.ghostFooting.material = t.ok ? this.ghostOk : this.ghostBad;
      this.ghostFooting.visible = true;
    }

    if ((tool === 'log' || tool === 'timber') && t) {
      if (this.pending) {
        const y = this.chunks.heightAt(this.pending.x, this.pending.z);
        this.marker.position.set(this.pending.x, y + 0.45, this.pending.z);
        this.marker.visible = true;
      }
      if (t.ghost) {
        const g = t.ghost;
        const b = g.b;
        const h = height(g.kind);
        const w = g.kind === 'log' ? LOG_D : TIMBER_W;
        const len = g.s1 - g.s0 + 0.04;
        const y = b.y0 + g.k * HALF + h / 2 + (t.ok ? 0 : 0);
        const c = (g.s0 + g.s1) / 2;
        if (g.axis === 'x') {
          this.ghostLog.scale.set(len, h, w);
          this.ghostLog.position.set(c, y, g.line);
        } else {
          this.ghostLog.scale.set(w, h, len);
          this.ghostLog.position.set(g.line, y, c);
        }
        this.ghostLog.material = t.ok ? this.ghostOk : this.ghostBad;
        this.ghostLog.visible = true;
      } else if (this.pending && t.node) {
        // a thin line from the start node to where you aim
        const A = this.pending;
        const dx = t.node.x - A.x;
        const dz = t.node.z - A.z;
        if (dx || dz) {
          const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
          const len = Math.abs(axis === 'x' ? dx : dz);
          const y = this.chunks.heightAt(A.x, A.z) + 0.3;
          if (axis === 'x') {
            this.ghostLog.scale.set(len, 0.05, 0.05);
            this.ghostLog.position.set(A.x + dx / 2, y, A.z);
          } else {
            this.ghostLog.scale.set(0.05, 0.05, len);
            this.ghostLog.position.set(A.x, y, A.z + dz / 2);
          }
          this.ghostLog.material = this.ghostBad;
          this.ghostLog.visible = true;
        }
      }
    }

    if (tool === 'roof' && t && t.ghostRoof) {
      const r = t.ghostRoof;
      const key = `${r.x0},${r.z0},${r.x1},${r.z1},${r.eave.toFixed(3)},${r.axis}`;
      if (key !== this.ghostRoofKey) {
        const m = new Mesher();
        addRoof(m, r, ROOF.pitch, ROOF.overhang, 1);
        this.ghostRoof.geometry.dispose();
        this.ghostRoof.geometry = m.build();
        this.ghostRoofKey = key;
      }
      this.ghostRoof.material = t.ok ? this.ghostOk : this.ghostBad;
      this.ghostRoof.visible = true;
    }
  }

  _placeRing(x, z, r) {
    const pos = this.ring.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = (i / pos.count) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      pos.setXYZ(i, px, this.chunks.heightAt(px, pz) + 0.05, pz);
    }
    pos.needsUpdate = true;
    this.ring.visible = true;
  }

  _placeDots(cx, cz) {
    const R = this.dotsR;
    const pos = this.dots.geometry.attributes.position;
    let i = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        const fade = dx * dx + dz * dz <= R * R;
        pos.setXYZ(i++, x, fade ? this.chunks.heightAt(x, z) + 0.04 : -9999, z);
      }
    }
    pos.needsUpdate = true;
    this.dots.visible = true;
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  _updateHud() {
    const t = this.tgt;
    let prompt = t ? t.prompt : '';
    if (this.input.isTouch && prompt) {
      // name the on-screen buttons instead of mouse buttons
      prompt = prompt
        .replace(/<b>hold click<\/b>/g, '<b>hold use</b>')
        .replace(/<b>click<\/b>/g, '<b>use</b>')
        .replace(/<b>right-click<\/b>|<b>right<\/b>/g, '<b>alt</b>')
        .replace(/<b>G<\/b>/g, '<b>stake</b>');
    }
    this.hud.setPrompt(prompt, t && t.bad);
    let p = null;
    if (this.hold) p = this.hold.t / this.hold.dur;
    this.hud.setProgress(p);
    const inv = this.inv;
    const txt = this.creative
      ? 'creative · unlimited materials'
      : `logs ${fmt(inv.log)} m · timber ${fmt(inv.timber)} m · stone ${inv.stone} · soil ${inv.soil.toFixed(1)} m³`;
    this.hud.setInventory(txt);
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  save() {
    this.saveAt = 0;
    try {
      const data = {
        v: 1,
        inv: this.inv,
        datum: this.datum,
        terrain: this.terrain.serialize(),
        forest: this.forest.serialize(),
        buildings: this.buildings.serialize(),
      };
      localStorage.setItem(STORE_KEY(this.gen.seed), JSON.stringify(data));
    } catch {
      /* storage full or unavailable */
    }
  }

  load() {
    const params = new URLSearchParams(location.search);
    if (params.has('clearbuild')) {
      try {
        localStorage.removeItem(STORE_KEY(this.gen.seed));
      } catch {
        /* ignore */
      }
      return;
    }
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY(this.gen.seed)) || 'null');
    } catch {
      data = null;
    }
    if (!data || data.v !== 1) return;
    Object.assign(this.inv, data.inv || {});
    this.terrain.load(data.terrain);
    this.forest.load(data.forest);
    this.buildings.load(data.buildings);
    if (data.datum) this._setStake(data.datum.x, data.datum.y, data.datum.z);
    this.invDirty = false;
  }
}

const fmt = (m) => (Math.round(m * 10) / 10).toString();

function growRect(r, x, z, pad) {
  if (!r) return [x - pad, z - pad, x + pad, z + pad];
  return [Math.min(r[0], x - pad), Math.min(r[1], z - pad), Math.max(r[2], x + pad), Math.max(r[3], z + pad)];
}

// March a ray over the terrain. -> { t, p } or null
function groundRay(chunks, o, d, maxT) {
  let prevT = 0;
  let t = 0.3;
  const at = (tt) => o.y + d.y * tt - chunks.heightAt(o.x + d.x * tt, o.z + d.z * tt);
  if (at(0) < 0) return null;
  while (t <= maxT) {
    if (at(t) < 0) {
      let a = prevT;
      let b = t;
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2;
        if (at(m) < 0) b = m;
        else a = m;
      }
      const p = new THREE.Vector3().copy(o).addScaledVector(d, b);
      p.y = chunks.heightAt(p.x, p.z);
      return { t: b, p };
    }
    prevT = t;
    t += 0.15 + t * 0.02;
  }
  return null;
}

// Ray against a vertical cylinder (in plan). -> t or null
function rayCircle(o, d, cx, cz, r) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 ? t : null;
}

// Wood chips, leaves, clods of earth.
class Particles {
  constructor(scene, chunks) {
    this.chunks = chunks;
    this.max = 220;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.035, 0.05), new THREE.MeshStandardMaterial({ roughness: 1 }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.p = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  burst(at, n, color, speed, spread, dx = 0, dz = 0) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.p.push({
        x: at.x + (Math.random() - 0.5) * spread,
        y: at.y + Math.random() * spread * 0.5,
        z: at.z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * s * 0.6 + dx * s,
        vy: s * (0.6 + Math.random() * 0.7),
        vz: Math.sin(a) * s * 0.6 + dz * s,
        r: Math.random() * 6,
        w: (Math.random() - 0.5) * 18,
        life: 1.1 + Math.random() * 0.9,
        color: this._c.set(color).multiplyScalar(0.75 + Math.random() * 0.5).clone(),
        rest: false,
      });
    }
  }

  update(dt) {
    const keep = [];
    for (const q of this.p) {
      q.life -= dt;
      if (q.life <= 0) continue;
      if (!q.rest) {
        q.vy -= 9.8 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        q.r += q.w * dt;
        const g = this.chunks.heightAt(q.x, q.z) + 0.02;
        if (q.y < g) {
          q.y = g;
          q.rest = true;
        }
      }
      keep.push(q);
    }
    this.p = keep;
    const n = Math.min(this.max, keep.length);
    for (let i = 0; i < n; i++) {
      const q = keep[i];
      const s = Math.min(1, q.life * 2);
      this._q.setFromEuler(this._e.set(q.r, q.r * 0.7, 0));
      this._m.compose(_p.set(q.x, q.y, q.z), this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, q.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
