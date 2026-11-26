// A treasure hunt under way: the run the adventures board holds while you're
// on it (the contract is at the top of adventures/adventures.js). It begins
// as you get to the old place the map starts from, and goes in stages:
//
//   0         the first leg: pace it out from the old place to the mark
//   1         the second: from the mark to the spot, and dig
//   'found'   a hole has struck the chest: open it
//   'open'    the lid thrown back, the gold in it yours
//
// It's handed what it needs of the world, and nothing else:
//
//   new Hunt(plan, {
//     scene, solids,
//     player          where you are and what you're doing (pos, yaw, camYaw,
//                     rides, swimming, grounded, space, character, busy)
//     ground(x, z)    the height of the ground
//     say(msg, ms)    a word on the screen
//     sfx(kind, opts) a sound
//     key(word)       how the act key is written in a word on the screen
//     look()          the meshes (look.js), or null until it has come
//     found(hoard)    you've opened the chest: { name, coins, trinket }
//   })
//
// Nothing of it stays: the mark, the turned earth, the holes and the chest
// are all taken away when it's over (dispose).

import { Pacer, PACE, MARKS, digAt, looking, offCourse } from './hunt.js';

const AT_MARK = 5; // m from the mark on the way that you've come to it
export const DIG_TIME = 2.2; // s of digging to make a hole
const AHEAD = 0.8; // m in front of you that a hole is dug
const SCRAPE = 0.55; // s between scrapes of the spade
const SHIFTED = 0.8; // m moved off a hole half-dug: it's begun again where you are
const HOLES = 12; // holes left open; the oldest filled in as you dig more
const STRAY = 45; // m past the length of a leg from where it began: wandered off
export const OPEN_REACH = 2.4; // m from the chest you can open it
const RISE = 0.8; // s the chest takes to come up as the earth comes off it
const LID = 0.9; // s the lid takes to swing back
const SUNK = 0.08; // m of the chest still in the ground once dug out
export const LINGER = 60; // s the open chest stays once you have it
const MARK_R = 0.4; // m: the mark is solid this far out
const DEAD_ON = 4; // degrees off a bearing that is on it
const ROUGHLY = 50; // degrees off it that is still heading its way (bear left or right)

export class Hunt {
  constructor(plan, world) {
    this.plan = plan;
    this.w = world;
    /** @type {0 | 1 | 'found' | 'open'} */
    this.stage = 0;
    this.pacer = new Pacer();
    this.pacer.from(plan.start);
    this.t = 0;
    this.digging = null; // { x, z, from: { x, z }, t, scrape }
    this.held = false; // the spade worked this frame
    this.holes = [];
    this.chest = null; // { object, lid, x, z, y, t, lidT }
    this.built = null; // { mark, patch } once look.js is here
    this.reached = false; // the mark on the way, come to
    this.linger = LINGER;
  }

  get leg() {
    return this.plan.legs[Math.min(1, typeof this.stage === 'number' ? this.stage : 1)];
  }

  // On foot, for the pace count: not carried, not swimming.
  get onFoot() {
    const p = this.w.player;
    return p.rides.free && !p.swimming;
  }

  // Whether a spade can go in where you stand.
  canDig() {
    const p = this.w.player;
    return typeof this.stage === 'number' && p.rides.free && p.grounded && !p.swimming && !p.space;
  }

  get strayed() {
    if (typeof this.stage !== 'number' || !this.pacer.stood) return false;
    const { from, paces } = this.leg;
    const p = this.w.player.pos;
    return Math.hypot(p.x - from.x, p.z - from.z) > paces * PACE + STRAY;
  }

  // ── What the banner says ──────────────────────────────────────────────────
  objective() {
    if (this.stage === 'found') return 'open the chest';
    if (this.stage === 'open') return this.plan.name;
    const { from, way, paces, to } = this.leg;
    return to.mark ? `from ${from.name}, ${paces} paces ${way}, to ${MARKS[to.mark].a}` : `from ${from.name}, ${paces} paces ${way}, and dig`;
  }

  left() {
    return null; // no hurry: it's waited this long
  }

  note() {
    if (this.digging) return 'digging…';
    if (typeof this.stage !== 'number') return '';
    const from = this.leg.from.name;
    if (!this.onFoot) return 'on foot, to count your paces';
    if (!this.pacer.stood) return `stand at ${from} to start counting`;
    if (this.strayed) return `you've wandered off · back to ${from}, and pace it again`;
    const n = this.pacer.paces;
    const { way, paces } = this.leg;
    // which way you'd walk, against the bearing: on it, a little off it, or
    // not that way at all
    const cam = this.w.player.camYaw;
    const off = (offCourse(cam, way) * 180) / Math.PI;
    const course = Math.abs(off) <= DEAD_ON ? `${way}, dead on` : Math.abs(off) <= ROUGHLY ? `${way}: bear ${off > 0 ? 'left' : 'right'}` : `facing ${looking(cam)}`;
    const dig = this.stage === 1 && n >= paces * 0.6 ? ` · hold ${this.w.key('dig')} to dig` : '';
    return `${n} of ${paces} paces · ${course}${dig}`;
  }

  guide() {
    if (typeof this.stage !== 'number') return null;
    // back to where to count from, when you aren't counting: the rest is
    // the map's to say
    if (this.pacer.stood && !this.strayed) return null;
    const { from } = this.leg;
    return { x: from.x, z: from.z, label: from.name };
  }

  // What the act key's cue says: { html, progress } or null.
  cue() {
    if (this.digging) return { html: 'digging…', progress: Math.min(1, this.digging.t / DIG_TIME) };
    if (this.stage === 'found' && this.reach() < OPEN_REACH) return { html: `<b>${this.w.key('open')}</b> open the chest` };
    return null;
  }

  // m from you to the chest, once it's found.
  reach() {
    if (!this.chest) return Infinity;
    const p = this.w.player.pos;
    return Math.hypot(p.x - this.chest.x, p.z - this.chest.z);
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    this._build();
    const p = this.w.player.pos;
    this.pacer.step(p.x, p.z, this.onFoot);
    if (this.stage === 0) {
      const m = this.plan.legs[0].to;
      if (Math.hypot(p.x - m.x, p.z - m.z) < AT_MARK) this._reach();
    }
    if (this.digging && !this.held) this._stop();
    this.held = false;
    this._animate(dt);
    if (this.stage === 'open') {
      const { name, coins, trinket } = this.plan;
      return { won: `${name}: ${coins} gold coins and ${trinket}` };
    }
    return null;
  }

  // While it lingers, won: the lid still swinging back.
  after(dt) {
    this._animate(dt);
    return true;
  }

  _reach() {
    this.stage = 1;
    this.reached = true;
    const next = this.plan.legs[1];
    this.pacer.from(next.from);
    this.w.say(`${next.from.name} · from here, ${next.paces} paces ${next.way}, and dig`, 4200);
  }

  // The mark and the patch of turned earth, once what they're made of is here.
  _build() {
    if (this.built) return;
    const look = this.w.look();
    if (!look) return;
    const { ground, scene, solids } = this.w;
    const m = this.plan.legs[0].to;
    const mark = look.marker(m.mark, (Math.floor(m.x * 13 + m.z * 7) | 0) >>> 0);
    const y = ground(m.x, m.z);
    mark.position.set(m.x, y - 0.03, m.z);
    mark.rotation.y = (m.x * 0.37 + m.z * 0.61) % (Math.PI * 2);
    const patch = look.patch(ground, this.plan.x, this.plan.z);
    scene.add(mark, patch);
    if (m.mark !== 'pick') solids.set(this, [{ ax: m.x, az: m.z, bx: m.x, bz: m.z, r: MARK_R, bottom: y - 0.1, topA: y + 0.9, topB: y + 0.9 }]);
    this.built = { mark, patch };
  }

  // ── Digging ───────────────────────────────────────────────────────────────
  // The act key held a frame: the spade goes in, in front of you.
  dig(dt) {
    if (!this.canDig()) return;
    const w = this.w;
    const p = w.player.pos;
    const yaw = w.player.yaw;
    const d = this.digging;
    if (!d || Math.hypot(p.x - d.from.x, p.z - d.from.z) > SHIFTED) {
      this.digging = { x: p.x + Math.sin(yaw) * AHEAD, z: p.z + Math.cos(yaw) * AHEAD, from: { x: p.x, z: p.z }, t: 0, scrape: 0 };
    }
    const g = this.digging;
    this.held = true;
    g.t += dt;
    g.scrape -= dt;
    if (g.scrape <= 0) {
      g.scrape = SCRAPE;
      w.sfx('dig');
    }
    const ch = w.player.character;
    if (ch.tool !== 'shovel') ch.setTool('shovel');
    ch.play('dig', 0.9, true);
    w.player.busy = 1;
    if (g.t >= DIG_TIME) {
      this._stop();
      this._hole(g.x, g.z, yaw);
    }
  }

  _stop() {
    const ch = this.w.player.character;
    this.digging = null;
    if (ch.action && ch.action.kind === 'dig') ch.stop();
    if (ch.tool === 'shovel') ch.setTool(null);
    this.w.player.busy = 0;
  }

  // A hole dug at (x, z): what's in it?
  _hole(x, z, yaw) {
    const w = this.w;
    const look = w.look();
    if (look) {
      const object = look.hole(w.ground, x, z, yaw + Math.PI * 0.6);
      w.scene.add(object);
      this.holes.push({ x, z, object });
      while (this.holes.length > HOLES) {
        const old = this.holes.shift();
        w.scene.remove(old.object);
        look.dispose(old.object);
      }
    }
    const got = digAt(this.plan, x, z);
    if (!got.found) {
      w.say(got.word, 3200);
      return got;
    }
    this.stage = 'found';
    w.sfx('treasure-strike');
    w.say(`${got.word} · there's a chest down here`, 3600);
    if (look) {
      const c = look.chest();
      const y = w.ground(x, z);
      c.object.position.set(x, y - SUNK - c.height, z);
      c.object.rotation.y = yaw + Math.PI; // its lock toward you
      w.scene.add(c.object);
      this.chest = { ...c, x, z, y, t: 0, lidT: -1 };
    } else this.chest = { object: null, lid: null, x, z, y: 0, height: 0, t: 0, lidT: -1 };
    return got;
  }

  // Lift the lid. -> whether it was there to be opened
  open() {
    if (this.stage !== 'found' || this.reach() > OPEN_REACH) return false;
    this.stage = 'open';
    this.chest.lidT = 0;
    this.w.sfx('treasure-open');
    const { name, coins, trinket } = this.plan;
    this.w.found({ name, coins, trinket });
    return true;
  }

  _animate(dt) {
    const c = this.chest;
    if (!c || !c.object) return;
    if (c.t < RISE) {
      c.t = Math.min(RISE, c.t + dt);
      const k = c.t / RISE;
      c.object.position.y = c.y - SUNK - c.height * (1 - k) * (1 - k);
    }
    if (c.lidT >= 0 && c.lidT < LID) {
      c.lidT = Math.min(LID, c.lidT + dt);
      const k = c.lidT / LID;
      c.lid.rotation.x = this.w.look().OPEN * (1 - (1 - k) ** 3);
    }
  }

  // ── Done with ─────────────────────────────────────────────────────────────
  dispose() {
    if (this.digging) this._stop();
    const w = this.w;
    const look = w.look();
    w.solids.clear(this);
    const all = [...this.holes.map((h) => h.object)];
    if (this.built) all.push(this.built.mark, this.built.patch);
    if (this.chest && this.chest.object) all.push(this.chest.object);
    for (const o of all) {
      w.scene.remove(o);
      if (look) look.dispose(o);
    }
    this.holes = [];
    this.built = null;
    this.chest = null;
  }
}
