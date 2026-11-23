// A split screen: two, three or four people in one forest on one screen, a
// game controller each.
//
// Plug in a second pad and press a button on it (the browser shows a page no
// pad until then), and the screen splits in two; a third, in three; a fourth,
// in quarters (layout.js). The first pad, with the keyboard and the mouse, is
// the hiker you already are, with everything you can do. Each other pad is
// somebody else, another of the hikers (player/hikers.js), set down beside
// you: they walk, run, jump, swim and dive, and look about, with a camera of
// their own on their own part of the screen. Tools, rides, the map and the
// pack are still only yours: everything else the game does is done by and
// for the first hiker. Unplug a pad and whoever it was goes; with one left,
// the screen is whole again.
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
//   - your HUD keeps to your part of the screen (#hud's box, index.html)
//
// What goes by where you are and nothing else (the animals, the towns, what
// is heard) still goes by you alone.

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import type { Part } from '../render/views.ts';
import { Player } from '../player/player.js';
import { HIKERS, hiker } from '../player/hikers.js';
import { padName } from '../player/gamepad.js';
import { SHARED, WADE, UNDER } from '../render/uniforms.js';
import { waterSample } from '../core/geom.js';
import { PadControls } from './pad.js';
import { layout, cast, next, MOST } from './layout.js';
import './splitscreen.css';

// Somebody on another part of the screen, as the console sees them.
export interface Other {
  pad: number; // which pad is theirs (Gamepad.index)
  who: string; // which hiker they are (an id in player/hikers.js)
  hiker: Player;
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

const _w = waterSample();

interface Someone {
  pad: number;
  slot: number; // which part of the screen is theirs: 1, 2 or 3 (0 is yours)
  controls: PadControls;
  hiker: Player;
  camera: THREE.PerspectiveCamera;
  ripple: number; // eased (RIPPLE_EASE)
  waiting: boolean; // joined while something else was drawn: set down once it isn't
  part: HTMLElement;
  who: HTMLElement;
  said: string; // what `who` says, as last written
}

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player'];
export function installSplitscreen(game: Game) {
  const { scene, camera, chunks, gen, solids, spaces, basins, sky, hud, commands, settings, views, pads, player, followed, focus } = game;

  const others: Someone[] = [];
  let everyone: Player[] = [player];
  const FOV = camera.fov; // (as it is before anyone has zoomed into their eyes)
  const ids = () => HIKERS.map((h: { id: string }) => h.id);
  const whoOf = (h: Player): string => h.character.who.id;

  // Who was last on each part of the screen (1, 2, 3), remembered by this
  // browser, so that the same pad is the same hiker next time.
  const remembered = settings.get('splitHikers', 'object');
  const kept: Array<string | null> = Array.isArray(remembered) ? remembered.map((id: unknown) => (typeof id === 'string' ? id : null)) : [];
  const remember = (o: Someone) => {
    kept[o.slot] = whoOf(o.hiker);
    settings.set('splitHikers', kept.slice());
  };
  // Whether the others' cameras are locked behind them (player.js: one stick
  // does it all, which is easier for small hands). Their own; on by default.
  let behind: boolean = settings.get('splitBehind', 'boolean') ?? true;

  // ── On the screen ─────────────────────────────────────────────────────────
  // A thin dark line round each part, and on each of the others' parts who
  // that is and what their pad does. Your HUD keeps to your own part.
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

  // Who someone is, and what their pad's spare buttons do, in their part.
  function label(o: Someone) {
    const kind = o.controls.kind;
    const name = o.hiker.character.who.name;
    const said = `${name}|${kind}|${player.character.who.name}`;
    if (said === o.said) return;
    o.said = said;
    const b = document.createElement('b');
    b.textContent = name;
    const i = document.createElement('i');
    i.textContent = `${padName('PadSelect', kind)} · someone else   ${padName('PadStart', kind)} · back beside ${player.character.who.name}`;
    o.who.replaceChildren(b, i);
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
    others.forEach((o, i) => place(o.part, rects[i + 1]));
    box.replaceChildren(yours, ...others.map((o) => o.part));
    frame(!game.covered, true);
  }
  addEventListener('resize', () => {
    if (others.length) shape();
  });

  // ── Each part as it's drawn ───────────────────────────────────────────────
  // Yours is drawn first, as the frame left everything; each other part is
  // drawn as it would be if its hiker were you, and then everything is put
  // back as it was.
  const yourWater = { wade: 0, flowX: 0, flowZ: 0, under: 0, level: 0, sea: 0 };
  function look(k: number) {
    const me = everyone[k];
    for (const h of everyone) h.character.hips.visible = !(h === me && h.fromEye);
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
    sky.aim(me.pos, eye);
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
    sky.aim(focus, camera.position);
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

  function join(pad: number, slot: number) {
    const id = cast(ids(), everyone.map(whoOf), kept[slot] ?? null);
    const eye = new THREE.PerspectiveCamera(FOV, camera.aspect, camera.near, camera.far);
    const controls = new PadControls(pad);
    const h = new Player({ scene, camera: eye, world: chunks, input: controls, solids, spaces, basins, who: hiker(id) });
    // what keeps your camera out of walls and roofs keeps theirs out too
    h.cameraBlockers = player.cameraBlockers;
    h.lockCamera = behind;
    const part = document.createElement('div');
    part.className = 'part';
    const who = document.createElement('div');
    who.className = 'who';
    part.appendChild(who);
    const o: Someone = { pad, slot, controls, hiker: h, camera: eye, ripple: 0, waiting: true, part, who, said: '' };
    others.push(o);
    everyone = [...everyone, h];
    followed.add(h.pos);
    if (!game.covered) bring(o);
    remember(o);
    label(o);
    hud.flash(`${h.character.who.name} joins in`);
  }

  function leave(o: Someone) {
    followed.delete(o.hiker.pos);
    scene.remove(o.hiker.character.root);
    o.hiker.character.dispose();
    o.part.remove();
    others.splice(others.indexOf(o), 1);
    everyone = everyone.filter((h) => h !== o.hiker);
    hud.flash(`${o.hiker.character.who.name}'s pad is gone`);
  }

  // Be the next hiker nobody else is.
  function change(o: Someone) {
    const id = next(ids(), whoOf(o.hiker), everyone.filter((h) => h !== o.hiker).map(whoOf));
    if (id === whoOf(o.hiker)) return;
    o.hiker.be(hiker(id));
    remember(o);
  }

  // Everyone somebody different, while there's somebody left to be (you may
  // have just become who one of the others is, on the settings panel).
  function apart() {
    for (let k = 1; k < everyone.length; k++) {
      const id = whoOf(everyone[k]);
      if (!everyone.slice(0, k).some((h) => whoOf(h) === id)) continue;
      const free = ids().find((c) => !everyone.some((h) => whoOf(h) === c));
      if (!free) return;
      everyone[k].be(hiker(free));
      remember(others[k - 1]);
    }
  }

  // ── Settings, and the help panel ──────────────────────────────────────────
  hud.setting({
    id: 'split-camera-behind',
    group: 'SPLIT SCREEN',
    label: "the other pads' cameras locked behind them",
    get: () => behind,
    set(on: boolean) {
      behind = on;
      settings.set('splitBehind', on);
    },
  });
  commands.describe({ group: 'SPLIT SCREEN', help: '2 to 4 pads', label: 'a part of the screen each' });
  commands.describe({ group: 'SPLIT SCREEN', help: 'select', pad: ['PadSelect'], label: 'on the other pads: be someone else' });
  commands.describe({ group: 'SPLIT SCREEN', help: 'start', pad: ['PadStart'], label: 'on the other pads: back beside you' });

  // ── Each frame ────────────────────────────────────────────────────────────
  // After you've moved (the player feature's system), and before the world
  // grows round where everyone now is.
  const only = new Set<number>();
  let yourId = whoOf(player);
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
      if (whoOf(player) !== yourId) {
        yourId = whoOf(player);
        apart();
      }

      // While something else is drawn over everything (the map, a place of
      // its own), the others wait where they are.
      const covered = game.covered;
      frame(!covered);
      if (!covered) {
        const p = player.pos;
        const jumped = last !== null && Math.hypot(p.x - last.x, p.z - last.z) > TELEPORT;
        for (const o of others) if (o.waiting || jumped || Math.hypot(o.hiker.pos.x - p.x, o.hiker.pos.z - p.z) > TOO_FAR) bring(o);
        last ??= { x: 0, z: 0 };
        last.x = p.x;
        last.z = p.z;
      }
      for (const o of others) {
        o.controls.read();
        if (covered) continue;
        if (o.controls.pressed('PadSelect')) change(o);
        if (o.controls.pressed('PadStart')) bring(o);
        label(o);
        o.hiker.lockCamera = behind;
        o.hiker.update(dt);
        o.ripple += (o.hiker.ripple - o.ripple) * (1 - Math.exp(-dt * RIPPLE_EASE));
      }
    },
  });

  // ── For the console (and the play-through) ────────────────────────────────
  game.provide('splitscreen', {
    get count() {
      return others.length + 1;
    },
    get others() {
      return others.map((o) => ({ pad: o.pad, who: whoOf(o.hiker), hiker: o.hiker }));
    },
  });
}
