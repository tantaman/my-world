// Other people driving race cars. They say so to everyone here (save.say on
// the 'racecar' channel) as they get in and out; nothing about it is kept.
// While someone is in theirs, it's drawn under them wherever they go, and
// they sit in it.
//
//   { on: true, colour, number, sprint }   in a car; null once they're out of it

import { makeCar } from './model.js';
import { SEAT_HIPS } from '../player/character.js';

export class Drivers {
  // peers: everyone else here (player/peers.js); seat: how someone sits in a
  // car (Character.seat); material: the cars'
  constructor({ scene, peers, seat, material }) {
    this.scene = scene;
    this.peers = peers;
    this.seat = seat;
    this.material = material;
    this.all = new Map(); // peer id -> makeCar's
  }

  // What someone said about whether they're in a car.
  hear(id, body) {
    const on = !!(body && body.on === true) && !!this.peers.get(id);
    const was = this.all.get(id);
    if (!on) {
      if (was) this.#drop(id, was);
      return;
    }
    if (was) return;
    const colour = Number.isInteger(body.colour) ? body.colour : 0xd8302a;
    const number = Number.isInteger(body.number) ? body.number : 1;
    const car = makeCar({ colour, number, sprint: body.sprint === true, material: this.material });
    this.scene.add(car.object);
    this.all.set(id, car);
  }

  // Each frame: their car under them, and them sat in it.
  update() {
    for (const [id, car] of this.all) {
      const p = this.peers.get(id);
      if (!p) {
        this.#drop(id, car);
        continue;
      }
      car.object.position.set(p.pos.x, p.pos.y, p.pos.z);
      car.object.rotation.set(0, p.yaw, 0);
      const ch = p.character;
      if (ch.seated !== this.seat) ch.seat(this.seat);
      const s = Math.sin(p.yaw);
      const c = Math.cos(p.yaw);
      ch.root.rotation.x = 0;
      ch.root.position.set(p.pos.x + s * car.seat.z, p.pos.y + car.seat.y - SEAT_HIPS, p.pos.z + c * car.seat.z);
      p.flag.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
    }
  }

  #drop(id, car) {
    this.scene.remove(car.object);
    car.dispose();
    this.all.delete(id);
    const p = this.peers.get(id);
    if (p) p.character.seat(null);
  }

  clear() {
    for (const [id, car] of this.all) this.#drop(id, car);
  }
}
