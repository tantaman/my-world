// The descent: an adventure, on the board with the rest of them (**J**).
//
// You are sent to the top of a snowy run in the high country, and the clock
// starts when you get there. Ski down to where the snow gives out, before the
// run gets away from you. What is kept is how long it took, so it is a race
// against the hill and against your own best time down it.
//
// It adds nothing to the world and takes nothing away: there is no weather to
// clear up afterwards, only the mountain that was already there, and the
// trough the ice cut down it (src/world/water.js). What makes it a race is
// that a trough never turns back uphill, so a line exists; finding it is
// yours to do.
//
// It is skiing's, not the adventures' own, because it is a ski run: it reads
// nothing of the world that the adventures' kit doesn't already hand it, but
// its keys, its physics and its tally are here.

// m from you that a top may be found, and the step the search walks out in.
const REACH = 2500;
const STEP = 100;
// How much high country (worldgen.js) makes a top worth sending you to, and
// how much snow there must be under it for it to be a run at all (m).
const ALPINE = 0.5;
const DROP_LEAST = 220;
// m round a top that must be clear of a real place: a hike brings its own
// snow and its own weather, and this is the forest's run.
const OFF = 120;
// m from the top: you're there.
const NEAR = 40;
// The foot of the run is this far (m) over the snow line, so you are still on
// snow when you get there rather than scraping onto the turf.
const FOOT_OVER = 15;
// The clock: this long (s) to start with, and this much more for every metre
// of descent — about half what the fall line gives you tucked, so there is
// room to pick a line but not to walk it.
const SLACK = 25;
const PACE = 6; // m of descent a second

// How much snow there is to ski down from (x, z), in m, if it's the top of
// a run on the forest's own terrain (high country, enough snow under it, no
// real place near); 0 if it isn't. Out on the real Earth (world/earth.js)
// the high country is its own mountains, wherever they stand that far over
// its snow line.
export function runDrop(gen, landforms, x, z) {
  if (gen.country(x, z).alp < ALPINE && !onEarth(gen, x, z)) return 0;
  // the broad height and the snow line, which are cheap: no water
  const drop = gen.broadHeight(x, z, 0) - gen.snowline(x, z);
  if (drop < DROP_LEAST) return 0;
  return landforms.reaches(x - OFF, z - OFF, x + OFF, z + OFF) ? 0 : drop;
}

const onEarth = (gen, x, z) => {
  const e = gen.earthAt(x, z);
  return !!e && e.w >= 0.5;
};

// Find a snowy start on the forest's own terrain, for the race or the map.
export function findRunTop(gen, landforms, from, reach = REACH, step = STEP) {
  let best = null;
  for (let r = step; r <= reach; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = from.x + Math.cos(a) * r;
      const z = from.z + Math.sin(a) * r;
      const drop = runDrop(gen, landforms, x, z);
      if (drop && (!best || drop > best.drop)) best = { x, z, drop };
    }
  }
  return best;
}

// onSkis(): whether the skis are on, for the word under the objective.
export function descent(onSkis) {
  return {
    id: 'descent',
    title: 'The descent',
    blurb: 'A run comes off the top of a massif, a few hundred metres of it under snow. Get to the bottom before it gets away from you.',
    where(kit, from) {
      const { gen, landforms } = kit;
      const best = findRunTop(gen, landforms, from);
      if (!best) {
        return { none: 'no run near here · the long ones are up in the high country, so find a massif on the map and try it from there' };
      }
      if (Math.hypot(best.x - from.x, best.z - from.z) < 20) return null;
      return { x: best.x, z: best.z, label: 'the top of the run', near: NEAR, objective: 'climb to the top of the run' };
    },
    start: (kit, { at, from }) => new Descent(kit, at || from, onSkis),
  };
}

class Descent {
  constructor(kit, at, onSkis) {
    this.kit = kit;
    this.onSkis = onSkis;
    this.top = kit.ground(at.x, at.z);
    this.foot = kit.gen.snowline(at.x, at.z) + FOOT_OVER;
    this.fall = Math.max(DROP_LEAST, this.top - this.foot);
    this.limit = SLACK + this.fall / PACE;
    this.t = 0;
    this.low = this.top; // the lowest you have got to
    kit.say(`${Math.round(this.fall)} m of snow below you · down you go`, 3200);
  }

  objective() {
    return `ski down to ${Math.round(this.foot)} m, where the snow gives out`;
  }

  left() {
    return Math.max(0, this.limit - this.t);
  }

  guide() {
    return null; // downhill is not a place: the objective says the height
  }

  note() {
    if (!this.onSkis()) return 'on your skis, and point them down';
    const togo = Math.round(this.low - this.foot);
    return togo > 0 ? `${togo} m to go` : '';
  }

  update(dt) {
    this.t += dt;
    const p = this.kit.player.pos;
    const h = this.kit.ground(p.x, p.z);
    if (h < this.low) this.low = h;
    if (h <= this.foot) return { won: `down ${Math.round(this.top - h)} m of it in ${Math.round(this.t)} s` };
    if (this.t >= this.limit) return { lost: 'the run got away from you' };
    return null;
  }

  dispose() {} // nothing of it was ever added to the world
}
