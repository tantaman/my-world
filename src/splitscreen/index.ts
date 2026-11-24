// A split screen: two, three or four people in one forest on one screen, a
// game controller each.
//
// Plug in a second pad and press a button on it (the browser shows a page no
// pad until then), and the screen splits in two; a third, in three; a fourth,
// in quarters (layout.js). The first pad, with the keyboard and the mouse, is
// the hiker you already are, with everything you can do. Each other pad is
// somebody else, set down beside you: they walk, run, jump, swim and dive,
// and look about, with a camera of their own on their own part of the
// screen, and a HUD of their own there (partHud.ts). Who each of them is
// (player/hikers.js) is theirs to choose, as it is yours: any of the hikers,
// whoever else is them already. So is whether their camera is locked behind
// them. Tools, rides, the map and the pack are still only yours: everything
// else the game does is done by and for the first hiker. Unplug a pad and
// whoever it was goes; with one left, the screen is whole again.
//
// How it fits in, without anything else knowing about it:
//   - only the first pad is read as yours (game.pads.only)
//   - each other hiker is a Player of their own (player/player.js), moved by
//     their pad (pad.js), bumping into what you bump into
//   - the screen is shared out with game.views (render/views.ts), and as
//     each part is drawn, whatever goes by whose part it is is put right for
//     it: the grass parts round its hiker, the sun's shadows are drawn round
//     them (sky.aim), the water ripples round their legs, and with their
//     camera under the water, the fog is the water's. Looking out of your
//     own eyes hides your body from your own part only.
//   - the ground and the grass are grown round each of them as well as round
//     you (game.followed)
//   - your HUD keeps to your part of the screen (#hud's box, index.html),
//     and each of the others' is made here, in theirs
//
// What goes by where you are and nothing else (the animals, the towns, what
// is heard) still goes by you alone.

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import type { Part } from '../render/views.ts';
import { Player } from '../player/player.js';
import { HIKERS, hiker } from '../player/hikers.js';
import { padName, padNames } from '../player/gamepad.js';
import { SHARED, WADE, UNDER } from '../render/uniforms.js';
import { waterSample } from '../core/geom.js';
import { PadControls } from './pad.js';
import { PartHud } from './partHud.ts';
import type { Row, Panel } from './partHud.ts';
import { layout, cast, next, MOST } from './layout.js';
import './splitscreen.css';

// Somebody on another part of the screen, as the console sees them.
export interface Other {
  pad: number; // which pad is theirs (Gamepad.index)
  who: string; // which hiker they are (an id in player/hikers.js)
  hiker: Player;
  behind: boolean; // is their camera locked behind them?
  panel: boolean; // is their panel open?
}

// What this provides: world.splitscreen, for the console and the play-through.
export interface SplitScreen {
  readonly count: number; // how many share the screen: 1 while it's whole
  readonly others: Other[];
}

declare module '../game/game.ts' {
  interface Services {
    splitscreen: SplitScreen;
  }
}

// Someone joining is set down this far (m) to your side (a step further for
// each part of the screen after the first two), and this far behind you.
const BESIDE = 1.4;
const BEHIND = 0.8;
// You went further than this (m) between one frame and the next: you were set
// down somewhere (back to the start, or by the map), and the others come too.
const TELEPORT = 60;
// ...and anyone further than this (m) from you is brought back beside you:
// left behind by a train you took, say. Far enough not to be a leash.
const TOO_FAR = 1500;
// How quickly the ripples round someone's legs follow how much they wade (1/s).
const RIPPLE_EASE = 4;
// Water this near the sea's level (m) is the sea, for the colour of its fog.
const SEA_NEAR = 0.02;
// While everyone is within this far (m) of the middle of them all, one map
// of the sun's shadows, drawn round that middle, does for every part. It
// reaches CONFIG.shadowExtent (60 m) each way from there, so round each of
// them at least that less this. Further apart, each part draws its own,
// round its own hiker. (A hiker is a hundred or so pieces, every one of them
// casting a shadow, and so is every hiker in every part: drawing that once
// a frame and not once a part is most of what there is to save.)
const SHADOWS_SHARED = 12;

const _w = waterSample();
const _middle = new THREE.Vector3();

interface Someone {
  pad: number;
  slot: number; // which part of the screen is theirs: 1, 2 or 3 (0 is yours)
  controls: PadControls;
  hiker: Player;
  camera: THREE.PerspectiveCamera;
  ripple: number; // eased (RIPPLE_EASE)
  waiting: boolean; // joined while something else was drawn: set down once it isn't
  hud: PartHud; // what is written over their part, and the part itself
}

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player'];
export function installSplitscreen(game: Game) {
  const { scene, camera, origin, chunks, grass, gen, solids, spaces, basins, sky, hud, commands, settings, views, pads, player, followed, focus } = game;

  const others: Someone[] = [];
  let everyone: Player[] = [player];
  const FOV = camera.fov; // (as it is before anyone has zoomed into their eyes)
  const ids = () => HIKERS.map((h: { id: string }) => h.id);
  const whoOf = (h: Player): string => h.character.who.id;
  const nameOf = (h: Player): string => h.character.who.name;

  // What each of the others chose, remembered by this browser for their part
  // of the screen (1, 2, 3), so that the same pad finds it as they left it:
  // who they are, and whether their camera is locked behind them (player.js:
  // one stick does it all, which is easier for small hands). Only what they
  // chose: someone who has never said who they are is found a hiker nobody
  // is, each time (cast, layout.js).
  const each = <T>(name: string, is: (v: unknown) => v is T): Array<T | null> => {
    const was = settings.get(name, 'object');
    return Array.isArray(was) ? was.map((v: unknown) => (is(v) ? v : null)) : [];
  };
  const kept = each('splitHikers', (v): v is string => typeof v === 'string');
  const locked = each('splitBehinds', (v): v is boolean => typeof v === 'boolean');
  // Until one of them has chosen, their camera is locked behind them.
  // (splitBehind: what the one switch for all of them, which this once was,
  // was left at.)
  const LOCKED: boolean = settings.get('splitBehind', 'boolean') ?? true;
  function be(o: Someone, id: string) {
    if (id === whoOf(o.hiker)) return;
    o.hiker.be(hiker(id));
    kept[o.slot] = id;
    settings.set('splitHikers', kept.slice());
  }
  function lock(o: Someone, on: boolean) {
    o.hiker.lockCamera = on;
    locked[o.slot] = on;
    settings.set('splitBehinds', locked.slice());
  }

  // ── On the screen ─────────────────────────────────────────────────────────
  // A thin dark line round each part, and over each of the others' parts, a
  // HUD of their own (partHud.ts). Yours keeps to your own part.
  const box = document.createElement('div');
  box.id = 'split';
  box.hidden = true;
  const yours = document.createElement('div');
  yours.className = 'part';
  document.body.appendChild(box);
  const hudEl = document.getElementById('hud');
  const place = (el: HTMLElement, r: { x: number; y: number; w: number; h: number }) => {
    Object.assign(el.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  };
  let yourRect = { x: 0, y: 0, w: 1, h: 1 };
  let shown = false;
  // The parts' lines and names, and your HUD in your part: while the screen
  // is split, and isn't covered by something else drawn over all of it.
  // (again: the parts have moved, so put it in yours again regardless.)
  function frame(on: boolean, again = false) {
    if (on === shown && !again) return;
    shown = on;
    box.hidden = !on;
    const r = yourRect;
    if (hudEl) hudEl.style.inset = on ? `${r.y * 100}% ${(1 - r.x - r.w) * 100}% ${(1 - r.y - r.h) * 100}% ${r.x * 100}%` : '';
  }

  // Someone's panel (their start button): what is theirs to set, as who is
  // hiking and the camera behind you are yours on the settings panel, and
  // the way back to you. Worked with their own pad (buttons(), below).
  const rowsOf = (o: Someone): Row[] => [
    { id: 'who', label: () => 'who is hiking', value: () => nameOf(o.hiker), step: (by) => be(o, next(ids(), whoOf(o.hiker), by)) },
    { id: 'behind', label: () => 'camera locked behind you', value: () => (o.hiker.lockCamera ? 'on' : 'off'), step: () => lock(o, !o.hiker.lockCamera) },
    { id: 'back', label: () => `back beside ${nameOf(player)}`, value: () => padName('PadA', o.controls.kind), press: () => bring(o), closes: true },
  ];
  const panelOf = (o: Someone): Panel => ({
    title: () => nameOf(o.hiker).toUpperCase(),
    rows: rowsOf(o),
    keys: () => o.controls.keys(o.hiker.lockCamera),
    foot: () => {
      const kind = o.controls.kind;
      return `${padNames(['PadUp', 'PadDown'], kind)} choose · ${padNames(['PadLeft', 'PadRight'], kind).replace('d-pad ', '')} change · ${padName('PadB', kind)} close`;
    },
  });
  // Who someone is, and the buttons that are the split screen's, on their part.
  function label(o: Someone) {
    const kind = o.controls.kind;
    o.hud.label(nameOf(o.hiker), `${padName('PadSelect', kind)} · someone else   ${padName('PadStart', kind)} · settings`);
  }
  // The buttons of their pad that are the split screen's: start opens their
  // panel and puts it away, and while it's open the pad is the panel's
  // (controls.blocked): the d-pad goes from row to row and changes the one
  // they're on, A does too, B puts it away. Otherwise select makes them the
  // next of the hikers.
  function buttons(o: Someone) {
    const { controls: c, hud: h } = o;
    const m = h.menu;
    if (c.pressed('PadStart')) {
      if (m.isOpen) m.close();
      else m.open();
    } else if (!m.isOpen) {
      if (c.pressed('PadSelect')) {
        be(o, next(ids(), whoOf(o.hiker)));
        h.flash(nameOf(o.hiker));
      }
    } else if (c.pressed('PadB')) m.close();
    else if (c.pressed('PadUp')) m.move(-1);
    else if (c.pressed('PadDown')) m.move(1);
    else if (c.pressed('PadLeft')) m.step(-1);
    else if (c.pressed('PadRight')) m.step(1);
    else if (c.pressed('PadA')) m.press();
    c.blocked = m.isOpen;
  }

  // The screen shared out between everyone (or whole again).
  function shape() {
    everyone = [player, ...others.map((o) => o.hiker)];
    if (!others.length) {
      views.show([]);
      frame(false);
      box.replaceChildren();
      return;
    }
    const rects = layout(others.length + 1, innerWidth / Math.max(1, innerHeight));
    const parts: Part[] = [{ camera, rect: rects[0], before: () => look(0), after: restore }];
    others.forEach((o, i) => parts.push({ camera: o.camera, rect: rects[i + 1], before: () => look(i + 1), after: restore }));
    views.show(parts);
    yourRect = rects[0];
    place(yours, rects[0]);
    others.forEach((o, i) => place(o.hud.el, rects[i + 1]));
    box.replaceChildren(yours, ...others.map((o) => o.hud.el));
    frame(!game.covered, true);
  }
  addEventListener('resize', () => {
    if (others.length) shape();
  });

  // ── Each part as it's drawn ───────────────────────────────────────────────
  // Yours is drawn first, as the frame left everything; each other part is
  // drawn as it would be if its hiker were you, and then everything is put
  // back as it was. Each part draws only the grass round its own hiker; and
  // while everyone is close together, the sun's shadows are drawn once, for
  // all of them, with the first part (SHADOWS_SHARED).
  const yourWater = { wade: 0, flowX: 0, flowZ: 0, under: 0, level: 0, sea: 0 };
  let together = false;
  // Is everyone close enough together for one map of the sun's shadows, and
  // where is the middle of them? Once a frame, before the parts are drawn.
  function gather() {
    _middle.set(0, 0, 0);
    for (const h of everyone) _middle.add(h.pos);
    _middle.multiplyScalar(1 / everyone.length);
    // (not while you look out of your own eyes: your body isn't drawn in
    // your part, nor would its shadow be in theirs)
    together = !player.fromEye;
    for (const h of everyone) together &&= Math.hypot(h.pos.x - _middle.x, h.pos.z - _middle.z) <= SHADOWS_SHARED;
  }
  // Would the scene be drawn from where it was for the part before (so that
  // the shadows drawn then still fall where they did)? origin.js moves only
  // for a camera more than its snap away.
  const sameOrigin = (eye: THREE.Vector3) => Math.abs(eye.x - origin.x) <= origin.snap && Math.abs(eye.z - origin.z) <= origin.snap;
  function look(k: number) {
    const me = everyone[k];
    for (const h of everyone) h.character.hips.visible = !(h === me && h.fromEye);
    grass.only(me.pos.x, me.pos.z);
    if (together) sky.aim(_middle, (k === 0 ? camera : others[k - 1].camera).position);
    if (k === 0) {
      yourWater.wade = WADE.uWade.value;
      yourWater.flowX = WADE.uWadeFlow.value.x;
      yourWater.flowZ = WADE.uWadeFlow.value.y;
      yourWater.under = UNDER.uUnder.value;
      yourWater.level = UNDER.uUnderLevel.value;
      yourWater.sea = UNDER.uUnderSea.value;
      return;
    }
    const o = others[k - 1];
    const eye = o.camera.position;
    SHARED.uPlayer.value.copy(me.pos);
    if (!together) sky.aim(me.pos, eye);
    else if (sameOrigin(eye)) sky.freshShadows(false);
    WADE.uWade.value = o.ripple;
    WADE.uWadeFlow.value.set(me.current.x - me.vel.x, me.current.z - me.vel.z);
    // (as underwater/ has it for you: the camera under the surface, not in a
    // cave that runs under a lake)
    const wet = chunks.waterAt(eye.x, eye.z, _w) && _w.depth > 0;
    const under = wet && eye.y < _w.level - 0.02 && !me.space;
    UNDER.uUnder.value = under ? 1 : 0;
    if (under) {
      UNDER.uUnderLevel.value = _w.level;
      UNDER.uUnderSea.value = gen.sea && Math.abs(_w.level - gen.sea.level) < SEA_NEAR ? 1 : 0;
    }
  }
  function restore() {
    SHARED.uPlayer.value.copy(player.pos);
    sky.freshShadows(true);
    sky.aim(focus, camera.position);
    grass.only(null);
    WADE.uWade.value = yourWater.wade;
    WADE.uWadeFlow.value.set(yourWater.flowX, yourWater.flowZ);
    UNDER.uUnder.value = yourWater.under;
    UNDER.uUnderLevel.value = yourWater.level;
    UNDER.uUnderSea.value = yourWater.sea;
    for (const h of everyone) h.character.hips.visible = !h.fromEye;
  }

  // ── Coming and going ──────────────────────────────────────────────────────
  // Set down beside you: to your right, your left, then further right.
  function bring(o: Someone) {
    const p = player.pos;
    const yaw = player.yaw;
    const side = (o.slot % 2 ? 1 : -1) * Math.ceil(o.slot / 2) * BESIDE;
    const x = p.x + Math.cos(yaw) * side - Math.sin(yaw) * BEHIND;
    const z = p.z - Math.sin(yaw) * side - Math.cos(yaw) * BEHIND;
    o.hiker.spawn(x, z, yaw, player.camYaw, player.space ? p.y : Infinity);
    o.waiting = false;
  }

  // Someone new: whoever was on that part of the screen last time, with
  // their camera as they had it; or the first of the hikers nobody is yet.
  function join(pad: number, slot: number) {
    const id = cast(ids(), everyone.map(whoOf), kept[slot] ?? null);
    const eye = new THREE.PerspectiveCamera(FOV, camera.aspect, camera.near, camera.far);
    const controls = new PadControls(pad);
    const h = new Player({ scene, camera: eye, world: chunks, input: controls, solids, spaces, basins, who: hiker(id) });
    // what keeps your camera out of walls and roofs keeps theirs out too
    h.cameraBlockers = player.cameraBlockers;
    h.lockCamera = locked[slot] ?? LOCKED;
    const o: Someone = { pad, slot, controls, hiker: h, camera: eye, ripple: 0, waiting: true, hud: new PartHud() };
    o.hud.offer(panelOf(o));
    others.push(o);
    everyone = [...everyone, h];
    followed.add(h.pos);
    if (!game.covered) bring(o);
    label(o);
    hud.flash(`${nameOf(h)} joins in`);
    o.hud.flash(`${nameOf(h)} · ${padName('PadStart', controls.kind)} for your settings`, 4000);
  }

  function leave(o: Someone) {
    followed.delete(o.hiker.pos);
    scene.remove(o.hiker.character.root);
    o.hiker.character.dispose();
    o.hud.dispose();
    others.splice(others.indexOf(o), 1);
    everyone = everyone.filter((h) => h !== o.hiker);
    hud.flash(`${nameOf(o.hiker)}'s pad is gone`);
  }

  // ── The help panel ────────────────────────────────────────────────────────
  commands.describe({ group: 'SPLIT SCREEN', help: '2 to 4 pads', label: 'a part of the screen each' });
  commands.describe({ group: 'SPLIT SCREEN', help: 'select', pad: ['PadSelect'], label: 'on the other pads: be someone else' });
  commands.describe({ group: 'SPLIT SCREEN', help: 'start', pad: ['PadStart'], label: 'on the other pads: their own settings' });

  // ── Each frame ────────────────────────────────────────────────────────────
  // After you've moved (the player feature's system), and before the world
  // grows round where everyone now is.
  const only = new Set<number>();
  let last: { x: number; z: number } | null = null;
  game.addSystem({
    name: 'splitscreen',
    phase: 'update',
    update({ dt }) {
      // Who has a pad: the first is yours, each of the rest someone else's.
      const present = pads.present;
      const n = Math.min(MOST, present.length);
      if (n >= 2 && !(pads.only === only && only.size === 1 && only.has(present[0]))) {
        only.clear();
        only.add(present[0]);
        pads.only = only;
      } else if (n < 2 && pads.only === only) pads.only = null;
      let changed = false;
      for (let k = others.length - 1; k >= 0; k--) {
        const o = others[k];
        const at = present.indexOf(o.pad);
        if (at < 1 || at >= n) {
          leave(o);
          changed = true;
        } else if (at !== o.slot) {
          o.slot = at;
          changed = true;
        }
      }
      for (let i = 1; i < n; i++) {
        if (others.some((o) => o.pad === present[i])) continue;
        join(present[i], i);
        changed = true;
      }
      if (changed) {
        others.sort((a, b) => a.slot - b.slot);
        shape();
      }
      if (!others.length) {
        last = null;
        return;
      }

      // While something else is drawn over everything (the map, a place of
      // its own), the others wait where they are.
      const covered = game.covered;
      frame(!covered);
      if (!covered) {
        const p = player.pos;
        const jumped = last !== null && Math.hypot(p.x - last.x, p.z - last.z) > TELEPORT;
        for (const o of others) {
          const left = Math.hypot(o.hiker.pos.x - p.x, o.hiker.pos.z - p.z) > TOO_FAR;
          if (o.waiting || jumped || left) bring(o);
          if (left) o.hud.flash(`back beside ${nameOf(player)}`);
        }
        last ??= { x: 0, z: 0 };
        last.x = p.x;
        last.z = p.z;
      }
      for (const o of others) {
        o.controls.read();
        if (covered) continue;
        buttons(o);
        label(o);
        o.hiker.update(dt);
        o.ripple += (o.hiker.ripple - o.ripple) * (1 - Math.exp(-dt * RIPPLE_EASE));
        o.hud.update(o.hiker.pos, o.hiker.camYaw, sky.hours, hud.guided);
      }
      gather();
    },
  });

  // ── For the console (and the play-through) ────────────────────────────────
  game.provide('splitscreen', {
    get count() {
      return others.length + 1;
    },
    get others() {
      return others.map((o) => ({ pad: o.pad, who: whoOf(o.hiker), hiker: o.hiker, behind: o.hiker.lockCamera, panel: o.hud.menu.isOpen }));
    },
  });
}
