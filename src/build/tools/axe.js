// The axe: fell trees, limb them and buck them into logs; cut the notches
// that seat one log on another; and, on the second button, hew round logs
// into squared timbers.

import * as THREE from 'three';
import { SPECIES, BUCK_LEN, treeName } from '../forestry.js';
import { TREE_KINDS } from '../../world/flora.js';
import { makeAxe } from '../geometry.js';
import { rayCircle } from '../aim.js';
import { REACH } from '../constants.js';

const SWING = { fell: 0.62, chop: 0.62, low: 0.66, hew: 0.8 }; // seconds a swing takes
export const HEW = 0.5; // metres of log squared up per swing
const CHIPS = 0xd8b27a;
const LEAVES = 0x3a5a22;

export const axe = {
  id: 'axe',
  label: 'axe',
  short: 'axe',
  held: { name: 'axe', make: makeAxe, rest: -0.3 },

  setup(b) {
    // a log lying at your feet while you square it up
    const geo = new THREE.CylinderGeometry(0.17, 0.17, 2.2, 9, 3);
    geo.rotateZ(Math.PI / 2);
    this.workLog = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
    this.workLog.castShadow = true;
    this.workLog.visible = false;
    this.workLogTimer = 0;
    b.scene.add(this.workLog);
  },

  update(b, dt) {
    if (this.workLogTimer <= 0) return;
    this.workLogTimer -= dt;
    if (this.workLogTimer <= 0) this.workLog.visible = false;
  },

  target(b) {
    const hew = b.have('log', HEW) ? ' · <b>right-click</b> hew a timber' : '';
    // a notch to cut?
    const ref = b.aimPoint;
    if (ref) {
      const nn = b.buildings.notchNear(ref, 1.3);
      if (nn && b.dist(nn.x, nn.z) < 3.4) {
        if (!nn.ready) return { prompt: 'notch the log underneath first', bad: true };
        return { type: 'notch', ok: true, ...nn, prompt: `<b>click</b> cut the notch${hew}` };
      }
    }
    // a standing tree?
    const tree = treeOnRay(b);
    if (tree) {
      const sp = SPECIES[tree.kind];
      // (called what it's called where it stands)
      const called = treeName(tree.kind, b.chunks.gen.countryAt(tree.x, tree.z));
      const reach = b.dist(tree.x, tree.z) - sp.r * tree.s;
      const n = b.forest.hitsOn(tree);
      const need = b.forest.hitsNeeded(tree);
      if (reach > REACH.axe) return { prompt: `${called.a}: <i>come closer</i>${hew}` };
      return { type: 'tree', ok: true, tree, x: tree.x, z: tree.z, prompt: `<b>click</b> chop the ${called.name} ${n ? `(${n}/${need})` : `· about ${sp.meters(tree.s)} m of log`}${hew}` };
    }
    // a felled tree?
    const at = b.ground ? b.ground.p : null;
    if (at) {
      const fl = b.forest.felledNear(at.x, at.z, 1.4);
      if (fl && b.dist(fl.x, fl.z) < 2.6) {
        const f = fl.f;
        const what = f.state === 'down' ? 'limb the tree' : `buck off ${Math.min(BUCK_LEN, f.left)} m of log (${f.left} m left)`;
        return { type: 'felled', ok: true, ...fl, prompt: `<b>click</b> ${what}${hew}` };
      }
    }
    // nothing? maybe a stump
    if (at && b.forest.stumpNear(at.x, at.z, 0.6)) return { prompt: `a stump: <i>grub it out with the shovel</i>${hew}` };
    if (hew) return { type: 'none', prompt: `<b>right-click</b> hew a log into a timber` };
    return { prompt: 'find a tree to fell' };
  },

  work(b, t, io) {
    if (io.use && t && t.ok) swingAt(b, t);
    else if (io.alt && b.have('log', HEW)) hew(b, this);
    else if ((io.useTap && (!t || !t.ok)) || (io.altTap && !b.have('log', HEW))) b.deny(t);
    return false;
  },
};

// The nearest standing trunk hit by the aim ray, else the nearest tree in
// front of you.
function treeOnRay(b) {
  let best = null;
  const P = b.player.pos;
  b.chunks.forEachPlant(P.x, P.z, 7, TREE_KINDS, (ch, kind, k, x, y, z, s) => {
    const r = SPECIES[kind].r * s + 0.2;
    const t = rayCircle(b.aimO, b.aimD, x, z, r);
    if (t === null) return;
    const hy = b.aimO.y + b.aimD.y * t;
    if (hy < y - 0.5 || hy > y + 5) return;
    if (!best || t < best.t) best = { t, tree: { ch, kind, k, x, y, z, s } };
  });
  if (best) {
    best.tree.key = `${best.tree.kind}@${Math.round(best.tree.x * 100)},${Math.round(best.tree.z * 100)}`;
    return best.tree;
  }
  const near = b.forest.treeNear(P.x, P.z, 1.8);
  if (near) {
    const fx = Math.sin(b.player.yaw);
    const fz = Math.cos(b.player.yaw);
    const dx = near.x - P.x;
    const dz = near.z - P.z;
    if ((dx * fx + dz * fz) / Math.hypot(dx, dz) > 0.5) return near;
  }
  return null;
}

// One swing of the axe at what t is (from target(), or made up the same way
// by the blueprint foreman): { type: 'tree', tree } a standing tree (from
// Forestry.treeNear), { type: 'felled', f, x, y, z } a felled trunk (from
// Forestry.felledNear), or { type: 'notch', ... } (see cutNotch).
export function swingAt(b, t) {
  if (t.type === 'tree') {
    const tree = t.tree;
    b.face(tree.x, tree.z);
    // a standing trunk takes a level swing, bit first, at about waist height
    b.swing('fell', SWING.fell, 0.6, () => {
      const sp = SPECIES[tree.kind];
      const P = b.player.pos;
      const dx = P.x - tree.x;
      const dz = P.z - tree.z;
      const l = Math.hypot(dx, dz) || 1;
      const at = new THREE.Vector3(tree.x + (dx / l) * sp.r * tree.s, P.y + 1.1, tree.z + (dz / l) * sp.r * tree.s);
      b.sound.sfx('chop', { size: Math.min(1, sp.r * tree.s * 2) });
      b.chips.burst(at, 7, CHIPS, 2.2, 0.4, dx / l, dz / l);
      if (b.forest.chop(tree, P.x, P.z)) {
        b.sound.sfx('creak');
        b.flash(`timber! the ${treeName(tree.kind, b.chunks.gen.countryAt(tree.x, tree.z)).name} is coming down`);
        b.regrow(tree.x, tree.z, 1);
      }
    });
  } else if (t.type === 'felled') {
    b.face(t.x, t.z);
    b.swing('chopLow', SWING.low, 0.6, () => {
      b.sound.sfx('chop', { size: 0.4 });
      const at = new THREE.Vector3(t.x, t.y + 0.3, t.z);
      const r = b.forest.buck(t.f);
      b.chips.burst(at, 6, r.limbed ? LEAVES : CHIPS, 2, 0.4);
      if (r.limbed) b.flash('limbed: now buck it into logs');
      if (r.meters) {
        b.gain('log', r.meters);
        b.sound.sfx('thud', { size: 0.6 });
        b.flash(`+${r.meters} m of log`);
      }
    });
  } else if (t.type === 'notch') cutNotch(b, t);
}

// One swing to cut the notch in log t.L of building t.b at node t.n, which is
// at (t.x, t.y, t.z). The blueprint foreman swings the same way.
export function cutNotch(b, t) {
  const P = b.player.pos;
  b.face(t.x, t.z);
  b.swing(t.y - P.y > 1.15 ? 'chop' : 'chopLow', SWING.chop, 0.6, () => {
    b.sound.sfx('notch');
    b.chips.burst(new THREE.Vector3(t.x, t.y, t.z), 6, CHIPS, 2, 0.3);
    const seated = b.buildings.notch(t.b, t.L, t.n);
    if (seated) {
      b.sound.sfx('thud', { size: 0.8 });
      const left = t.b.logs.filter((L) => !L.seated).length;
      b.flash(left ? `notched in · ${left} more to notch` : 'notched in');
    }
  });
}

// Square up a log lying at your feet: one swing, half a metre. `tool` is the
// axe (it keeps the log you work on).
export function hew(b, tool) {
  const P = b.player.pos;
  const fx = Math.sin(b.player.yaw);
  const fz = Math.cos(b.player.yaw);
  const at = new THREE.Vector3(P.x + fx * 0.95, 0, P.z + fz * 0.95);
  at.y = b.chunks.heightAt(at.x, at.z) + 0.17;
  tool.workLog.position.copy(at);
  tool.workLog.rotation.y = b.player.yaw + Math.PI / 2;
  tool.workLog.visible = true;
  tool.workLogTimer = 1.2;
  b.swing('chopLow', SWING.hew, 0.62, () => {
    b.sound.sfx('hew');
    b.chips.burst(at.clone().setY(at.y + 0.15), 7, 0xe0c08a, 2, 0.4);
    b.spend('log', HEW);
    b.gain('timber', HEW);
    if (!b.have('log', HEW) && !b.creative) b.flash('out of logs to hew');
  });
}
