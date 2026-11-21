// Hunted: something big has your scent. A black bear, or a mountain lion,
// stalking you through the trees: you hear it more than you see it, a twig
// going, a huff or a snarl off to the side. Then it comes.
//
// Your rifle is on 0. A bear takes three good hits, a lion two. Stand your
// ground and face a charging bear and it may stop short; a lion only comes
// from behind, so keep turning to face it. Neither will come near a burning
// campfire. Bring it down, or stay alive until it gives up on you.
//
// What you bring down is yours to dress for its meat, like anything else you
// shoot (src/hunting/).

import { Prowler } from './prowler.js';
import { rand } from '../core/geom.js';

const LASTS = 210; // s until it gives up on you
const FROM = [55, 70]; // m off it turns up, behind you
const THROWN = { back: 5, up: 3.5 }; // how a mauling throws you (m/s)

export const bear = {
  id: 'bear',
  title: 'Hunted: black bear',
  blurb: 'A black bear has your scent and is stalking you. Bring it down with your rifle (0), face it when it charges, keep a fire burning, or stay alive until it gives up.',
  start: (kit, { from }) => new Hunted(kit, from, 'bear'),
};

export const lion = {
  id: 'lion',
  title: 'Hunted: mountain lion',
  blurb: 'A mountain lion is following you, out of sight. It only comes from behind: keep turning to face it. Bring it down with your rifle (0), or stay alive until it gives up.',
  start: (kit, { from }) => new Hunted(kit, from, 'cougar'),
};

// What a prowler needs of the world, out under the sky: the forest's own
// animal context (ground, trunks to go round, voices), and you.
export function prowlerWorld(kit, extra = {}) {
  const P = kit.player;
  const ctx = Object.create(kit.wildlife.ctx);
  return {
    ctx,
    you: () => ({
      x: P.pos.x,
      z: P.pos.z,
      y: P.pos.y,
      speed: Math.hypot(P.vel.x, P.vel.z),
      facing: { x: -Math.sin(P.camYaw), z: -Math.cos(P.camYaw) },
    }),
    fire: (x, z) => {
      for (const f of kit.fires.list.values()) {
        if (Math.hypot(f.x - x, f.z - z) > 12) continue;
        const st = kit.fires.state(f).state;
        if (st === 'burning') return f;
      }
      return null;
    },
    maul(n, dir, why) {
      kit.fling(dir.x * THROWN.back, THROWN.up, dir.z * THROWN.back);
      kit.hurt(n, why);
    },
    say: (msg) => kit.say(msg, 2200),
    ...extra,
  };
}

// A prowler as something the rifle can hit. onDown(prowler) once it's down.
export function asTarget(prowler, onDown) {
  return {
    aimed(o, d, far, near) {
      if (prowler.down) return null;
      const t = prowler.hit(o, d, far);
      return t !== null && t >= near ? { t, label: prowler.label, hit: prowler } : null;
    },
    struck(p) {
      const r = p.shot();
      if (r === 'down') {
        onDown(p);
        return `a good shot · ${p.label} is down`;
      }
      return `a hit · ${p.label} reels`;
    },
    heard: (x, z) => prowler.heard(x, z),
  };
}

class Hunted {
  constructor(kit, from, kind) {
    this.kit = kit;
    this.t = 0;
    this.kind = kind;
    // behind you, a way off
    const a = from.camYaw + rand(-0.8, 0.8);
    const d = rand(FROM[0], FROM[1]);
    const x = from.x + Math.sin(a) * d;
    const z = from.z + Math.cos(a) * d;
    this.prowler = new Prowler(kind, x, z, prowlerWorld(kit));
    this.prowler.mesh.position.y = kit.ground(x, z);
    kit.scene.add(this.prowler.mesh);
    this.downed = false;
    this.off = kit.targets.add(asTarget(this.prowler, () => (this.downed = true)));
    kit.say(kind === 'bear' ? 'something big is moving in the trees behind you' : 'you have the feeling you are being watched', 3000);
  }

  objective() {
    return this.kind === 'bear' ? 'survive the bear · rifle on 0' : 'survive the mountain lion · rifle on 0';
  }

  left() {
    return LASTS - this.t;
  }

  note() {
    const p = this.prowler;
    if (p.mind === 'charge' || p.mind === 'pounce') return 'it is coming!';
    if (p.mind === 'back') return 'it has backed off · for now';
    return this.kind === 'cougar' ? "it's out there · keep turning" : "it's out there · listen";
  }

  guide() {
    // you don't get told where it is: you have to listen. Once it charges, you know.
    const p = this.prowler;
    return p.mind === 'charge' || p.mind === 'pounce' ? { x: p.x, z: p.z, label: p.label } : null;
  }

  update(dt) {
    const kit = this.kit;
    this.t += dt;
    if (this.downed) {
      if (!this.handed) this._handOver();
      return { won: `you brought down ${this.prowler.label} · it's yours to dress` };
    }
    this.prowler.update(dt);
    if (this.t >= LASTS) return { won: `${this.prowler.label} gave up on you and slipped away` };
    // it's a long way off: it's lost you (it'll find you again)
    const P = kit.player.pos;
    if (Math.hypot(P.x - this.prowler.x, P.z - this.prowler.z) > 160) {
      const a = Math.random() * Math.PI * 2;
      this.prowler.x = P.x + Math.sin(a) * 70;
      this.prowler.z = P.z + Math.cos(a) * 70;
    }
    return null;
  }

  // Down: its body is a kill like any other, to dress where it fell.
  _handOver() {
    this.handed = true;
    const p = this.prowler;
    this.kit.scene.remove(p.mesh);
    this.kit.carcasses.add({ kind: p.kind, label: p.kind === 'bear' ? 'a black bear' : 'a mountain lion', mesh: p.mesh, x: p.x, z: p.z, yaw: p.yaw, scale: p.scale, torso: p.torso, dispose: () => p.dispose() });
    this.given = true;
  }

  dispose() {
    this.off();
    if (!this.given) {
      this.kit.scene.remove(this.prowler.mesh);
      this.prowler.dispose();
    }
  }
}
