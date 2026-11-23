// Third-person explorer: movement, simple physics, collision with trunks and
// boulders, and an orbiting follow camera that stays out of the hillside.
// In water you wade, slower the deeper it gets, and the current leans on you
// the deeper you're in it; where it's too deep to stand you swim: you float
// with your head and shoulders out, and running water carries you along.
//
// Out of your depth on your own, you can dive (input.diving(): shift, as
// something that flies stoops), and come up again (jump). Under the surface you swim the way the camera looks, up and
// down as well as along, lying flat in the water as you go; let go and you
// drift slowly back up. The camera follows you under, and stays on whichever
// side of the surface your head is.
//
// Something can carry you instead (player.carrier: a mount). Then it's its
// speeds, its depth, its width and head room that count, and if it flies,
// space climbs and shift stoops. Or something else can move you itself
// (player.aboard): a train you sit in, going where it goes whatever you do,
// or skis that you steer, which work out for themselves where that takes you.
//
// Under the ground, in a cave (world/spaces.js), its floor is what you stand
// on, its walls and roof keep you in, and the camera keeps to its air.
//
// Something you stand on can move (player.deck: a ship under way). What's
// solid of it stays where it was made solid, and it's drawn where it is now;
// while it carries you, you go about on it where it's solid, and are put
// where that is on it now. So it carries you, and turns you with it.
//
// Water held up in something built (world/basins.js: a pool, a hot tub) is
// waded and swum in like the land's, where your feet are about as high as it.
//
// Zoomed in past the nearest the camera comes, it goes into your head and
// you look out of your own eyes (firstPerson); zoomed out, it comes back out.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Character } from './character.js';
import { lerp, clamp, smoothstep } from '../noise.js';
import { Emitter } from '../core/events.js';
import { segDist, waterSample, wrapAngle as wrap } from '../core/geom.js';
import { Rides } from './rides.ts';

// The heights and depths here are the grown-up hiker's; someone smaller
// (character.size) has them that much smaller: their eyes, their head room,
// how deep the water gets before they float, and how far it drags at them.
const PLAYER_RADIUS = 0.32;
// How high a ledge you can walk onto without jumping. Less than one course of
// a log wall (0.32 m) so walls stay walls; sills and piers set their own
// (higher) step so you can walk in through a doorway over the threshold.
const STEP_UP = 0.28;
const BODY_H = 1.5; // head clearance (a little forgiving under door headers)
// Being walked somewhere (steer): close enough at this many metres, and
// slowing down over the last few so as not to overshoot.
const STEER_ARRIVE = 0.08;
const STEER_EASE = 0.7;
// Water deeper than this floats you: you swim with your feet this far down.
export const SWIM_DEPTH = 1.12;
// Feet more than this far (m) over the water are in the air over it, not in
// it: a jump on a ship's deck far above the sea isn't a swim.
const OVER_WATER = 0.5;
// How much of the current's speed it carries you at: wading in it up to your
// knees (WADE_PUSH depth, m) and over, and swimming.
const WADE_PUSH = [0.15, 0.9];
const PUSH = { wade: 0.3, swim: 0.85 };
const EYE = 1.45; // m above your feet the camera looks at
const EYE_FLAT = 1.1; // ...and lying flat in the water
// Swimming (m/s): along, straight down (dive) and up (jump), and how fast
// you drift up on your own.
const SWIM = { along: 1.3, down: 1.5, up: 1.8, drift: 0.22 };
// How far (m) under floating height you have to be before you swim the way
// the camera looks rather than along the surface.
const UNDER_STEER = 0.6;
// How far the camera's pitch is from looking straight along (radians), before
// you swim upward or downward; and how much under that is still level.
const LEVEL_PITCH = 0.25;
const LEVEL_SLACK = 0.1;
// Lying flat in the water: the feet this far (m) below the body's middle, so
// you can lie on the bed.
const PRONE_DROP = 0.8;
// Where your eyes are above your feet (m), upright (or treading water) and
// lying flat.
const HEAD = [1.6, 1.15];
// How far the camera can pitch (radians): in the air, under water, where
// you can look up at the surface from below, and from your own eyes, where
// nothing behind you has to stay out of the ground.
const PITCH = { air: [-0.35, 1.25], under: [-1.05, 1.25], eye: [-1.35, 1.45] };
// Flying higher than this (m) over the ground, you're above the trunks.
const TRUNK_CLEAR = 10;
// A tap of jump in the air (a touch screen has no holding it) climbs for this long (s).
const FLAP = 0.45;
// A pad's right stick, pushed all the way, turns the camera this fast (rad/s)
// round you and up and down; a held zoom button brings it this many times
// nearer or further each second.
const STICK_TURN = { yaw: 2.4, pitch: 1.4 };
const ZOOM_HOLD = 2.5;
// How near and far the camera can be (m). Zoomed in past the nearest it goes
// into your head; with a held button, once it has been held in there this
// long (s), so as not to go in by overshooting.
const CAM_DIST = [2.2, 16];
const INTO_EYES = 0.35;
// Looking out of your eyes with your head out of the water, they're at least
// this far (m) over it.
const EYE_OVER_WATER = 0.1;
// A notch of the mouse wheel brings the camera this many times nearer.
const WHEEL_STEP = 1.12;
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _right = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _w = waterSample();
const _in = { floor: 0, roof: Infinity };
const _wall = { d: 0, nx: 0, nz: 0 };
// In a cave the camera keeps this far (m) from the rock, looks for it this
// finely along the way back from your head, and comes in as close as it has
// to — right up to your head, if your back is to the wall.
const CAVE_CAM = { clear: 0.25, steps: 16, nearest: 0.15 };
// Moved by something that swings the camera round behind you (aboard.behind),
// it waits this long (s) after you last looked about before it does.
const LOOK_HOLD = 1.5;
// With the camera locked behind you (lockCamera), for someone who'd rather
// not steer it: left and right turn you this fast (rad/s), backing up goes
// at this much of walking pace, the camera looks past your right shoulder
// from this far (m, the grown-up's) to the side, and being carried (aboard)
// or walked somewhere (steer), it swings round behind the way you go this
// quickly (1/s).
const LOCKED = { turn: 2, back: 0.55, shoulder: 0.5, follow: 4 };

// Where someone at (x, z) stands: on the ground, afloat in deep water, or on
// the floor of a space they are in (feet about y; spaces: world/spaces.js).
// world is the ChunkManager.
// depth: how deep it has to be to float them (SWIM_DEPTH for someone on foot).
// basins: water held up in something built (world/basins.js), which floats
// them where it's deep enough; where it isn't, its floor is something built
// they stand on, and the ground under it is the land's.
export function standHeight(world, x, z, depth = SWIM_DEPTH, y = Infinity, spaces = null, basins = null) {
  if (spaces && spaces.at(x, z, y, _in)) return _in.floor;
  if (basins && basins.at(x, z, y, _w) && _w.depth > depth) return _w.level - depth;
  const g = world.heightAt(x, z);
  if (world.waterAt(x, z, _w) && _w.level - g > depth) return _w.level - depth;
  return g;
}


// The walking axes with a stick pushed on the slant, all the way, counted as
// both all the way, as W and A together are: so turning while you walk with
// the camera locked behind you doesn't slow you down. (The round of a
// stick's travel, stretched out to the square of the keys.)
function squared(axes) {
  const most = Math.max(Math.abs(axes.x), Math.abs(axes.y));
  if (most < 1e-4) return axes;
  const k = Math.hypot(axes.x, axes.y) / most;
  axes.x = clamp(axes.x * k, -1, 1);
  axes.y = clamp(axes.y * k, -1, 1);
  return axes;
}

// Emits:
//   'footstep'  (run 0..1)       a heel came down
//   'jump'      ()
//   'takeoff'   ()               something carrying you took to the air
//   'land'      (strength 0..1)
export class Player extends Emitter {
  // world: the ChunkManager (heightAt, waterAt, forEachCollider)
  // solids: built things you bump into and stand on (src/world/solids.js)
  // spaces: places under the ground you can be in (src/world/spaces.js)
  // basins: water held up in something built (src/world/basins.js)
  // who: which hiker you are (hikers.js), if not the first; be() changes it
  constructor({ scene, camera, world, input, solids = null, spaces = null, basins = null, who }) {
    super();
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.solids = solids;
    this.spaces = spaces;
    this.basins = basins;
    // The space you're in (a cave), or null out under the sky.
    this.space = null;
    this.character = new Character(who);
    // Feet find the ground under each of them (terrain, or a sill underfoot).
    this.character.groundAt = (x, z) => this.groundAt(x, z, this.pos.y + 0.02);
    this.character.onFootstep = (run) => this.emit('footstep', run);
    scene.add(this.character.root);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    // the water here: how deep (m, 0 out of it) and which way it runs (m/s)
    this.wade = 0;
    this.current = { x: 0, z: 0 };
    this.yaw = 0; // facing; model faces +z when yaw = 0
    this.grounded = false;
    this.turnRate = 0;

    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 6;
    this.camDistSmooth = 6;
    this.camTarget = new THREE.Vector3();
    // The camera locked behind you, looking the way you face: left and right
    // on the walking keys or stick turn you (and it with you) rather than
    // step sideways, forward walks the way you face and back backs you up.
    // So one stick does it all, with nothing to look about with. Looking
    // about (the mouse, the other stick) turns you too, and still tips the
    // camera up and down.
    this.lockCamera = false;
    this._shoulder = 0; // how far (m) to the side the camera looks from, eased
    this.hasMoved = false;
    // { x, z, yaw }: where the path starts, and where to appear when the
    // world opens (the start, unless a save remembers where you stood).
    this.start = null;
    this.arrival = null;
    // Things other than the hillside that the camera must stay in front of:
    // (origin, dir, maxDist) -> the distance at which the view is blocked.
    this.cameraBlockers = [];
    // While working (chopping, digging) you barely move and face the work.
    this.busy = 0;
    this.faceTo = null; // { x, z } or null
    // How deep the water is where you are (0 on dry land), and whether you're
    // out of your depth and swimming.
    this.wade = 0;
    this.swimming = false;
    // Diving: how far (m) below floating height you are, whether your head is
    // under, the surface over you (m), how flat you lie in the water (0
    // upright .. 1 flat) and how far you're pitched head down (radians).
    this.under = 0;
    this.submerged = false;
    this.surface = 0;
    this.prone = 0;
    this.pitch = 0;
    // The solid you're standing on (a sill, a dock), or null on the ground.
    // One with a `surface` says what your footsteps sound like on it.
    this.underfoot = null;
    this.groundSolid = null; // ...and the one the last groundAt() found
    // Something else can walk you: { x, z, run } to head for, or null (the
    // blueprint foreman sets it). Your own keys or stick always win, and
    // `manual` says whether they moved you this frame.
    this.steer = null;
    this.manual = false;
    // What carries you (carrier) and what moves you (aboard), below, are one
    // at a time and somebody's: a ride asks for you with rides.take(), and
    // these two are set for it (rides.ts). Nothing else sets them.
    this.rides = new Rides(this);
    // Something carrying you, or null on your own two feet. Player only
    // needs to know how it moves, not what it is (its owner draws it):
    //   walk, run      m/s on the ground (run: with shift)
    //   swim, swimRun  m/s out of its depth (swimRun: with shift, if faster)
    //   depth          deeper than this (m) it swims, feet this far under
    //   jump           take-off speed (m/s), 0 if it can't
    //   radius         how wide it is, to trunks and walls (m)
    //   height         head room it needs, rider and all (m)
    //   eye            how high above its feet the camera looks (m)
    //   back           how much further back the camera sits to take it in (m)
    //   agility        how quickly it gets up to speed (1/s)
    //   turn           how quickly it turns the way it's going (1/s)
    //   push           how much of the current carries it (0..1)
    //   keel           if it floats (a boat): the water it needs (m). It goes
    //                  no further where it's shallower, but runs aground and
    //                  slides along the shore; from somewhere shallower still
    //                  (pulled up on the bank) it can only go out, not in
    //   bow            ...and how far ahead of its middle (m) the water has
    //                  to be deep enough too, the way it's going
    //   fly            null, or { cruise, fast, climb, glide, dive, ceiling,
    //                  agility }: m/s along and up (glide and dive sink, so
    //                  are negative), and how high over the ground it goes (m)
    //   landing        set by its owner while it comes down to land
    this.carrier = null;
    // Something that moves you itself (a train, skis), or null. Your keys
    // don't move you while it does (it may read them itself, as skis do,
    // before a jump is taken from you so you don't jump off): each frame it
    // says where you are, and the camera comes along and turns as it turns.
    //   posesCharacter  true while the ride places and animates the hiker
    //                   in a separate scene
    //   slack           put further than this (m) from where it last had
    //                   you (a teleport), you're out of it: its ride is told
    //                   ('moved'). Left out, that's the ride's own business
    //   place(out, dt)  fills out.x, out.y, out.z (where your feet are),
    //                   out.yaw (which way you face), and if it likes:
    //     heading    which way you're going, for the camera to turn with,
    //                if not the way you face (spinning in the air)
    //     grounded   false while you're off the ground (in the air)
    //     behind     how quickly (1/s) the camera swings round behind the
    //                way you're going, when you aren't looking about
    //     back       how much further back the camera sits (m)
    //     wade       how deep in the water you sit (m), if you're in it (a
    //                tube on a river), for the ripples round you and the
    //                sound of the water going by
    //     flowX, flowZ  ...and which way it runs (m/s)
    this.aboard = null;
    this._at = { x: 0, y: 0, z: 0, yaw: 0, heading: undefined, grounded: true, behind: 0, back: 0, wade: 0, flowX: 0, flowZ: 0 };
    this._rode = false;
    this._heading = 0;
    this._looked = 0; // s since you last looked about, while aboard
    // Something you stand on that moves, or null:
    //   still      { x, z, yaw }: where what's solid of it is (its own
    //              frame there, as world/frame.js's toWorld has it)
    //   at         { x, z, yaw }: where it is now, and drawn
    // While it's set, you move about against what's solid of it at `still`,
    // and are put where that is on it `at` now. Who sets it sets it while
    // you're on it, and only then: set, you're taken to be standing on what's
    // solid of it (as you are, until it moves).
    this.deck = null;
    this._deckAt = null; // where the deck was when you were last put on it
    // Something held up to the eye (a rifle's scope), or null. While there
    // is one the camera looks out from your eyes the way it was looking,
    // `zoom` times closer, and the mouse turns the view `zoom` times more
    // finely.
    //   { zoom }
    this.sight = null;
    // Looking out of your own eyes rather than from behind you: zoomed in
    // past the nearest the camera comes. Not while something moves you
    // itself (aboard: a train, a plane, skis), which shows you riding it;
    // you're back behind your eyes when you get off. (fromEye says whether
    // the camera is there now, for this or a sight.)
    this.firstPerson = false;
    this._intoEyes = 0; // s a zoom button has been held in at the nearest
    this._ownFov = null; // the field of view to go back to (degrees), while from the eye
    // carried through the air, and climbing (jump held, or tapped just now)
    this.flying = false;
    this.climbing = false;
    this._flap = 0;
  }

  // How far your feet are above the ground under them (m).
  get height() {
    return this.pos.y - this.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05);
  }

  // Ground height under (x, z) for feet at y: terrain, the floor of a cave,
  // or the top of something built.
  // (Which solid that was, if any, is left in this.groundSolid.) afloat: in
  // deep water, where you float rather than the bed.
  groundAt(x, z, y = Infinity, afloat = true) {
    let g = afloat ? standHeight(this.world, x, z, this.carrier ? this.carrier.depth : this.swimDepth, y, this.spaces, this.basins) : this.world.heightAt(x, z);
    this.groundSolid = null;
    if (this.solids) {
      this.solids.forEachNear(x, z, 1, (s) => {
        segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
        if (_seg.d > s.r + 0.08) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (top > g && y >= top - (s.step ?? STEP_UP)) {
          g = top;
          this.groundSolid = s;
        }
      });
    }
    return g;
  }

  // How tall you are, beside the grown-up hiker (1).
  get size() {
    return this.character.size;
  }

  // How deep the water is before it floats you, on your own.
  get swimDepth() {
    return SWIM_DEPTH * this.character.size;
  }

  // Be someone else (one of hikers.js), wherever you are and whatever you're
  // holding.
  be(who) {
    this.character.dress(who);
  }

  // Appear where a world opens. Call once the ground there has streamed in.
  arrive() {
    const a = this.arrival;
    this.spawn(a.x, a.z, a.yaw ?? 0, a.camYaw, a.y);
    if (typeof a.camPitch === 'number') this.camPitch = a.camPitch;
  }

  // Stand at (x, z), on the ground, or with y, on whatever floor is about
  // that high there (a cave's, under the hill).
  spawn(x, z, yaw, camYaw = yaw + Math.PI, y = Infinity) {
    if (this.spaces) this.spaces.ensure(x, z);
    this.pos.set(x, this.groundAt(x, z, Number.isFinite(y) ? y + 0.3 : Infinity), z);
    this.space = this.spaces ? this.spaces.at(x, z, this.pos.y + 0.05) : null;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.camYaw = camYaw;
    this.camTarget.set(x, this.pos.y + this.eye, z);
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = yaw;
    this.updateCamera(1 / 60, true);
  }

  // Stand at (x, z) of the deck's still frame (where what's solid of it is),
  // and so wherever that is on it now. (Without a deck, as spawn.)
  spawnOnDeck(x, z, yaw, camYaw = yaw + Math.PI, y = Infinity) {
    const d = this.deck;
    this.spawn(x, z, yaw, camYaw, y);
    if (!d) return;
    this._moveFrame(d.still, d.at);
    this._deckAt = { x: d.at.x, z: d.at.z, yaw: d.at.yaw };
  }

  get eye() {
    return this.carrier ? this.carrier.eye : lerp(EYE, EYE_FLAT, this.prone) * this.size;
  }

  // Is the camera looking out of your eyes: first person, or through a sight?
  get fromEye() {
    return !!this.sight || (this.firstPerson && !this.aboard);
  }

  // Zoom by f (under 1 nearer, over 1 further). Past the nearest, into your
  // eyes; out of them, back to the nearest. Aboard something, only the
  // camera behind you zooms, and zooming out puts first person by.
  _zoom(f) {
    const eyes = this.firstPerson && !this.aboard;
    if (f > 1) this.firstPerson = false;
    if (eyes) {
      if (f > 1) this.camDist = CAM_DIST[0];
      return;
    }
    if (f < 1 && this.camDist <= CAM_DIST[0] && !this.aboard) this.firstPerson = true;
    else this.camDist = clamp(this.camDist * f, ...CAM_DIST);
  }

  update(dt) {
    const d = this.deck;
    if (!d) {
      this._deckAt = null;
      return this._update(dt);
    }
    // onto the deck where it's solid, as it was when you were last put on it
    // (just set, you're on it there already)...
    this._moveFrame(this._deckAt || d.still, d.still);
    this._update(dt);
    // ...and back to where that is on it now
    this._moveFrame(d.still, d.at);
    this._deckAt = { x: d.at.x, z: d.at.z, yaw: d.at.yaw };
  }

  // Everything about you placed relative to `from` ({ x, z, yaw }), placed
  // the same relative to `to` instead: where you are and look from, which
  // way you face and move.
  _moveFrame(from, to) {
    const turn = to.yaw - from.yaw;
    if (!turn && from.x === to.x && from.z === to.z) return;
    const cf = Math.cos(from.yaw);
    const sf = Math.sin(from.yaw);
    const ct = Math.cos(to.yaw);
    const st = Math.sin(to.yaw);
    const move = (v) => {
      const dx = v.x - from.x;
      const dz = v.z - from.z;
      const lx = dx * cf - dz * sf;
      const lz = dx * sf + dz * cf;
      v.x = to.x + lx * ct + lz * st;
      v.z = to.z - lx * st + lz * ct;
    };
    move(this.pos);
    move(this.camTarget);
    move(this.camera.position);
    move(this.character.root.position);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const vx = this.vel.x;
    this.vel.x = vx * c + this.vel.z * s;
    this.vel.z = -vx * s + this.vel.z * c;
    this.yaw += turn;
    this.camYaw += turn;
    this._heading += turn;
    this.character.root.rotation.y += turn;
    _turn.setFromAxisAngle(_up, turn);
    this.camera.quaternion.premultiply(_turn);
  }

  _update(dt) {
    const input = this.input;
    const c = this.carrier;
    const look = input.consumeLook();
    const stick = input.lookRate(); // a pad's right stick: a rate, not a distance
    const steady = this.sight ? Math.max(1, this.sight.zoom) : 1; // through a sight, finer
    const sens = 0.0026 / steady;
    this.camYaw -= look.x * sens + (stick.x * STICK_TURN.yaw * dt) / steady;
    // under water you can look up at the surface from below, and from your
    // eyes, well up and down
    const range = this.fromEye ? PITCH.eye : this.submerged ? PITCH.under : PITCH.air;
    this.camPitch = clamp(this.camPitch + look.y * sens + (stick.y * STICK_TURN.pitch * dt) / steady, Math.min(range[0], PITCH.under[0]), range[1]);
    if (this.camPitch < range[0]) this.camPitch = lerp(this.camPitch, range[0], 1 - Math.exp(-dt * 5));
    const z = input.consumeZoom();
    if (z) this._zoom(z > 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    const zoomHeld = (input.isDown('zoomOut') ? 1 : 0) - (input.isDown('zoomIn') ? 1 : 0);
    // (held in at the nearest, it waits a moment before going into your eyes)
    const atNearest = zoomHeld < 0 && !this.firstPerson && !this.aboard && this.camDist <= CAM_DIST[0];
    this._intoEyes = atNearest ? this._intoEyes + dt : 0;
    if (zoomHeld && (!atNearest || this._intoEyes >= INTO_EYES)) this._zoom(Math.pow(ZOOM_HOLD, zoomHeld * dt));
    if (input.isDown('turnLeft')) this.camYaw += dt * 1.8;
    if (input.isDown('turnRight')) this.camYaw -= dt * 1.8;
    this.rides.check(); // (whatever had you may find it has lost you)
    if (this.aboard) return this._ride(dt, look.x || look.y || stick.x || stick.y || input.isDown('turnLeft') || input.isDown('turnRight'));
    this._rode = false;

    // Camera-relative movement; or with the camera locked behind you, left
    // and right turn you, and it with you, and you go forward or back the
    // way you face (backing up slower, and never at a run).
    const axes = input.moveAxes();
    let turning = false;
    if (this.lockCamera) {
      squared(axes);
      this.camYaw -= axes.x * LOCKED.turn * dt;
      turning = Math.abs(axes.x) > 1e-4;
      axes.x = 0;
      if (axes.y < 0) axes.y *= LOCKED.back;
    }
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let wx = fx * axes.y + rx * axes.x;
    let wz = fz * axes.y + rz * axes.x;
    let wl = Math.hypot(wx, wz);
    let amount = Math.min(1, wl);
    let running = input.running() && !(this.lockCamera && axes.y < 0);
    this.manual = wl > 1e-4 || turning;
    let steered = false;
    if (this.manual) this.hasMoved = true;
    // ...or, with your hands off the controls, wherever you're being walked
    // (not while something carries you: your hands are on it)
    else if (this.steer && !c) {
      const dx = this.steer.x - this.pos.x;
      const dz = this.steer.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > STEER_ARRIVE) {
        wx = dx;
        wz = dz;
        wl = d;
        amount = Math.min(1, d / STEER_EASE);
        running = !!this.steer.run;
        steered = true;
      }
    }
    if (wl > 1e-4) {
      wx /= wl;
      wz /= wl;
    }
    // water: wading drags at you; swimming is slow, and there's no running.
    // Standing on something built over it (a dock, a boat) you're out of it,
    // and under the ground (in a cave) what is overhead is the land's.
    this.space = this.spaces ? this.spaces.at(this.pos.x, this.pos.z, this.pos.y + 0.05) : null;
    const inWater = !this.space && this._water(this.pos.x, this.pos.z, this.pos.y, _w) && _w.depth > 0 && !(this.underfoot && this.pos.y > _w.level) && this.pos.y < _w.level + OVER_WATER;
    const depth = inWater ? _w.depth : 0;
    const float = c ? c.depth : this.swimDepth;
    const F = c && c.fly;
    this.flying = !!F && !this.grounded;
    this.wade = this.flying ? 0 : depth;
    this.current.x = inWater && !this.flying ? _w.flowX : 0;
    this.current.z = inWater && !this.flying ? _w.flowZ : 0;
    this.swimming = depth > float && !this.flying;
    let speed;
    let push;
    if (c) {
      if (this.flying) speed = (running ? F.fast : F.cruise) * amount;
      else if (this.swimming) speed = (running && c.swimRun ? c.swimRun : c.swim) * amount;
      else speed = (running ? c.run : c.walk) * amount * (1 - 0.5 * smoothstep(float * 0.15, float, depth));
      push = this.flying ? 0 : this.swimming ? c.push : c.push * 0.35 * smoothstep(float * 0.15, float, depth);
    } else {
      const drag = this.swimming ? 0.42 : 1 - 0.5 * smoothstep(0.12 * this.size, 1.0 * this.size, depth);
      const run = running && !this.swimming;
      speed = (run ? CONFIG.runSpeed : CONFIG.walkSpeed) * amount * (1 - this.busy * 0.85) * drag;
      if (this.swimming) speed = SWIM.along * amount;
      push = this.swimming ? PUSH.swim : PUSH.wade * smoothstep(WADE_PUSH[0] * this.size, WADE_PUSH[1] * this.size, depth);
    }
    // On your own, out of your depth: where you'd float, and how far under it
    // you are. Under the surface, forward is the way the camera looks, up or
    // down.
    const diver = !c && this.swimming;
    const floatY = diver ? _w.level - this.swimDepth : -Infinity;
    this.surface = diver ? _w.level : 0;
    this.under = diver ? Math.max(0, floatY - this.pos.y) : 0;
    let climb = 0;
    if (diver && this.under > UNDER_STEER && this.manual) {
      const p = this.camPitch - LEVEL_PITCH;
      const aim = Math.sign(p) * Math.max(0, Math.abs(p) - LEVEL_SLACK);
      const ahead = Math.max(0, axes.y) / Math.max(1e-4, Math.hypot(axes.x, axes.y));
      climb = -Math.sin(aim) * speed * ahead;
      speed *= 1 - (1 - Math.cos(aim)) * ahead;
    }
    // in the water (not still in the air over it)
    const afloat = diver && this.pos.y <= floatY + 0.05;

    const accel = this.flying ? F.agility : diver ? 4 : this.grounded ? (c ? c.agility : 11) : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, wx * speed + this.current.x * push, k);
    this.vel.z = lerp(this.vel.z, wz * speed + this.current.z * push, k);

    if (afloat) {
      // no weight in the water: you go down when you dive, up when you kick
      // up, and otherwise drift slowly back up to float
      const down = input.diving();
      const up = input.isDown('jump');
      input.jumped(); // (no jumping out of your depth)
      let vy = climb;
      if (down && !up) vy = -SWIM.down;
      else if (up && !down) vy = SWIM.up;
      else if (!climb) vy = this.under > 0.02 ? SWIM.drift : 0;
      // coming in from above (a jump, a fall) the water takes it off you
      this.vel.y = lerp(this.vel.y, vy, 1 - Math.exp(-dt * (this.vel.y < -1 && this.under < 1.5 ? 6 : 4)));
      this.climbing = false;
    } else if (F) {
      // jump takes to the air; in it, jump climbs, shift stoops, and
      // otherwise it glides, slowly losing height
      const tapped = input.jumped();
      if (this.grounded && tapped) {
        this.vel.y = F.climb;
        this.grounded = false;
        this.flying = true;
        this.emit('takeoff');
      } else if (this.flying && tapped) this._flap = FLAP;
      this._flap = Math.max(0, this._flap - dt);
      this.climbing = this.flying && !c.landing && (input.isDown('jump') || this._flap > 0);
      if (this.flying) {
        let vy = c.landing ? F.dive * 0.8 : this.climbing ? F.climb : running ? F.dive : F.glide;
        const over = this.height - F.ceiling;
        if (over > 0) vy = Math.min(vy, -over);
        this.vel.y = lerp(this.vel.y, vy, 1 - Math.exp(-dt * 3));
      } else this.vel.y -= CONFIG.gravity * dt;
    } else {
      const jump = c ? c.jump : CONFIG.jumpSpeed;
      if (this.grounded && jump > 0 && input.jumped() && !this.swimming) {
        this.vel.y = jump;
        this.grounded = false;
        this.emit('jump');
      }
      this.climbing = false;
      this.vel.y -= CONFIG.gravity * dt;
    }

    // Integrate
    const wasX = this.pos.x;
    const wasZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Collide with trunks / boulders (circle push-out), unless flying over
    // them, or under the hill they stand on, in a cave
    const radius = c ? c.radius : PLAYER_RADIUS;
    const above = this.flying && this.pos.y - this.world.heightAt(this.pos.x, this.pos.z) > TRUNK_CLEAR;
    if (!above && !this.space) this.world.forEachCollider(this.pos.x, this.pos.z, (cx, cz, r) => {
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d = Math.hypot(dx, dz);
      const min = r + radius;
      if (d < min && d > 1e-5) {
        const push = (min - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
        // remove velocity into the obstacle
        const nx = dx / d;
        const nz = dz / d;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx;
          this.vel.z -= vn * nz;
        }
      }
    });

    // Walls, footings, felled trunks: push out of anything that's not underfoot.
    if (this.solids) {
      const head = c ? c.height : BODY_H * this.size;
      this.solids.forEachNear(this.pos.x, this.pos.z, 1.2 + radius, (s) => {
        segDist(this.pos.x, this.pos.z, s.ax, s.az, s.bx, s.bz, _seg);
        const min = s.r + radius;
        if (_seg.d >= min) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (this.pos.y >= top - (s.step ?? STEP_UP) || this.pos.y + head < s.bottom) return;
        const push = min - _seg.d;
        this.pos.x += _seg.nx * push;
        this.pos.z += _seg.nz * push;
        const vn = this.vel.x * _seg.nx + this.vel.z * _seg.nz;
        if (vn < 0) {
          this.vel.x -= vn * _seg.nx;
          this.vel.z -= vn * _seg.nz;
        }
      });
    }

    // A cave's walls and roof.
    if (this.space) this._keepInside(wasX, wasZ);
    // A boat's keel: off the shallows.
    else if (c && c.keel && !this.flying) this._keepAfloat(wasX, wasZ, c);

    // Ground
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    const gh = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const under = this.groundSolid;
    // How flat you lie in the water: flat while you swim along under it,
    // upright treading water, or at the surface, more upright the slower.
    const hs0 = Math.hypot(this.vel.x, this.vel.z);
    const moving = smoothstep(0.15, 0.8, Math.hypot(hs0, this.vel.y));
    const flat = diver ? moving * (this.under > 0.3 ? 1 : 0.7) : 0;
    this.prone = lerp(this.prone, flat, 1 - Math.exp(-dt * 3));
    // pitched head down as you go down, head up as you come up
    const dive = diver && moving > 0 ? Math.atan2(-this.vel.y, Math.max(hs0, 0.3)) : 0;
    this.pitch = lerp(this.pitch, clamp(dive, -1.1, 1.2) * this.prone, 1 - Math.exp(-dt * 4));
    // no higher than floating, unless you're still coming down into it
    if (afloat && this.pos.y > floatY && this.vel.y > 0) {
      this.pos.y = floatY;
      this.vel.y = 0;
    }
    if (diver && (this.pos.y < floatY - 0.01 || (afloat && this.vel.y < 0))) {
      // under the surface (or on your way down from it): no lower than the bed
      const bed = this.groundAt(this.pos.x, this.pos.z, this.pos.y, false) - PRONE_DROP * this.size * this.prone;
      if (this.pos.y < bed) {
        this.pos.y = bed;
        if (this.vel.y < 0) this.vel.y = 0;
      }
      this.grounded = true;
    } else if (this.pos.y <= gh) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.pos.y - gh < 0.35 && this.vel.y <= 0) {
      this.pos.y = gh; // stick to the slope when walking downhill
      this.vel.y = 0;
    } else {
      this.grounded = false;
    }
    this.underfoot = this.grounded ? under : null;
    if (!wasGrounded && this.grounded && fallSpeed > 2.5) this.emit('land', Math.min(1, fallSpeed / 12));

    // Facing: the work in hand, or the way you're going; with the camera
    // locked behind you, the way it looks, unless you're being walked
    // somewhere, when it comes round behind the way you go instead.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let turn = 0;
    const facing = this.faceTo ? Math.hypot(this.faceTo.x - this.pos.x, this.faceTo.z - this.pos.z) > 0.05 : false;
    const faceAhead = this.lockCamera && !steered;
    if (hs > 0.3 || facing || faceAhead) {
      const target = facing
        ? Math.atan2(this.faceTo.x - this.pos.x, this.faceTo.z - this.pos.z)
        : faceAhead
          ? this.camYaw + Math.PI
          : Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = d * (1 - Math.exp(-dt * (c ? c.turn : 12)));
      this.yaw += step;
      turn = step / Math.max(dt, 1e-4);
    }
    this.turnRate = lerp(this.turnRate, turn, 1 - Math.exp(-dt * 8));
    if (steered && this.lockCamera && hs > 0.3) this.camYaw += wrap(this.yaw + Math.PI - this.camYaw) * (1 - Math.exp(-dt * LOCKED.follow));

    const root = this.character.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    // bob a little while swimming at the surface
    if (diver) root.position.y += Math.sin(this.character.time * 2.6) * 0.04 * (1 - smoothstep(0.1, 0.5, this.under));
    this.character.swim(diver ? 1 : 0, this.prone, this.pitch, this.under > 0.3);
    // backing up on your feet (the camera locked behind you), the legs walk backwards
    const backing = this.lockCamera && !diver && this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw) < 0;
    // carried, the legs aren't walking (whatever carries you sits you on it)
    if (c) this.character.update(dt, 0, true, 0, 0);
    else this.character.update(dt, backing ? -hs : hs, this.grounded, this.vel.y, this.turnRate);
    // whether your head is under the water
    this.submerged = diver && this.pos.y + lerp(HEAD[0], HEAD[1], this.prone) * this.size < this.surface - 0.05;

    this.updateCamera(dt, false);
  }

  // Inside a space: push out of its walls, and bump your head on its roof
  // (or what carries you: its width, its head room).
  // Should a step ever take you clean through its rock, take it back rather
  // than come up on the hill above.
  _keepInside(wasX, wasZ) {
    const was = this.space;
    const sp = this.spaces.at(this.pos.x, this.pos.z, this.pos.y + 0.05, _in);
    if (!sp) {
      if (this.pos.y < this.world.heightAt(this.pos.x, this.pos.z) - 0.5 && was.inside(wasX, wasZ, this.pos.y + 0.05, _in)) {
        this.pos.x = wasX;
        this.pos.z = wasZ;
        this.vel.x = 0;
        this.vel.z = 0;
      }
      return;
    }
    this.space = sp;
    const roof = _in.roof;
    const floor = _in.floor;
    const c = this.carrier;
    const radius = c ? c.radius : PLAYER_RADIUS;
    const head = c ? c.height : BODY_H * this.size;
    sp.walls(this.pos.x, this.pos.z, _wall, this.pos.y);
    if (_wall.d < radius) {
      const push = radius - _wall.d;
      this.pos.x += _wall.nx * push;
      this.pos.z += _wall.nz * push;
      const vn = this.vel.x * _wall.nx + this.vel.z * _wall.nz;
      if (vn < 0) {
        this.vel.x -= vn * _wall.nx;
        this.vel.z -= vn * _wall.nz;
      }
    }
    // Too low to get under: no further that way, unless it's no lower than
    // where you were (so you can always back out). On foot there's always
    // room where you can walk; a horse, with you on it, needs more.
    if (roof - floor < head) {
      const before = was.inside(wasX, wasZ, this.pos.y + 0.05, _in) ? _in.roof - _in.floor : Infinity;
      if (before > roof - floor) {
        this.pos.x = wasX;
        this.pos.z = wasZ;
        this.vel.x = 0;
        this.vel.z = 0;
        return;
      }
    }
    if (this.vel.y > 0 && this.pos.y + head > roof) {
      this.pos.y = Math.max(floor, roof - head);
      this.vel.y = 0;
    }
  }

  // Carried by something that floats (carrier.keel): no further into water too
  // shallow for it. A step that would take it there is turned to run along
  // the shore instead (the way the water keeps its depth), so it slides along
  // rather than stopping dead; and anywhere deeper than where it was is
  // allowed, so a boat pulled up on the bank can always be pushed out again.
  _keepAfloat(wasX, wasZ, c) {
    let mx = this.pos.x - wasX;
    let mz = this.pos.z - wasZ;
    const m = Math.hypot(mx, mz);
    if (m < 1e-9) return;
    const from = this._draught(wasX, wasZ, c, mx / m, mz / m);
    const ok = (x, z, dx, dz) => {
      const d = this._draught(x, z, c, dx, dz);
      return d >= c.keel || d > from;
    };
    if (ok(this.pos.x, this.pos.z, mx / m, mz / m)) return;
    // which way the water gets deeper, here
    const e = 0.3;
    const gx = this._depth(wasX + e, wasZ) - this._depth(wasX - e, wasZ);
    const gz = this._depth(wasX, wasZ + e) - this._depth(wasX, wasZ - e);
    const gl = Math.hypot(gx, gz);
    const nx = gl > 1e-9 ? gx / gl : 0;
    const nz = gl > 1e-9 ? gz / gl : 0;
    const into = mx * nx + mz * nz;
    if (gl > 1e-9 && into < 0) {
      // along the shore, the part of the step that was into the shallows taken out
      mx -= into * nx;
      mz -= into * nz;
      const l = Math.hypot(mx, mz);
      if (l > 1e-9 && ok(wasX + mx, wasZ + mz, mx / l, mz / l)) {
        this.pos.x = wasX + mx;
        this.pos.z = wasZ + mz;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx;
          this.vel.z -= vn * nz;
        }
        return;
      }
    }
    this.pos.x = wasX;
    this.pos.z = wasZ;
    this.vel.x = 0;
    this.vel.z = 0;
  }

  // The water at (x, z) for something about y high: held up in a basin
  // there, or the land's. out and the answer as for chunks.waterAt.
  _water(x, z, y, out) {
    out.rise = 0; // (waves break only on the sea)
    if (this.basins && this.basins.at(x, z, y, out)) return true;
    return this.world.waterAt(x, z, out);
  }

  // How deep the water is at (x, z) (m, 0 out of it).
  _depth(x, z) {
    return this.world.waterAt(x, z, _w) ? Math.max(0, _w.depth) : 0;
  }

  // How much water there is to float in at (x, z) (m), going the way (dx, dz):
  // under the middle, or under the bow, whichever is shallower.
  _draught(x, z, c, dx, dz) {
    const d = this._depth(x, z);
    return c.bow ? Math.min(d, this._depth(x + dx * c.bow, z + dz * c.bow)) : d;
  }

  // Is the camera's view clear t metres back from its target along dir: open
  // air in a cave, or above the land?
  _open(from, dir, t) {
    const x = from.x + dir.x * t;
    const y = from.y + dir.y * t;
    const z = from.z + dir.z * t;
    if (this.spaces && this.spaces.air(x, y, z, CAVE_CAM.clear)) return true;
    return y >= this.world.heightAt(x, z) + 0.35;
  }

  // Moved by something else: wherever it puts you. (looked: whether you
  // looked about this frame.)
  _ride(dt, looked) {
    const at = this._at;
    at.heading = undefined;
    at.grounded = true;
    at.behind = 0;
    at.back = 0;
    at.wade = 0;
    at.flowX = 0;
    at.flowZ = 0;
    this.aboard.place(at, dt);
    const dx = at.x - this.pos.x;
    const dy = at.y - this.pos.y;
    const dz = at.z - this.pos.z;
    this.input.jumped(); // no jumping off: it's a long way down from a trestle
    const heading = at.heading ?? at.yaw;
    const turn = this._rode ? Math.atan2(Math.sin(heading - this._heading), Math.cos(heading - this._heading)) : 0;
    this._heading = heading;
    // the camera comes along, and swings round the bends with you
    this.camTarget.x += dx;
    this.camTarget.y += dy;
    this.camTarget.z += dz;
    this.camYaw += turn;
    // ...and round behind you, if it should (always, with the camera locked
    // behind you), while you aren't looking about
    this._looked = looked ? 0 : this._looked + dt;
    const behind = this.lockCamera ? Math.max(at.behind, LOCKED.follow) : at.behind;
    if (behind > 0 && this._looked > LOOK_HOLD) this.camYaw += wrap(heading + Math.PI - this.camYaw) * (1 - Math.exp(-dt * behind));
    const k = this._rode && Math.hypot(dx, dz) < 5 ? 1 / Math.max(dt, 1e-4) : 0;
    this.vel.set(dx * k, dy * k, dz * k);
    this.pos.set(at.x, at.y, at.z);
    this.rides.placed(at.x, at.y, at.z);
    this.yaw = at.yaw;
    this._rode = true;
    this.turnRate = 0;
    this.grounded = at.grounded !== false;
    this.flying = this.climbing = this.swimming = this.manual = false;
    this.wade = at.wade;
    this.current.x = at.flowX;
    this.current.z = at.flowZ;
    this.underfoot = null;
    this.space = null;
    // not swimming, nor under the water, whatever you were doing before it
    // took you (it may have picked you up out of the river)
    this.under = this.surface = this.prone = this.pitch = 0;
    this.submerged = false;
    this.character.swim(0);
    if (!this.aboard?.posesCharacter) {
      const root = this.character.root;
      root.position.copy(this.pos);
      root.rotation.y = this.yaw;
      this.character.update(dt, 0, this.grounded, this.vel.y, 0);
    }
    this.updateCamera(dt, false);
  }

  updateCamera(dt, snap) {
    const kT = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.camTarget.x = lerp(this.camTarget.x, this.pos.x, kT);
    this.camTarget.z = lerp(this.camTarget.z, this.pos.z, kT);
    this.camTarget.y = lerp(this.camTarget.y, this.pos.y + this.eye, snap ? 1 : 1 - Math.exp(-dt * 6));
    const under = !!this.space;

    // With the camera locked behind you it looks past your right shoulder,
    // so you're a little to the left and what's ahead of you is under the
    // crosshair, not the back of your head: from beside your head, as far
    // to the side as a wall there leaves room for (and in a cave, not at all).
    const from = _from.copy(this.camTarget);
    const right = _right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    let side = this.lockCamera && !under ? LOCKED.shoulder * this.size : 0;
    if (side > 0) {
      for (const blocked of this.cameraBlockers) {
        const hit = blocked(this.camTarget, right, side + 0.25);
        if (hit < side + 0.25) side = Math.max(0, hit - 0.25);
      }
    }
    this._shoulder = snap ? side : lerp(this._shoulder, side, 1 - Math.exp(-dt * (side < this._shoulder ? 14 : 3)));
    from.addScaledVector(right, this._shoulder);

    // Pull in if the hillside is between us and the camera (or in a cave,
    // its rock: looked for more finely, and let come in closer).
    let dist = this.camDist + (this.carrier ? this.carrier.back : 0) + (this.aboard ? this._at.back : 0);
    const cp = Math.cos(this.camPitch);
    const dir = _dir.set(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    const steps = under ? CAVE_CAM.steps : 8;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * dist;
      if (this._open(from, dir, t)) continue;
      if (!under) {
        dist = Math.max(1.2, t * 0.9);
        break;
      }
      // in a cave, find the rock face between the last clear look and this one
      let lo = ((i - 1) / steps) * dist;
      let hi = t;
      for (let k = 0; k < 5; k++) {
        const mid = (lo + hi) / 2;
        if (this._open(from, dir, mid)) lo = mid;
        else hi = mid;
      }
      dist = Math.max(CAVE_CAM.nearest, lo);
      break;
    }
    // ...or a wall or roof.
    for (const blocked of this.cameraBlockers) {
      const hit = blocked(from, dir, dist);
      if (hit < dist) dist = Math.max(0.6, hit - 0.25);
    }
    const kd = snap ? 1 : 1 - Math.exp(-dt * (dist < this.camDistSmooth ? 14 : 3));
    this.camDistSmooth = lerp(this.camDistSmooth, dist, kd);
    // in a cave, never lag behind into the rock
    if (under && dist < this.camDistSmooth) this.camDistSmooth = dist;

    const cam = this.camera;
    cam.position.copy(from).addScaledVector(dir, this.camDistSmooth);
    // (in a cave the march above has already kept it in the open)
    if (!under) {
      let floor = this.world.heightAt(cam.position.x, cam.position.z) + 0.35;
      // and on the same side of the surface as your head: out of the water
      // while it's out, under while you're under
      if (this._water(cam.position.x, cam.position.z, cam.position.y, _w) && _w.depth > 0) {
        if (!this.submerged) floor = Math.max(floor, _w.level + _w.rise + 0.3);
        else if (cam.position.y > _w.level - 0.25) cam.position.y = Math.max(floor, _w.level - 0.25);
      }
      if (cam.position.y < floor) cam.position.y = floor;
    }
    cam.lookAt(from);
    this._lookThrough(dir);
  }

  // From your eyes, while you look out of them (fromEye: first person, or a
  // sight held up): from the point the camera behind you looks at, the same
  // way, so the crosshair stays on what it was on; through a sight, `zoom`
  // times closer. They keep under a cave's roof, and out of the water while
  // your head is. The hiker isn't drawn (it would be the inside of your own
  // head): that is the figure, from the hips, so that whatever hides the
  // whole of you (root.visible: a plane you board) still has it as it left it.
  _lookThrough(dir) {
    const cam = this.camera;
    const eye = this.fromEye;
    if (!eye && this._ownFov === null) return;
    if (eye) {
      if (this._ownFov === null) this._ownFov = cam.fov;
      const P = this.pos;
      let y = P.y + this.eye;
      if (this.space) {
        if (this.spaces.at(P.x, P.z, P.y + 0.05, _in)) y = Math.min(y, _in.roof - CAVE_CAM.clear);
      } else if (!this.submerged && this._water(P.x, P.z, P.y, _w) && _w.depth > 0) y = Math.max(y, _w.level + _w.rise + EYE_OVER_WATER);
      cam.position.set(P.x, y, P.z);
      cam.lookAt(cam.position.x - dir.x, cam.position.y - dir.y, cam.position.z - dir.z);
      cam.fov = this._ownFov / (this.sight ? Math.max(1, this.sight.zoom) : 1);
    } else {
      cam.fov = this._ownFov;
      this._ownFov = null;
    }
    cam.updateProjectionMatrix();
    this.character.hips.visible = !eye;
  }
}
