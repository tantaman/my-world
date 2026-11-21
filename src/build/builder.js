// The work bench: whichever tool is in your hands, what the crosshair is on,
// and the swing, the hold and the prompt that every tool shares.
//
// The tools themselves are plug-ins (src/build/tools/). The bench knows
// nothing about any one of them; adding a tool is a file there and a
// builder.register(tool) (see src/build/index.js).
//
// ── What a tool is ──────────────────────────────────────────────────────────
//
//   {
//     id: 'axe', label: 'axe', short: 'axe',   // short: its name on a narrow tool bar
//     kit: 'cabin',           // optional: the kit it goes in (see Kits, below)
//
//     // Every frame: what would a click do, here, now?  -> null (nothing to
//     // say), or { prompt, ok?, bad?, node?, ...whatever work() wants }.
//     //   prompt  HTML for the line above the tool bar. Write it for a mouse
//     //           (<b>click</b>, <b>hold click</b>, <b>right-click</b>,
//     //           <b>G</b>): the bench renames the buttons on a touch screen.
//     //   ok      a click would do it
//     //   bad     it can't be done, and the prompt says why (shown in red)
//     //   node    { x, z } the grid node aimed at (for tools with `grid`)
//     //   progress  0..1 for the bar over the prompt, while no press-and-
//     //           hold is under way (how far a fish has been reeled in)
//     target(b) {},
//
//     // Every frame no swing is under way: act on the buttons.
//     //   io = { use, alt, useTap, altTap, dt }   held / pressed this frame
//     // -> true while busy (digging, say), which slows you to a shuffle.
//     work(b, t, io) {},
//
//     // optional
//     setup(b) {},            // once, when registered: make ghosts and props
//     preview(b, t, dt) {},   // every frame it is in hand: show what would happen
//     update(b, dt) {},       // every frame, in hand or not
//     put(b) {},              // on putting it down, and on Esc: drop anything half-done
//     held: { name, make, rest, elbow },   // what the hiker carries (see Character.addHeld)
//     afloat: true,           // can be used out in a boat (see boats/), not only on foot
//     stake: true,            // works to the grade stake: G and the grade plane apply
//     grid: true,             // snaps to the 1 m grid: show the nodes around t.node
//     roofs: true,            // can aim at roofs (otherwise the crosshair goes through them)
//   }
//
// `b` is the bench (this class). What a tool may use of it:
//
//   aimO, aimD     the crosshair ray       ground   { t, p } where it meets the ground
//   aimPoint       ...or a built piece     piece    the built piece it meets, if any
//   chunks, player, input, hud, sound, scene, camera
//   terrain, forest, buildings, obstacles, stake, previews, chips, inv
//   have / spend / gain (kind, n)          materials (see inventory.js)
//   dist(x, z)     how far you are from a spot
//   face(x, z)     turn the hiker toward the work
//   swing(anim, dur, hitAt, onHit)         one swing; onHit runs as it lands
//   holding(key, dur, dt) -> done          press-and-hold work, with the progress bar
//   dropHold()     let go of it
//   deny(t)        the "can't" thud, and a nudge of the prompt
//   digNoise(dt, kind, at, color)          the scrape and clods of spade work
//   regrow(x, z, pad)                      the turf changed here
//   flash(message)                         a word on the HUD
//
// ── Kits ────────────────────────────────────────────────────────────────────
//
// Tools that go together share a kit: the log wall, the timber wall and the
// roof are the 'cabin'. A kit is one slot on the tool bar and one number key.
// Pressing it takes up the tool last used from the kit; pressing it again,
// with one of them in hand, moves on to the next. A tool with no kit is a kit
// of its own, and a tool whose kit is already there joins the end of it. Kits
// sit on the bar in the order their first tools were registered.
//
//   builder.kits     [{ id, label, tools, last }]   label: the kit's name, or
//                    a lone tool's own; last: the tool it gives you next
//   builder.pick(i)  the number key for the kit at i (from 0) was pressed
//   builder.slotOf(id) -> the tool's number on the bar (from 1)
//
// While something else has the hiker's hands (builder.idleWhile(fn): riding,
// say) the bench stands idle: no aiming, no work, no prompt, and the tool is
// put away until it is over.
//
// Emits:
//   'change'   ()        something about the world, or what you carry, changed
//   'tools'    (tools)   the set of tools (and so of kits) changed
//   'select'   (tool)    picked, or picked again

import * as THREE from 'three';
import { Emitter } from '../core/events.js';
import { groundRay } from './aim.js';
import { REACH } from './constants.js';

const AIM_RANGE = 45; // metres the crosshair reaches

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _ndc = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();

export class Builder extends Emitter {
  constructor({ scene, camera, chunks, player, input, hud, sound, grass, terrain, forest, buildings, obstacles, stake, previews, chips, inventory }) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.chunks = chunks;
    this.player = player;
    this.input = input;
    this.hud = hud;
    this.sound = sound;
    this.grass = grass;
    this.terrain = terrain;
    this.forest = forest;
    this.buildings = buildings;
    this.obstacles = obstacles;
    this.stake = stake;
    this.previews = previews;
    this.chips = chips;
    this.stock = inventory;

    this.tools = [];
    this.kits = []; // see Kits, above
    this.current = null; // the tool in hand
    this.tgt = null; // what it would do right now
    this.act = null; // a swing in progress
    this.hold = null; // a press-and-hold in progress
    this.digSound = 0;
    this.aimO = new THREE.Vector3();
    this.aimD = new THREE.Vector3(0, 0, -1);
    this.ground = null;
    this.piece = null;
    this.aimPoint = null;
    this._idleWhen = [];
    this.idle = false;
  }

  // While fn() is true, the hiker's hands are taken and the bench stands idle.
  idleWhile(fn) {
    this._idleWhen.push(fn);
  }

  // ── Tools ─────────────────────────────────────────────────────────────────
  register(tool) {
    if (this.tools.some((t) => t.id === tool.id)) throw new Error(`tool "${tool.id}" is already registered`);
    this.tools.push(tool);
    const kit = tool.kit && this.kits.find((k) => k.id === tool.kit);
    if (kit) {
      kit.tools.push(tool);
      kit.label = kit.id;
    } else this.kits.push({ id: tool.kit || tool.id, label: tool.label, tools: [tool], last: tool });
    if (tool.held) this.player.character.addHeld(tool.held.name, tool.held.make(), tool.held);
    if (tool.setup) tool.setup(this);
    this.emit('tools', this.tools);
    if (!this.current) this.select(tool.id, true);
    return tool;
  }

  // The id of the tool in hand.
  get tool() {
    return this.current ? this.current.id : null;
  }

  select(id, quiet = false) {
    const tool = this.tools.find((t) => t.id === id);
    if (!tool) return;
    if (this.current && this.current !== tool && this.current.put) this.current.put(this);
    this.current = tool;
    this.kitOf(tool).last = tool;
    this.player.character.setTool(tool.held && !this.idle ? tool.held.name : null);
    this.emit('select', tool);
    if (!quiet) this.flash(tool.label);
  }

  // The number key for kit i: the tool last used from it or, with one of
  // its tools already in hand, the next.
  pick(i) {
    const kit = this.kits[i];
    if (!kit) return;
    const at = kit.tools.indexOf(this.current);
    this.select((at < 0 ? kit.last : kit.tools[(at + 1) % kit.tools.length]).id);
  }

  kitOf(tool) {
    return this.kits.find((k) => k.tools.includes(tool)) || null;
  }

  slotOf(id) {
    const i = this.kits.findIndex((k) => k.tools.some((t) => t.id === id));
    return i < 0 ? null : i + 1;
  }

  // ── Materials ─────────────────────────────────────────────────────────────
  get inv() {
    return this.stock.amounts;
  }

  get creative() {
    return this.stock.creative;
  }

  have(kind, n) {
    return this.stock.have(kind, n);
  }

  spend(kind, n) {
    this.stock.spend(kind, n);
  }

  gain(kind, n) {
    this.stock.gain(kind, n);
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  update(dt) {
    const tool = this.current;
    if (!tool) return;
    if (this._idle(tool)) {
      this.forest.update(dt);
      this.chips.update(dt);
      for (const t of this.tools) if (t.update) t.update(this, dt);
      this._changed();
      return;
    }
    if (this.input.wasPressed('Escape') && tool.put) tool.put(this);

    this._aim();
    this.tgt = tool.target(this);
    this._work(dt);

    this.forest.update(dt);
    this.chips.update(dt);
    for (const t of this.tools) if (t.update) t.update(this, dt);
    this._preview(dt);
    this._hud();
    this._changed();
  }

  // Are the hiker's hands taken? Going idle puts down whatever was half done
  // and the tool with it; coming back picks the tool up again.
  _idle(tool) {
    const idle = this._idleWhen.some((fn) => fn());
    if (idle === this.idle) return idle;
    this.idle = idle;
    const ch = this.player.character;
    if (idle) {
      if (tool.put) tool.put(this);
      this.act = null;
      this.hold = null;
      this.tgt = null;
      this.player.busy = 0;
      this.player.faceTo = null;
      if (ch.action && ch.action.loop) ch.stop();
      ch.setTool(null);
      this.previews.hideAll();
      this.stake.show(false);
      this.hud.setPrompt('');
      this.hud.setProgress(null);
    } else ch.setTool(tool.held ? tool.held.name : null);
    return idle;
  }

  _changed() {
    if (this.terrain.dirty || this.forest.dirty || this.buildings.dirty || this.stock.dirty || this.stake.dirty) {
      this.terrain.dirty = this.forest.dirty = this.buildings.dirty = this.stock.dirty = this.stake.dirty = false;
      this.emit('change');
    }
  }

  // Where the crosshair points: ground and/or a built piece.
  _aim() {
    _ray.setFromCamera(_ndc, this.camera);
    _o.copy(_ray.ray.origin);
    _d.copy(_ray.ray.direction);
    this.aimO = _o.clone();
    this.aimD = _d.clone();
    this.ground = groundRay(this.chunks, _o, _d, AIM_RANGE);
    const hit = this.buildings.raycast(_o, _d, this.ground ? this.ground.t : AIM_RANGE, !this.current.roofs);
    this.piece = hit;
    this.aimPoint = hit ? _o.clone().addScaledVector(_d, hit.t) : this.ground ? this.ground.p.clone() : null;
  }

  _work(dt) {
    const input = this.input;
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

    if (!this.act) {
      const io = { use: input.holding('use'), alt: input.holding('alt'), useTap: input.tapped('use'), altTap: input.tapped('alt'), dt };
      busy = !!this.current.work(this, this.tgt, io) || busy;
    }

    busy = busy || !!this.act || !!this.hold;
    this.player.busy += ((busy ? 1 : 0) - this.player.busy) * (1 - Math.exp(-dt * 12));
    if (!busy) {
      this.player.faceTo = null;
      const ch = this.player.character;
      if (ch.action && ch.action.loop) ch.stop();
    }
  }

  // ── What tools share ──────────────────────────────────────────────────────
  dist(x, z) {
    return Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
  }

  face(x, z) {
    this.player.faceTo = { x, z };
  }

  flash(message) {
    this.hud.flash(message);
  }

  // One swing of `anim` lasting `dur` seconds; onHit runs `hitAt` of the way
  // through, as it lands. Nothing else can start until it is over.
  swing(anim, dur, hitAt, onHit) {
    this.act = { t: 0, dur, hitAt: dur * hitAt, hit: false, onHit };
    this.player.character.play(anim, dur);
  }

  // Press-and-hold work on `key` (anything that says what is being worked
  // on). Call it every frame the button is down. -> true once, when `dur`
  // seconds have gone in; aiming at something else starts over.
  holding(key, dur, dt) {
    if (!this.hold || this.hold.key !== key) this.hold = { key, t: 0, dur };
    this.hold.t += dt;
    if (this.hold.t < this.hold.dur) return false;
    this.hold = null;
    return true;
  }

  dropHold() {
    this.hold = null;
  }

  deny(t) {
    if (t && t.prompt) this.hud.nudgePrompt();
    this.sound.sfx('deny');
  }

  // The scrape of the spade and a few clods, now and then while digging.
  digNoise(dt, kind, at, color) {
    this.digSound -= dt;
    if (this.digSound > 0) return;
    this.sound.sfx(kind);
    const p = new THREE.Vector3(at.x, this.chunks.heightAt(at.x, at.z) + 0.1, at.z);
    this.chips.burst(p, 6, color, 1.8, 0.5);
    this.digSound = 0.9;
  }

  // The turf changed around (x, z): let the grass regrow from the new ground.
  regrow(x, z, pad) {
    this.grass.touch(x, z, pad);
  }

  // ── Grade stake (G) ───────────────────────────────────────────────────────
  toggleStake() {
    const g = this.ground;
    if (g && this.stake.near(g.p.x, g.p.z, 1.2)) {
      this.stake.pull();
      this.flash('grade stake pulled up');
      return;
    }
    if (!g || this.dist(g.p.x, g.p.z) > REACH.build) {
      this.flash('aim at the ground nearby to set a grade stake');
      return;
    }
    this.stake.set(g.p.x, g.p.y, g.p.z);
    this.flash('grade stake set: the shovel now cuts and fills to this level');
  }

  get datum() {
    return this.stake.datum;
  }

  // ── Showing it ────────────────────────────────────────────────────────────
  _preview(dt) {
    const tool = this.current;
    const t = this.tgt;
    this.previews.hideAll();
    this.stake.show(!!tool.stake);
    if (tool.grid && t && t.node) this.previews.dots.place(t.node.x, t.node.z);
    if (tool.preview) tool.preview(this, t, dt);
  }

  _hud() {
    const t = this.tgt;
    let prompt = t ? t.prompt || '' : '';
    if (this.input.isTouch && prompt) {
      // name the on-screen buttons instead of mouse buttons
      prompt = prompt
        .replace(/<b>hold click<\/b>/g, '<b>hold use</b>')
        .replace(/<b>hold right-click<\/b>/g, '<b>hold alt</b>')
        .replace(/<b>click<\/b>/g, '<b>use</b>')
        .replace(/<b>right-click<\/b>|<b>right<\/b>/g, '<b>alt</b>')
        .replace(/<b>G<\/b>/g, '<b>stake</b>');
    }
    this.hud.setPrompt(prompt, t && t.bad);
    this.hud.setProgress(this.hold ? this.hold.t / this.hold.dur : t && Number.isFinite(t.progress) ? t.progress : null);
    this.hud.setInventory(this.stock.line());
  }
}
