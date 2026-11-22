// Rafting together. Whoever has a raft out says so to everyone here
// (save.say on the 'raft' channel) as it goes: where it is, which way up,
// its colour, and whether they're in it. Everyone sees it on the water: under
// them, where they sit guiding it, or where it was last said to be while
// they're swimming. Nothing about it is kept.
//
// Beside someone's raft with a seat free, you can climb in as crew. Then
// it's yours to sit in wherever they take it (player.aboard), with a paddle:
// W and S paddle forward and back, and what your paddle is doing is said, so
// that on their raft your strokes drive it along with theirs. When it goes
// over, everyone in it goes in the river; when they pack it away, so do you.
//
//   { on: true, aboard, flipped, colour, x, z, yaw }   a raft out (null: packed away)
//   { crew: id, seat: k, paddle: -1..1 }               sat in id's raft, seat k (null: out)
//
//   SEATS.places   where people sit in a raft: [0] the guide, at the back of
//                  the right-hand tube, then the crew; { a, f }: m across (+
//                  left) and along (+ forward) from its middle
//   seatOf(raft, seat, up, out)   where a seat is in the world, `up` m over
//                  the tube's middle, on a raft { x, y, z, yaw, pitch, roll }

import * as THREE from 'three';
import { GRIP, RAFT } from './raft.js';
import { makeRaft, makeRaftPaddle, tubeRise, COLOURS } from './model.js';
import { STROKE, CATCH, passed } from '../boats/paddle.js';
import { SEAT_HIPS } from '../player/character.js';
import { waterSample } from '../core/geom.js';
import { clamp } from '../noise.js';

// On the tubes, either side, back to front; the guide's first.
const SIDE = RAFT.beam / 2 - RAFT.tube;
export const SEATS = {
  places: [
    { a: -SIDE, f: -1.45 },
    { a: SIDE, f: -1.45 },
    { a: -SIDE, f: -0.3 },
    { a: SIDE, f: -0.3 },
    { a: -SIDE, f: 0.85 },
    { a: SIDE, f: 0.85 },
  ],
  grip: GRIP,
};
// Climbing into someone's raft: within this far (m) of its middle.
const NEAR = 3.4;
// How much one of the crew paddling drives it, against the guide.
const CREW = 0.45;
// How you sit (Character.seat): as the guide does.
const SEAT = { spread: 0.18, hang: 0.38, fwd: 0.32, lean: 0.12, reins: 0, rest: 0, stroke: null };
const SIT_UP = 0.18;
const FLOAT = RAFT.tube - RAFT.draft;
// Saying what your paddle is doing: no more often than this (s).
const SAY_EVERY = 0.25;
// Someone's raft, where they've said it is, eased to (1/s).
const EASE = 4;

const _w = waterSample();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _l = new THREE.Vector3();

// Where seat is in the world on raft, up m over the tube's middle, into out.
export function seatOf(raft, seat, up, out) {
  _e.set(raft.pitch, raft.yaw, raft.roll, 'YXZ');
  _l.set(seat.a, up + tubeRise(seat.f), seat.f).applyEuler(_e);
  return out.set(raft.x + _l.x, raft.y + _l.y, raft.z + _l.z);
}

export class Crews {
  // scene; peers (player/peers.js); save (save.say, save.me); chunks (waterAt);
  // player, input, hud, sound, splashes: you, as crew; raft: your own raft
  // (raft.js), for your crew to sit in; depthAt(x, z): how deep the water is.
  constructor({ scene, peers, save, chunks, player, raft, sound, input, hud, depthAt, splashes }) {
    Object.assign(this, { scene, save, chunks, player, raft, sound, input, hud, depthAt, splashes });
    // (alone, with nobody to hear from: nobody here)
    this.peers = peers || { get: () => null };
    this.rafts = new Map(); // guide id -> { body, mesh, pose: { x, y, z, yaw, pitch, roll } }
    this.crew = new Map(); // crew id -> { guide, seat, paddle }
    this.posed = new Set(); // peers whose characters are sat in a raft
    this.aboard = null; // you, as crew: { guide, seat, paddle, saidAt, stroke }
    this.time = 0;
    const self = this;
    this.mover = {
      place(o) {
        const r = self.rafts.get(self.aboard?.guide);
        if (!r) {
          o.x = player.pos.x;
          o.y = player.pos.y;
          o.z = player.pos.z;
          o.yaw = player.yaw;
          return;
        }
        seatOf(r.pose, SEATS.places[self.aboard.seat], SIT_UP + FLOAT, _l);
        o.x = _l.x;
        o.y = _l.y - SEAT_HIPS;
        o.z = _l.z;
        o.yaw = r.pose.yaw;
        o.heading = r.pose.yaw;
        o.behind = 1.1;
        o.back = 2.2;
      },
    };
  }

  // What someone said.
  hear(id, body) {
    if (!this.peers.get(id)) return;
    if (body && body.on === true) {
      let r = this.rafts.get(id);
      if (!r) {
        const mesh = makeRaft(COLOURS[0]);
        mesh.rotation.order = 'YXZ';
        this.scene.add(mesh);
        r = { body, mesh, pose: { x: body.x, y: 0, z: body.z, yaw: body.yaw, pitch: 0, roll: 0 } };
        this.rafts.set(id, r);
      }
      r.body = body;
      if (Number.isFinite(body.colour)) r.mesh.userData.fabric.color.set(body.colour);
      this.crew.delete(id);
    } else if (body && typeof body.crew === 'string' && Number.isInteger(body.seat)) {
      this.crew.set(id, { guide: body.crew, seat: clamp(body.seat, 1, SEATS.places.length - 1), paddle: clamp(Number(body.paddle) || 0, -1, 1) });
      this.#drop(id);
    } else {
      this.#drop(id);
      this.crew.delete(id);
    }
  }

  #drop(id) {
    const r = this.rafts.get(id);
    if (!r) return;
    this.scene.remove(r.mesh);
    this.rafts.delete(id);
  }

  // The seats taken in guide's raft.
  #taken(guide) {
    const seats = new Set([0]);
    for (const [, c] of this.crew) if (c.guide === guide) seats.add(c.seat);
    return seats;
  }

  // Someone's raft beside you with a seat free, and them in it: { id, name }, or null.
  joinable() {
    if (this.aboard || this.player.aboard || this.player.carrier) return null;
    const p = this.player.pos;
    for (const [id, r] of this.rafts) {
      if (!r.body.aboard || r.body.flipped) continue;
      if (Math.hypot(r.pose.x - p.x, r.pose.z - p.z) > NEAR) continue;
      if (this.#taken(id).size >= SEATS.places.length) continue;
      const peer = this.peers.get(id);
      return { id, name: peer ? peer.name : '' };
    }
    return null;
  }

  // Into the raft beside you, as crew.
  join() {
    const j = this.joinable();
    if (!j) return false;
    const taken = this.#taken(j.id);
    let seat = 1;
    while (taken.has(seat)) seat++;
    this.aboard = { guide: j.id, seat, paddle: 0, saidAt: -1, stroke: null };
    const ch = this.player.character;
    this.player.aboard = this.mover;
    this.player.vel.set(0, 0, 0);
    ch.seat(SEAT);
    ch.setTool('raftPaddle');
    this.sound.sfx('raft-in');
    this.#say();
    this.hud.flash(`in ${j.name ? `${j.name}’s` : 'their'} raft · ${this.input.isTouch ? 'the stick paddles' : 'W S paddle forward and back'} · they steer`, 5200);
    return true;
  }

  // Out of it: into the water beside it, or (with at) there.
  leave(at = null) {
    const a = this.aboard;
    if (!a) return false;
    const r = this.rafts.get(a.guide);
    this.aboard = null;
    const ch = this.player.character;
    if (this.player.aboard === this.mover) this.player.aboard = null;
    ch.seat(null);
    if (ch.action && ch.action.kind === 'paddle') ch.stop();
    if (ch.tool === 'raftPaddle') ch.setTool(null);
    ch.root.rotation.x = ch.root.rotation.z = 0;
    if (at) this.player.pos.set(at.x, this.player.groundAt(at.x, at.z), at.z);
    else if (r) {
      seatOf(r.pose, SEATS.places[a.seat], 0, _l);
      this.player.pos.set(_l.x, r.pose.y - 0.8, _l.z);
    }
    this.save.say('raft', null);
    return true;
  }

  // How much your crew are paddling your raft along (forward +).
  paddling() {
    const me = this.save.me;
    if (!me) return 0;
    let sum = 0;
    for (const [id, c] of this.crew) if (c.guide === me && this.peers.get(id)) sum += c.paddle * CREW;
    return sum;
  }

  #say() {
    const a = this.aboard;
    if (!a) return;
    a.saidAt = this.time;
    this.save.say('raft', { crew: a.guide, seat: a.seat, paddle: Math.round(a.paddle * 10) / 10 });
  }

  // Each frame: the rafts where they are, everyone sat in them, and you.
  update(dt) {
    this.time += dt;
    // their rafts: under them where they sit, or eased to where they said
    for (const [id, r] of this.rafts) {
      const peer = this.peers.get(id);
      if (!peer) {
        this.#drop(id);
        continue;
      }
      const b = r.body;
      const P = r.pose;
      if (b.aboard && !b.flipped) {
        // they sit in the guide's seat: the raft's middle is back from them
        const s = SEATS.places[0];
        const c = Math.cos(peer.yaw);
        const n = Math.sin(peer.yaw);
        P.x = peer.pos.x - (s.a * c + s.f * n);
        P.z = peer.pos.z - (-s.a * n + s.f * c);
        P.yaw = peer.yaw;
      } else {
        const k = 1 - Math.exp(-dt * EASE);
        P.x += (b.x - P.x) * k;
        P.z += (b.z - P.z) * k;
        P.yaw += Math.atan2(Math.sin(b.yaw - P.yaw), Math.cos(b.yaw - P.yaw)) * k;
      }
      P.roll += ((b.flipped ? Math.PI : 0) - P.roll) * (1 - Math.exp(-dt * 3));
      P.y = this.chunks.waterAt(P.x, P.z, _w) && _w.depth > 0 ? _w.level : P.y;
      r.mesh.position.set(P.x, P.y + FLOAT, P.z);
      r.mesh.rotation.set(P.pitch, P.yaw, P.roll, 'YXZ');
    }
    // who sits where: guides in their own rafts, crew in theirs
    const sat = new Set();
    for (const [id, r] of this.rafts) {
      if (!r.body.aboard || r.body.flipped) continue;
      sat.add(id);
      this.#sit(id, r.pose, 0);
    }
    const me = this.save.me;
    for (const [id, c] of this.crew) {
      const pose = c.guide === me && this.raft ? this.raft : this.rafts.get(c.guide)?.pose;
      if (!pose || !this.peers.get(id)) continue;
      sat.add(id);
      this.#sit(id, pose, c.seat, c.paddle);
    }
    for (const id of this.posed) {
      if (sat.has(id)) continue;
      const p = this.peers.get(id);
      if (p) {
        p.character.seat(null);
        p.character.setTool(null);
        p.character.root.rotation.x = p.character.root.rotation.z = 0;
      }
    }
    this.posed = sat;
    this.#me(dt);
  }

  // Someone sat in a raft at a seat, paddling or not.
  #sit(id, pose, seat, paddle = 0) {
    const p = this.peers.get(id);
    if (!p) return;
    const ch = p.character;
    if (!ch.tools.raftPaddle) ch.addHeld('raftPaddle', makeRaftPaddle(), { rest: 0.2 });
    if (ch.seated !== SEAT) ch.seat(SEAT);
    if (ch.tool !== 'raftPaddle') ch.setTool('raftPaddle');
    if (Math.abs(paddle) > 0.05) ch.play('paddle', STROKE.easy, true);
    else if (ch.action && ch.action.kind === 'paddle' && seat !== 0) ch.stop();
    seatOf(pose, SEATS.places[seat], SIT_UP + FLOAT, _l);
    ch.root.position.set(_l.x, _l.y - SEAT_HIPS, _l.z);
    _e.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    ch.root.rotation.copy(_e);
    p.flag.position.set(_l.x, _l.y + 1.2, _l.z);
  }

  // You, as crew: sat in it, paddling, and thrown out when it goes over or
  // is packed away.
  #me(dt) {
    const a = this.aboard;
    if (!a) return;
    const r = this.rafts.get(a.guide);
    if (!r || !r.body.on || r.body.flipped || this.player.aboard !== this.mover) {
      const flipped = r && r.body.flipped;
      this.leave();
      this.hud.flash(flipped ? 'over she goes! you’re in the river' : 'out of the raft, into the river', 5200);
      if (flipped) this.sound.sfx('raft-flip');
      return;
    }
    const ch = this.player.character;
    seatOf(r.pose, SEATS.places[a.seat], SIT_UP + FLOAT, _l);
    ch.root.position.set(_l.x, _l.y - SEAT_HIPS, _l.z);
    _e.set(r.pose.pitch, r.pose.yaw, r.pose.roll, 'YXZ');
    ch.root.rotation.copy(_e);
    // your paddle
    const ax = this.input.blocked ? { x: 0, y: 0 } : this.input.moveAxes();
    const paddle = Math.abs(ax.y) > 0.2 ? Math.sign(ax.y) : 0;
    if (paddle !== a.paddle || this.time - a.saidAt > 3) {
      a.paddle = paddle;
      if (this.time - a.saidAt > SAY_EVERY || paddle === 0) this.#say();
    }
    if (paddle) ch.play('paddle', this.input.running() ? STROKE.hard : STROKE.easy, true);
    else if (ch.action && ch.action.kind === 'paddle') ch.stop();
    const act = ch.action;
    const p = act && act.kind === 'paddle' ? (act.t / act.dur) % 1 : null;
    if (p !== null && a.stroke !== null && passed(a.stroke, p, CATCH)) {
      ch.tools.raftPaddle.object.getObjectByName('blade').getWorldPosition(_l);
      if (this.chunks.waterAt(_l.x, _l.z, _w) && _w.depth > 0) {
        this.splashes.burst(_l.x, _w.level + 0.04, _l.z, _w.level, 14, { up: 1, spread: 0.45 });
        this.sound.sfx('raft-stroke', { size: 0.6 });
      }
    }
    a.stroke = p;
  }
}
