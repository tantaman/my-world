// Hurricane: the wind gets up, the sky closes down, and then for three
// minutes it's all on you: rain driving in sideways so you can barely see,
// gusts that shove you off your line, branches and boughs flying out of the
// murk, lightning cracking down round you, and the cold of it wearing you
// down while you're out in it. Get under cover — into a cave, or under a
// roof you built — and ride it out.

import { Storm } from './storm.js';
import { nearest } from './places.js';
import { smoothstep } from '../noise.js';

const COMING = 20; // s it takes to come in
const LASTS = 180; // s it's here, all told
const PASSING = 25; // s it takes to blow over, at the end of that
const PEAK = { wind: 24, rain: 1, lightning: 9, debris: 13 }; // at its worst (m/s; strikes and things flying at you a minute)
const COLD = 0.25; // health a second it wears off you, out in the worst of it
const LOOK_FOR = 700; // m: shelter this near is pointed out

export const hurricane = {
  id: 'hurricane',
  title: 'Hurricane',
  blurb: 'A great storm comes in off the sea. For three minutes it throws everything at you. Get under cover, in a cave or under a roof you built, and ride it out.',
  start: (kit) => new Hurricane(kit),
};

class Hurricane {
  constructor(kit) {
    this.kit = kit;
    this.t = 0;
    this.storm = new Storm(kit);
    this.shelter = null;
    this.lookIn = 0;
    kit.say('the wind is getting up · find cover', 3000);
  }

  // How much of a storm it is, 0..1: coming in, at its height, blowing over.
  get level() {
    return smoothstep(0, COMING, this.t) * (1 - smoothstep(LASTS - PASSING, LASTS, this.t));
  }

  objective() {
    return this.t < COMING ? 'it is coming · get under cover' : 'ride it out under cover';
  }

  left() {
    return LASTS - this.t;
  }

  note() {
    if (this.storm.sheltered) return "under cover · it can't get at you here";
    return this.level > 0.5 ? 'out in it · the cold is wearing you down' : '';
  }

  guide() {
    if (this.storm.sheltered) return null;
    return this.shelter;
  }

  // The nearest cover: a cave's mouth, or a roof you built.
  _lookForShelter() {
    const kit = this.kit;
    const P = kit.player.pos;
    const list = [];
    const cave = kit.caves.nearest(P.x, P.z, LOOK_FOR);
    if (cave) list.push({ x: cave.cave.mouth.x, z: cave.cave.mouth.z, label: cave.cave.name || 'a cave' });
    for (const b of kit.buildings.list) {
      for (const r of b.roofs) list.push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, label: 'your roof' });
    }
    const best = nearest(list, P.x, P.z);
    this.shelter = best && best.d < LOOK_FOR ? { x: best.x, z: best.z, label: best.label } : null;
  }

  update(dt) {
    const kit = this.kit;
    this.t += dt;
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookIn = 2;
      this._lookForShelter();
    }
    const level = this.level;
    this.storm.update(dt, { level, wind: PEAK.wind, rain: PEAK.rain, lightning: PEAK.lightning, debris: PEAK.debris });
    if (!this.storm.sheltered && level > 0.5) kit.wear(COLD * level * dt, 'worn out by the storm');
    if (this.t >= LASTS) return { won: this.storm.sheltered ? 'the storm blew itself out, and you were snug under cover' : 'the storm blew itself out, and you came through it' };
    return null;
  }

  dispose() {
    this.storm.dispose();
  }
}
