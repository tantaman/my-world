// Walls: click a grid node, then another along the same line, and a log is
// laid between them; click again to stack the next course. One tool for round
// logs and one for hewn timbers — the same thing with a different piece.

import * as THREE from 'three';
import { HALF, LOG_D, TIMBER_W, REACH, height } from '../constants.js';
import { tenths } from '../inventory.js';

// kind: 'log' | 'timber' — the material it lays, and its id as a tool
export function wallTool(kind, { label, short }) {
  const name = kind === 'log' ? 'log' : 'timber';
  return {
    id: kind,
    label,
    short,
    kit: 'cabin', // with the roof: what a cabin is raised with
    grid: true,
    pending: null, // first node of a wall being laid { x, z }

    setup(b) {
      this.ghost = b.previews.ghost(new THREE.BoxGeometry(1, 1, 1));
      // a peg at the node the wall starts from
      this.marker = b.previews.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), new THREE.MeshBasicMaterial({ color: 0xf0c060, toneMapped: false })));
    },

    put() {
      this.pending = null;
    },

    target(b) {
      const p = b.aimPoint;
      if (!p) return null;
      const x = Math.round(p.x);
      const z = Math.round(p.z);
      const node = { x, z };
      const removable = b.piece && b.piece.type === 'log' && b.piece.piece.kind === kind ? b.piece : null;
      if (!this.pending) {
        if (b.dist(x, z) > REACH.build) return { prompt: 'too far away', far: true };
        const at = b.buildings.buildingFor(x, z);
        if (!at) return { node, prompt: 'lay footings first, then run walls between them', bad: true };
        let txt = `<b>click</b> start a wall here`;
        if (removable && !b.buildings.canRemoveLog(removable.b, removable.piece)) txt += ' · <b>right-click</b> take this one down';
        return { type: 'start', ok: true, node, b: at, removable, prompt: txt };
      }
      const A = this.pending;
      const dx = x - A.x;
      const dz = z - A.z;
      const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
      const line = axis === 'x' ? A.z : A.x;
      const s0 = axis === 'x' ? Math.min(A.x, x) : Math.min(A.z, z);
      const s1 = axis === 'x' ? Math.max(A.x, x) : Math.max(A.z, z);
      const at = b.buildings.buildingFor((A.x + x) / 2, (A.z + z) / 2) || b.buildings.buildingFor(A.x, A.z);
      if (!at) return { node, prompt: 'lay footings first', bad: true };
      const { c, reason, short, len } = logCheck(b, at, kind, axis, line, s0, s1);
      const ghost = { b: at, axis, line, s0, s1, k: c.k, kind };
      if (!c.ok) return { node, ghost: c.k !== undefined && len >= 1 ? ghost : null, bad: true, prompt: `${c.reason} · <b>right-click</b> cancel` };
      if (short) return { node, ghost, bad: true, prompt: reason };
      if (reason) return { node, ghost, bad: true, prompt: `${reason} · <b>right-click</b> cancel` };
      const course = Math.floor(c.k / 2) + 1;
      return { type: 'lay', ok: true, node, b: at, ghost, len, prompt: `<b>click</b> lay a ${len} m ${name} <i>(course ${course})</i> · <b>right-click</b> done` };
    },

    work(b, t, io) {
      if (io.useTap) this.click(b, t);
      if (io.altTap) {
        if (this.pending) this.pending = null;
        else if (t && t.removable) takeDown(b, t.removable);
      }
      return false;
    },

    click(b, t) {
      if (!t) return;
      if (!this.pending) {
        if (t.type === 'start') this.pending = { x: t.node.x, z: t.node.z };
        else b.deny(t);
        return;
      }
      if (t.type !== 'lay') {
        b.deny(t);
        return;
      }
      const g = t.ghost;
      layLog(b, t.b, g.kind, g.axis, g.line, g.s0, g.s1);
    },

    preview(b, t) {
      if (!t) return;
      if (this.pending) {
        const y = b.chunks.heightAt(this.pending.x, this.pending.z);
        this.marker.position.set(this.pending.x, y + 0.45, this.pending.z);
        this.marker.visible = true;
      }
      if (t.ghost) {
        const g = t.ghost;
        const h = height(g.kind);
        const w = g.kind === 'log' ? LOG_D : TIMBER_W;
        const len = g.s1 - g.s0 + 0.04;
        const y = g.b.y0 + g.k * HALF + h / 2;
        const c = (g.s0 + g.s1) / 2;
        if (g.axis === 'x') {
          this.ghost.scale.set(len, h, w);
          this.ghost.position.set(c, y, g.line);
        } else {
          this.ghost.scale.set(w, h, len);
          this.ghost.position.set(g.line, y, c);
        }
        b.previews.show(this.ghost, t.ok);
      } else if (this.pending && t.node) {
        // a thin line from the start node to where you aim
        const A = this.pending;
        const dx = t.node.x - A.x;
        const dz = t.node.z - A.z;
        if (!dx && !dz) return;
        const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
        const len = Math.abs(axis === 'x' ? dx : dz);
        const y = b.chunks.heightAt(A.x, A.z) + 0.3;
        if (axis === 'x') {
          this.ghost.scale.set(len, 0.05, 0.05);
          this.ghost.position.set(A.x + dx / 2, y, A.z);
        } else {
          this.ghost.scale.set(0.05, 0.05, len);
          this.ghost.position.set(A.x, y, A.z + dz / 2);
        }
        b.previews.show(this.ghost, false);
      }
    },
  };
}

// Can a log of `kind` go from s0 to s1 along `axis` on `line` of building
// `at`, here and now? What the prompt says, and what the blueprint foreman
// asks before it lays one.
// -> { c: logCandidate, len, reason: why not (the rules, something in the
//      way, or not enough wood) or null, blocked: something stands in the
//      way, short: it's the wood that's lacking }
export function logCheck(b, at, kind, axis, line, s0, s1) {
  const c = b.buildings.logCandidate(at, axis, line, s0, s1);
  const len = s1 - s0;
  if (!c.ok) return { c, len, reason: c.reason };
  const blocker = inTheWay(b, axis, line, s0, s1, c.k);
  if (blocker) return { c, len, blocked: true, reason: `${blocker} is in the way` };
  if (!b.have(kind, len)) return { c, len, short: true, reason: `you need ${len} m of ${kind === 'log' ? 'log' : 'timber'} (have ${tenths(b.inv[kind])})` };
  return { c, len, reason: null };
}

// Lay the log, and pay for it. -> the log, or null if the rules said no.
export function layLog(b, at, kind, axis, line, s0, s1) {
  const L = b.buildings.addLog(at, kind, axis, line, s0, s1);
  if (!L) return null;
  const len = L.s1 - L.s0;
  b.spend(kind, len);
  const [mx, mz] = axis === 'x' ? [(L.s0 + L.s1) / 2, line] : [line, (L.s0 + L.s1) / 2];
  b.face(mx, mz);
  b.player.character.play('bend', 0.6);
  b.sound.sfx('thud', { size: Math.min(1, len / 6) });
  if (!L.seated) b.flash(`it rides on ${L.below.length} crossing${L.below.length > 1 ? 's' : ''}: notch it in with the axe`);
  return L;
}

// Something standing on a wall line (a tree; for the lowest courses, a
// stump), but what `ignore` says will be gone by then. -> what to call it, or null.
export function inTheWay(b, axis, line, s0, s1, k, ignore = null) {
  const [mx, mz] = axis === 'x' ? [(s0 + s1) / 2, line] : [line, (s0 + s1) / 2];
  const R = (s1 - s0) / 2 + 2;
  for (const o of b.obstacles.near(mx, mz, R)) {
    if (!o.wall || (o.low && k > 2) || (ignore && ignore(o))) continue;
    const along = axis === 'x' ? o.x : o.z;
    const across = axis === 'x' ? o.z : o.x;
    if (along > s0 - 0.3 - o.wall && along < s1 + 0.3 + o.wall && Math.abs(across - line) < o.wall + 0.2) return o.what;
  }
  return null;
}

function takeDown(b, hit) {
  const why = b.buildings.canRemoveLog(hit.b, hit.piece);
  if (why) {
    b.flash(`can't: ${why}`);
    b.sound.sfx('deny');
    return;
  }
  const L = hit.piece;
  b.buildings.removeLog(hit.b, L);
  if (!b.creative) b.gain(L.kind, L.s1 - L.s0);
  b.sound.sfx('thud', { size: 0.4 });
}
