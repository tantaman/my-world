// The blueprint tool: choose a plan, stake it out, and have it built for you.
//
// With nothing staked out, the plan follows the crosshair as a ghost:
//   click         stake it out here (the prompt says first if it won't go)
//   right-click   turn it a quarter
//   its key again the next plan (index.js)
// Aim at a building instead, and a click copies it down as a blueprint of
// your own, to put up again somewhere else.
//
// With a site staked out:
//   click         build it for me, or pause (B does the same from any tool)
//   right-click   twice: pull up the stakes. What is built stays.
//
// The building itself is the foreman's (foreman.js); this is the handle on it.

import { JOIN_RADIUS, PIER } from '../build/constants.js';
import { footingSpot } from '../build/tools/footing.js';
import { inTheWay } from '../build/tools/wall.js';
import { tenths } from '../build/inventory.js';
import { place, findBuilding, survey, needs } from './plan.js';
import { levelling, siteGround } from './grade.js';
import { clearable, clearingWords, zone } from './clear.js';

const RECHECK = 0.5; // s between looks at a spot you keep aiming at (the ground can change)
const CONFIRM = 2.5; // s to right-click again to pull up the stakes

// library: library.js · foreman: foreman.js · ghost: a Ghost for choosing
// where (ghost.js) · copy(building): keep a building as a blueprint
export function blueprintTool({ library, foreman, ghost, copy }) {
  return {
    id: 'blueprint',
    label: 'plan',
    short: 'plan',
    rot: 0, // quarter-turns of the plan you're placing
    confirm: 0, // s left to right-click again and pull up the stakes
    look: null, // what was last worked out about a spot { key, at, t, ... }

    target(b) {
      if (foreman.site) {
        if (this.confirm > 0) return { type: 'site', bad: true, prompt: "<b>right-click</b> again to pull up the stakes <i>(what's built stays)</i>" };
        const s = foreman.status(b.buildings);
        return { type: 'site', prompt: s.text, bad: s.bad };
      }
      if (b.piece && b.piece.b) return { type: 'copy', ok: true, building: b.piece.b, prompt: '<b>click</b> copy this building down as a blueprint' };
      const g = b.ground;
      const plan = library.current;
      if (!g) return { prompt: `aim at the ground to stake out the ${plan.name}` };
      const x = Math.round(g.p.x);
      const z = Math.round(g.p.z);
      const key = `${plan.name}|${x},${z}|${this.rot}`;
      if (!this.look || this.look.key !== key || this.look.t <= 0) this.look = { key, t: RECHECK, ...assess(b, plan, x, z, this.rot) };
      const L = this.look;
      const turn = '<b>right-click</b> turn it';
      if (L.trouble) return { type: 'place', x, z, placed: L.placed, bad: true, prompt: `${L.trouble} · <b>click</b> stake it out anyway · ${turn}` };
      return { type: 'place', ok: true, x, z, placed: L.placed, prompt: `<b>click</b> stake out the ${plan.name} <i>(${L.need})</i> · ${turn} · <b>${b.tools.indexOf(this) + 1}</b> again: another plan` };
    },

    work(b, t, io) {
      this.confirm = Math.max(0, this.confirm - io.dt);
      if (this.look) this.look.t -= io.dt;
      if (io.altTap) {
        if (!foreman.site) this.rot = (this.rot + 1) % 4;
        else if (this.confirm > 0) {
          foreman.pullUp();
          this.confirm = 0;
          b.flash("stakes pulled up: what's built stays");
        } else this.confirm = CONFIRM;
      }
      if (io.useTap && t) {
        if (t.type === 'site') foreman.toggle();
        else if (t.type === 'copy') copy(t.building);
        else if (t.type === 'place') {
          foreman.stake(library.current, t.x, t.z, this.rot);
          b.sound.sfx('stone');
          b.flash(`the ${library.current.name} is staked out: click to have it built`);
        } else b.deny(t);
      }
      const busy = foreman.work(b, io.dt);
      // a footing half dug when it stopped is let go of
      if (foreman.state !== 'working') b.dropHold();
      return busy;
    },

    update(b) {
      foreman.watch(b);
    },

    preview(b, t) {
      if (!t || t.type !== 'place') return;
      const L = this.look;
      ghost.draw(`${L.key}|${L.y0.toFixed(2)}|${[...L.uneven].join(' ')}`, L.placed, { y0: L.y0, ground: (x, z) => b.chunks.heightAt(x, z), trouble: L.uneven, pad: L.pad });
      b.previews.show(ghost.pieces, !t.bad);
      b.previews.show(ghost.trouble, false);
    },

    put(b) {
      this.confirm = 0;
      if (foreman.state !== 'working') return;
      foreman.pause();
      b.dropHold();
    },
  };
}

// Would the plan go here? Everything that would stop it, short of materials,
// which the foreman gathers. Trees and stumps on the site are no trouble, as
// the foreman clears them first (clear.js), nor is uneven ground it can
// level (grade.js).
// -> { placed, y0: the footings' level, uneven: 'x,z' of footings that can't
//      reach it, need: what it takes, in words, pad: the grade it will be
//      levelled to or null, trouble: words or null }
function assess(b, plan, x, z, rot) {
  const placed = place(plan, x, z, rot);
  const { b: there, clash } = findBuilding(placed, b.buildings.list, JOIN_RADIUS);
  const built = new Set(there ? [...there.footings.values()].map((f) => `${f.x},${f.z}`) : []);
  const ignore = (o) => clearable(o, placed.rect);
  const lv = levelling(placed, siteGround(b, placed.rect, { ignore }), { y0: there ? there.y0 : null, built, earn: !b.creative });
  const s = survey(placed, (px, pz) => b.chunks.heightAt(px, pz), there ? there.y0 : lv.need ? lv.level + PIER.first : null);
  const n = needs(plan);
  const Z = zone(placed.rect);
  const toClear = b.obstacles.near((Z.x0 + Z.x1) / 2, (Z.z0 + Z.z1) / 2, Math.hypot(Z.x1 - Z.x0, Z.z1 - Z.z0) / 2 + 1).filter(ignore);
  const clearing = clearingWords(toClear.filter((o) => o.clear === 'fell').length, toClear.filter((o) => o.clear === 'grub').length);
  const need = [n.log && `${n.log} m log`, n.timber && `${n.timber} m timber`, `${n.stone} stones`, clearing, lv.need && `levelling ${tenths(lv.cut + lv.fill)} m³`].filter(Boolean).join(' · ');
  let trouble = null;
  let uneven = new Set();
  if (clash) trouble = `too close to another building (keep ${JOIN_RADIUS} m apart)`;
  else if (lv.need && lv.trouble) {
    trouble = lv.trouble;
    uneven = new Set(s.footings.filter((f) => !f.ok && !built.has(`${f.x},${f.z}`)).map((f) => `${f.x},${f.z}`));
  } else {
    for (const f of placed.footings) {
      if (built.has(`${f.x},${f.z}`)) continue;
      // levelling settles the water question; otherwise the footing tool asks it
      const why = footingSpot(b, f.x, f.z, { water: !lv.need, ignore });
      if (why) {
        trouble = `a footing: ${why}`;
        break;
      }
    }
    for (const L of trouble ? [] : placed.logs) {
      const what = inTheWay(b, L.axis, L.line, L.s0, L.s1, L.k, ignore);
      if (what) {
        trouble = `${what} is in the way of a wall`;
        break;
      }
    }
  }
  return { placed, y0: s.y0, uneven, need, trouble, pad: lv.need ? lv.level : null };
}
