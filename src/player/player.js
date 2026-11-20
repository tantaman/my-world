// Third-person explorer: movement, simple physics, collision with trunks and
// boulders, and an orbiting follow camera that stays out of the hillside.
// In water you wade, slower the deeper it gets, and the current leans on you
// the deeper you're in it; where it's too deep to stand you swim: you float
// with your head and shoulders out, and running water carries you along.
//
// Something can carry you instead (player.carrier: a mount). Then it's its
// speeds, its depth, its width and head room that count, and if it flies,
// space climbs and shift stoops.
//
// Under the ground, in a cave (world/spaces.js), its floor is what you stand
// on, its walls and roof keep you in, and the camera keeps to its air.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Character } from './character.js';
import { lerp, clamp, smoothstep } from '../noise.js';
import { Emitter } from '../core/events.js';
import { segDist, waterSample } from '../core/geom.js';

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
// How much of the current's speed it carries you at: wading in it up to your
// knees (WADE_PUSH depth, m) and over, and swimming.
const WADE_PUSH = [0.15, 0.9];
const PUSH = { wade: 0.3, swim: 0.85 };
const EYE = 1.45; // m above your feet the camera looks at
// Flying higher than this (m) over the ground, you're above the trunks.
const TRUNK_CLEAR = 10;
// A tap of jump in the air (a touch screen has no holding it) climbs for this long (s).
const FLAP = 0.45;
const _dir = new THREE.Vector3();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _w = waterSample();
const _in = { floor: 0, roof: Infinity };
const _wall = { d: 0, nx: 0, nz: 0 };
// In a cave the camera keeps this far (m) from the rock, looks for it this
// finely along the way back from your head, and comes in as close as it has
// to — right up to your head, if your back is to the wall.
const CAVE_CAM = { clear: 0.25, steps: 16, nearest: 0.15 };

// Where someone at (x, z) stands: on the ground, afloat in deep water, or on
// the floor of a space they are in (feet about y; spaces: world/spaces.js).
// world is the ChunkManager.
// depth: how deep it has to be to float them (SWIM_DEPTH for someone on foot).
export function standHeight(world, x, z, depth = SWIM_DEPTH, y = Infinity, spaces = null) {
  if (spaces && spaces.at(x, z, y, _in)) return _in.floor;
  const g = world.heightAt(x, z);
  if (world.waterAt(x, z, _w) && _w.level - g > depth) return _w.level - depth;
  return g;
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
  constructor({ scene, camera, world, input, solids = null, spaces = null }) {
    super();
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.solids = solids;
    this.spaces = spaces;
    // The space you're in (a cave), or null out under the sky.
    this.space = null;
    this.character = new Character();
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
    // The solid you're standing on (a sill, a dock), or null on the ground.
    // One with a `surface` says what your footsteps sound like on it.
    this.underfoot = null;
    this.groundSolid = null; // ...and the one the last groundAt() found
    // Something else can walk you: { x, z, run } to head for, or null (the
    // blueprint foreman sets it). Your own keys or stick always win, and
    // `manual` says whether they moved you this frame.
    this.steer = null;
    this.manual = false;
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
    //   fly            null, or { cruise, fast, climb, glide, dive, ceiling,
    //                  agility }: m/s along and up (glide and dive sink, so
    //                  are negative), and how high over the ground it goes (m)
    //   landing        set by its owner while it comes down to land
    this.carrier = null;
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
  // (Which solid that was, if any, is left in this.groundSolid.)
  groundAt(x, z, y = Infinity) {
    let g = standHeight(this.world, x, z, this.carrier ? this.carrier.depth : SWIM_DEPTH, y, this.spaces);
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

  get eye() {
    return this.carrier ? this.carrier.eye : EYE;
  }

  update(dt) {
    const input = this.input;
    const c = this.carrier;
    const look = input.consumeLook();
    const sens = 0.0026;
    this.camYaw -= look.x * sens;
    this.camPitch = clamp(this.camPitch + look.y * sens, -0.35, 1.25);
    const z = input.consumeZoom();
    if (z) this.camDist = clamp(this.camDist * (z > 0 ? 1.12 : 1 / 1.12), 2.2, 16);
    if (input.isDown('turnLeft')) this.camYaw += dt * 1.8;
    if (input.isDown('turnRight')) this.camYaw -= dt * 1.8;

    // Camera-relative movement
    const axes = input.moveAxes();
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let wx = fx * axes.y + rx * axes.x;
    let wz = fz * axes.y + rz * axes.x;
    let wl = Math.hypot(wx, wz);
    let amount = Math.min(1, wl);
    let running = input.running();
    this.manual = wl > 1e-4;
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
    const inWater = !this.space && this.world.waterAt(this.pos.x, this.pos.z, _w) && _w.depth > 0 && !(this.underfoot && this.pos.y > _w.level);
    const depth = inWater ? _w.depth : 0;
    const float = c ? c.depth : SWIM_DEPTH;
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
      const drag = this.swimming ? 0.42 : 1 - 0.5 * smoothstep(0.12, 1.0, depth);
      const run = running && !this.swimming;
      speed = (run ? CONFIG.runSpeed : CONFIG.walkSpeed) * amount * (1 - this.busy * 0.85) * drag;
      push = this.swimming ? PUSH.swim : PUSH.wade * smoothstep(WADE_PUSH[0], WADE_PUSH[1], depth);
    }

    const accel = this.flying ? F.agility : this.grounded ? (c ? c.agility : 11) : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, wx * speed + this.current.x * push, k);
    this.vel.z = lerp(this.vel.z, wz * speed + this.current.z * push, k);

    if (F) {
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
      const head = c ? c.height : BODY_H;
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

    // Ground
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    const gh = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const under = this.groundSolid;
    if (this.pos.y <= gh) {
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

    // Facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let turn = 0;
    const facing = this.faceTo ? Math.hypot(this.faceTo.x - this.pos.x, this.faceTo.z - this.pos.z) > 0.05 : false;
    if (hs > 0.3 || facing) {
      const target = facing
        ? Math.atan2(this.faceTo.x - this.pos.x, this.faceTo.z - this.pos.z)
        : Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = d * (1 - Math.exp(-dt * (c ? c.turn : 12)));
      this.yaw += step;
      turn = step / Math.max(dt, 1e-4);
    }
    this.turnRate = lerp(this.turnRate, turn, 1 - Math.exp(-dt * 8));

    const root = this.character.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    // carried, the legs aren't walking (whatever carries you sits you on it)
    if (c) this.character.update(dt, 0, true, 0, 0);
    else this.character.update(dt, hs, this.grounded, this.vel.y, this.turnRate);
    // bob a little while swimming
    if (this.swimming && !c) root.position.y += Math.sin(this.character.time * 2.6) * 0.04;

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
    const head = c ? c.height : BODY_H;
    sp.walls(this.pos.x, this.pos.z, _wall);
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

  // Is the camera's view clear t metres back from its target along dir: open
  // air in a cave, or above the land?
  _open(dir, t) {
    const x = this.camTarget.x + dir.x * t;
    const y = this.camTarget.y + dir.y * t;
    const z = this.camTarget.z + dir.z * t;
    if (this.spaces && this.spaces.air(x, y, z, CAVE_CAM.clear)) return true;
    return y >= this.world.heightAt(x, z) + 0.35;
  }

  updateCamera(dt, snap) {
    const kT = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.camTarget.x = lerp(this.camTarget.x, this.pos.x, kT);
    this.camTarget.z = lerp(this.camTarget.z, this.pos.z, kT);
    this.camTarget.y = lerp(this.camTarget.y, this.pos.y + this.eye, snap ? 1 : 1 - Math.exp(-dt * 6));

    // Pull in if the hillside is between us and the camera (or in a cave,
    // its rock: looked for more finely, and let come in closer).
    let dist = this.camDist + (this.carrier ? this.carrier.back : 0);
    const cp = Math.cos(this.camPitch);
    const dir = _dir.set(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    const under = !!this.space;
    const steps = under ? CAVE_CAM.steps : 8;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * dist;
      if (this._open(dir, t)) continue;
      if (!under) {
        dist = Math.max(1.2, t * 0.9);
        break;
      }
      // in a cave, find the rock face between the last clear look and this one
      let lo = ((i - 1) / steps) * dist;
      let hi = t;
      for (let k = 0; k < 5; k++) {
        const mid = (lo + hi) / 2;
        if (this._open(dir, mid)) lo = mid;
        else hi = mid;
      }
      dist = Math.max(CAVE_CAM.nearest, lo);
      break;
    }
    // ...or a wall or roof.
    for (const blocked of this.cameraBlockers) {
      const hit = blocked(this.camTarget, dir, dist);
      if (hit < dist) dist = Math.max(0.6, hit - 0.25);
    }
    const kd = snap ? 1 : 1 - Math.exp(-dt * (dist < this.camDistSmooth ? 14 : 3));
    this.camDistSmooth = lerp(this.camDistSmooth, dist, kd);
    // in a cave, never lag behind into the rock
    if (under && dist < this.camDistSmooth) this.camDistSmooth = dist;

    const cam = this.camera;
    cam.position.copy(this.camTarget).addScaledVector(dir, this.camDistSmooth);
    // (in a cave the march above has already kept it in the open)
    if (!under) {
      let floor = this.world.heightAt(cam.position.x, cam.position.z) + 0.35;
      // and keep it out of the water
      if (this.world.waterAt(cam.position.x, cam.position.z, _w)) floor = Math.max(floor, _w.level + 0.3);
      if (cam.position.y < floor) cam.position.y = floor;
    }
    cam.lookAt(this.camTarget);
  }
}
