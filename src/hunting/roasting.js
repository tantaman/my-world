// Roasting: cuts of meat on a spit over a campfire.
//
// A spit stands over a fire ring (fires/), on its grid node, with up to
// three cuts threaded on it. Each cut browns while the fire under it burns
// (embers do it more slowly) and stops while it's out. Take them off when
// they're done: leave them too long and they burn black. When the last cut
// comes off, the spit comes down with it.
//
// How done a cut is is one number, `done`: 0 raw, 1 roasted, CHAR burnt.
// It moves only while the game is running, so what was roasting when you
// left is as you left it when you come back. The spits are yours, like what
// you carry (the 'spits' save domain), not part of the world.
//
// Emits:
//   'change'   ()   a cut went on or came off, or turned from one stage to
//                   the next (raw, browning, nearly done, done, burnt): as it
//                   cooks, that is often enough to be worth keeping

import * as THREE from 'three';
import { Emitter } from '../core/events.js';
import { makeSpitFrame, makeCut, SPIT } from './models.js';

export const ROAST = {
  cuts: SPIT.cuts.length, // a spit holds this many cuts
  cook: 45, // seconds over a fire burning well to roast a cut
  char: 1.7, // ...and at this many times that it's burnt black
  embers: 0.55, // embers roast at this much of the pace of flames, when hottest
  least: 0.35, // a fire just catching roasts at least this much of the pace
};

const HEARD = 14; // metres: further than this, a spit can't be heard sizzling
const COLOURS = { raw: new THREE.Color(0xa8423c), done: new THREE.Color(0x7a4422), burnt: new THREE.Color(0x1e1612) };
const fk = (x, z) => `${x},${z}`;
const r3 = (v) => Math.round(v * 1000) / 1000;

// How a cut that is `done` this far along is, in a word.
export function doneness(done) {
  if (done >= ROAST.char) return 'burnt';
  if (done >= 1) return 'done';
  if (done >= 0.75) return 'nearly done';
  if (done >= 0.2) return 'browning';
  return 'raw';
}

// How fast a fire roasts, as a share of the pace of one burning well: 0 out.
// st is what Fires.state says of it.
export function roastPace(st) {
  if (!st) return 0;
  if (st.state === 'burning') return Math.max(ROAST.least, st.heat);
  if (st.state === 'embers') return ROAST.embers * (0.3 + 0.7 * st.heat);
  return 0;
}

// The colour of a cut done this far along.
export function cutColour(done, out = new THREE.Color()) {
  if (done < 1) return out.copy(COLOURS.raw).lerp(COLOURS.done, done * done * (3 - 2 * done));
  return out.copy(COLOURS.done).lerp(COLOURS.burnt, Math.min(1, (done - 1) / (ROAST.char - 1)));
}

export class Spits extends Emitter {
  // fires: the campfires (Fires: at, state)
  constructor({ scene, fires }) {
    super();
    this.scene = scene;
    this.fires = fires;
    this.list = new Map(); // "x,z" -> spit
    // The spit nearest the eye with something on it over a live fire, for the
    // sizzle: { x, y, z, heat } or null. Kept up to date by update().
    this.heard = null;
  }

  at(x, z) {
    return this.list.get(fk(x, z)) || null;
  }

  // A cut onto the spit over the fire on node (x, z), whose floor is at y;
  // the spit goes up if there isn't one. -> false if it's full
  put(x, z, y, done = 0) {
    let s = this.at(x, z);
    if (s && s.cuts.length >= ROAST.cuts) return false;
    if (!s) s = this._add(x, z, y);
    s.cuts.push(done);
    this._show(s);
    this.emit('change');
    return true;
  }

  // Everything off the spit, and the spit down.
  // -> { done, burnt, raw }: how many cuts were roasted, burnt, not yet done
  takeOff(s) {
    const out = { done: 0, burnt: 0, raw: 0 };
    for (const d of s.cuts) {
      if (d >= ROAST.char) out.burnt++;
      else if (d >= 1) out.done++;
      else out.raw++;
    }
    this._remove(s);
    this.emit('change');
    return out;
  }

  // How fast the fire under it roasts now (see roastPace).
  pace(s) {
    const f = this.fires.at(s.x, s.z);
    return f ? roastPace(this.fires.state(f)) : 0;
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  // eye: where the camera is (for which one you hear)
  update(dt, eye) {
    let heard = null;
    let hd = HEARD;
    let turned = false;
    for (const s of this.list.values()) {
      const pace = this.pace(s);
      if (pace <= 0) continue;
      for (let i = 0; i < s.cuts.length; i++) {
        const was = doneness(s.cuts[i]);
        s.cuts[i] = Math.min(ROAST.char + 0.5, s.cuts[i] + (dt / ROAST.cook) * pace);
        if (doneness(s.cuts[i]) !== was) turned = true;
      }
      this._show(s);
      const d = eye ? Math.hypot(s.x - eye.x, s.z - eye.z) : Infinity;
      if (d < hd) {
        hd = d;
        heard = { x: s.x, y: s.y + SPIT.height, z: s.z, heat: Math.min(1, pace) * (s.cuts.length / ROAST.cuts) };
      }
    }
    this.heard = heard;
    if (turned) this.emit('change');
  }

  // ── Building one ──────────────────────────────────────────────────────────
  _add(x, z, y) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.add(makeSpitFrame());
    const s = { x, z, y: r3(y), cuts: [], group, meat: [] };
    for (const at of SPIT.cuts) {
      const m = makeCut();
      m.position.set(at, SPIT.height, 0);
      m.visible = false;
      group.add(m);
      s.meat.push(m);
    }
    this.scene.add(group);
    this.list.set(fk(x, z), s);
    return s;
  }

  _show(s) {
    s.meat.forEach((m, i) => {
      m.visible = i < s.cuts.length;
      if (m.visible) cutColour(s.cuts[i], m.material.color);
    });
  }

  _remove(s) {
    this.scene.remove(s.group);
    s.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      if (s.meat.includes(o)) o.material.dispose();
    });
    this.list.delete(fk(s.x, s.z));
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  // [[x, z, y, [done, ...]], ...]
  serialize() {
    return [...this.list.values()].map((s) => [s.x, s.z, s.y, s.cuts.map(r3)]);
  }

  load(arr) {
    for (const s of [...this.list.values()]) this._remove(s);
    for (const [x, z, y, cuts] of arr) {
      if (this.list.has(fk(x, z))) continue;
      const s = this._add(x, z, y);
      s.cuts.push(...cuts.slice(0, ROAST.cuts));
      this._show(s);
    }
  }
}

// What a save holds of the spits, made safe: someone else's bytes.
export function validateSpits(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    if (!Array.isArray(s)) continue;
    const [x, z, y, cuts] = s;
    if (![x, z, y].every(Number.isFinite) || !Array.isArray(cuts)) continue;
    const ok = cuts.filter((d) => Number.isFinite(d) && d >= 0).slice(0, ROAST.cuts);
    if (ok.length) out.push([Math.round(x), Math.round(z), y, ok]);
  }
  return out;
}
