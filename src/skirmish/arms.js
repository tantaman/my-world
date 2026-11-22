// What a fighter can carry, what it costs and what it does.
//
// Everyone has a knife and comes in with a sidearm. The rest is bought at
// the start of a round, at home, with what the last rounds earned: a better
// pistol, a gun for the main slot (one at a time), a vest and a helmet, a
// kit to pull the charge's fuse in half the time (Wardens only), and one
// each of three grenades.
//
// A gun's numbers:
//   dmg      health a hit to the body takes at the muzzle (pellets: each of them)
//   pen      the share of that which gets through a vest or a helmet
//   range    how much is left of it every FALLOFF m it travels
//   every    s between shots; auto: whether holding the trigger keeps firing
//   mag, spare, reload   rounds in it, rounds carried besides, s to reload
//   spread   rad the shot strays by, standing still, first shot;
//   move     ...more of it at a full run; and every shot adds `bloom` of it,
//   bloom    up to `most`, which dies away once you stop firing
//   kick     rad the muzzle climbs a shot, and sways to the side by
//   pace     m/s you run with it in hand
//   reward   $ for a kill with it
//   zoom     through its sight (right mouse): how many times closer
//   far      m a bot thinks it worth firing from
//
// No three.js in here, and nothing about where anyone is: the match
// (match.js) says who hit whom where, and this says what came of it.

export const FALLOFF = 15; // m a shot loses `range` of its damage over
export const HEAD = 4; // times the damage, to the head
export const LEGS = 0.75; // ...and to the legs
export const AIR = 0.11; // rad of spread added off the ground
export const DUCKED = 0.72; // of the spread, crouched
export const SETTLE = 4.5; // 1/s the bloom dies away
export const UNKICK = 6; // 1/s the muzzle comes back down
export const SPRAY_RESETS = 0.38; // s without firing before a spray starts again
export const DRAW = 0.55; // s to bring up what you've changed to before it can be used
export const CASH = { start: 800, most: 16000 };

export const GUNS = {
  knife: { name: 'knife', slot: 'knife', dmg: 45, behind: 2.4, reach: 1.9, every: 0.5, pace: 6, reward: 1500, far: 1.6 },
  sidearm: { name: 'P-9 sidearm', slot: 'side', price: 200, dmg: 30, pen: 0.5, range: 0.85, every: 0.13, auto: false, mag: 12, spare: 36, reload: 2.2, spread: 0.007, move: 0.03, bloom: 0.01, most: 0.05, kick: { up: 0.011, side: 0.004 }, pace: 5.6, reward: 300, far: 30 },
  magnum: { name: 'Bulldog magnum', slot: 'side', price: 700, dmg: 54, pen: 0.93, range: 0.85, every: 0.26, auto: false, mag: 7, spare: 21, reload: 2.3, spread: 0.005, move: 0.06, bloom: 0.03, most: 0.08, kick: { up: 0.045, side: 0.012 }, pace: 5.4, reward: 300, far: 38 },
  smg: { name: 'Wasp SMG', slot: 'main', price: 1250, dmg: 23, pen: 0.58, range: 0.72, every: 0.075, auto: true, mag: 30, spare: 90, reload: 2.3, spread: 0.012, move: 0.02, bloom: 0.004, most: 0.04, kick: { up: 0.008, side: 0.006 }, pace: 5.6, reward: 600, far: 28 },
  shotgun: { name: 'Breacher shotgun', slot: 'main', price: 1100, dmg: 18, pellets: 8, pen: 0.5, range: 0.45, every: 0.88, auto: false, mag: 7, spare: 28, reload: 2.9, spread: 0.045, move: 0.01, bloom: 0, most: 0, kick: { up: 0.06, side: 0.01 }, pace: 5.2, reward: 900, far: 13 },
  rifle: { name: 'Karga rifle', slot: 'main', price: 2700, dmg: 33, pen: 0.78, range: 0.96, every: 0.1, auto: true, mag: 30, spare: 90, reload: 2.5, spread: 0.004, move: 0.07, bloom: 0.0035, most: 0.045, kick: { up: 0.014, side: 0.007 }, pace: 5.1, reward: 300, far: 60 },
  longrifle: { name: 'Longshot rifle', slot: 'main', price: 4750, dmg: 110, pen: 0.97, range: 0.99, every: 1.4, auto: false, mag: 5, spare: 20, reload: 3.5, spread: 0.06, sighted: 0.0006, move: 0.12, bloom: 0, most: 0, kick: { up: 0.06, side: 0 }, pace: 4.7, reward: 100, far: 120, zoom: 3.4 },
};
for (const [id, g] of Object.entries(GUNS)) g.id = id;

export const GRENADES = {
  frag: { name: 'frag grenade', price: 300, fuse: 1.6, reach: 7.5, dmg: 98 },
  flash: { name: 'flashbang', price: 200, fuse: 1.5, reach: 30, blind: 3.2 },
  smoke: { name: 'smoke grenade', price: 300, fuse: 2.2, reach: 4.6, lasts: 15 },
};
for (const [id, g] of Object.entries(GRENADES)) g.id = id;

export const GEAR = {
  vest: { name: 'vest', price: 650 },
  helmet: { name: 'vest + helmet', price: 1000, withVest: 350 },
  kit: { name: 'fuse kit', price: 400, side: 'defend' },
};

// What's on the list to buy, in the order it's shown, and its key.
export const SHOP = ['magnum', 'smg', 'shotgun', 'rifle', 'longrifle', 'vest', 'helmet', 'kit', 'frag', 'flash', 'smoke'];
export const itemName = (id) => (GUNS[id] || GRENADES[id] || GEAR[id]).name;

// What a fighter comes into a round with if they have nothing: a sidearm.
export function freshKit() {
  return { main: null, side: 'sidearm', frag: 0, flash: 0, smoke: 0, armor: 0, helmet: false, kit: false };
}

// The rounds in a gun just bought or handed out: { mag, spare }.
export const loaded = (id) => ({ mag: GUNS[id].mag, spare: GUNS[id].spare });

// What `item` would cost a fighter with this kit and this much money, on
// this side ('attack' | 'defend'): { price } or { no: why it can't be bought }.
export function quote(kit, cash, side, item) {
  let price;
  if (GUNS[item]) {
    const g = GUNS[item];
    if (!g.price) return { no: 'not for sale' };
    if (kit[g.slot] === item) return { no: 'you have one' };
    price = g.price;
  } else if (GRENADES[item]) {
    if (kit[item] > 0) return { no: 'you have one' };
    price = GRENADES[item].price;
  } else if (item === 'vest') {
    if (kit.armor >= 100) return { no: 'you have one' };
    price = GEAR.vest.price;
  } else if (item === 'helmet') {
    if (kit.armor >= 100 && kit.helmet) return { no: 'you have them' };
    price = kit.armor >= 100 ? GEAR.helmet.withVest : GEAR.helmet.price;
  } else if (item === 'kit') {
    if (side !== 'defend') return { no: 'Wardens only' };
    if (kit.kit) return { no: 'you have one' };
    price = GEAR.kit.price;
  } else return { no: 'no such thing' };
  if (cash < price) return { price, no: 'not enough money' };
  return { price };
}

// Put `item` in the kit (it has been paid for). -> the gun to fill and bring
// up, if it was one.
export function take(kit, item) {
  if (GUNS[item]) {
    kit[GUNS[item].slot] = item;
    return item;
  }
  if (GRENADES[item]) kit[item] = 1;
  else if (item === 'vest') kit.armor = 100;
  else if (item === 'helmet') {
    kit.armor = 100;
    kit.helmet = true;
  } else if (item === 'kit') kit.kit = true;
  return null;
}

// What a shot from `gun` that has gone `far` m does to someone it hits in
// the `part` ('head' | 'body' | 'legs') wearing this: -> { health, armor }
// taken off each.
export function wound(gun, part, far, armor, helmet) {
  let dmg = gun.dmg * Math.pow(gun.range ?? 1, far / FALLOFF);
  if (part === 'head') dmg *= HEAD;
  else if (part === 'legs') dmg *= LEGS;
  const covered = part === 'head' ? helmet && armor > 0 : part === 'body' && armor > 0;
  if (!covered || gun.pen === undefined) return { health: dmg, armor: 0 };
  const through = dmg * gun.pen;
  const soaked = Math.min(armor, (dmg - through) * 0.5);
  return { health: through, armor: soaked };
}

// How far a shot strays (rad), for a gun in these hands:
//   pace    how fast they're going, as a share of the gun's running pace
//   air     off the ground · ducked · sighted (through its sight)
//   bloom   what firing has added so far
export function spreadOf(gun, { pace = 0, air = false, ducked = false, sighted = false, bloom = 0 } = {}) {
  let s = (sighted && gun.sighted !== undefined ? gun.sighted : gun.spread) + bloom;
  const p = Math.min(1, pace);
  // (a slow walk costs next to nothing: it's the run that throws the aim)
  s += gun.move * p * p * p;
  if (air) s += AIR;
  if (ducked) s *= DUCKED;
  return s;
}

// The climb and sway of the n-th shot of a spray (0 the first): the first
// few go nearly straight up, then it swings from side to side.
export function kickOf(gun, n, rng = Math.random) {
  const k = gun.kick;
  const climb = k.up * (n < 8 ? 1 : 0.35);
  const sway = n < 3 ? (rng() - 0.5) * k.side : Math.sin((n - 3) * 0.55) * k.side * 1.6 + (rng() - 0.5) * k.side;
  return { pitch: climb, yaw: sway };
}

// What a bot buys with this much money, on this side, already carrying
// `kit`: the things to buy, in order. keen 0..1: how much of a marksman it is.
export function shopping(kit, cash, side, keen = 0.5) {
  const list = [];
  let left = cash;
  const want = (item) => {
    const q = quote(kit, left, side, item);
    if (q.no) return false;
    left -= q.price;
    list.push(item);
    take(kit, item); // (on a copy: see below)
    return true;
  };
  kit = { ...kit };
  if (!kit.main) {
    if (left >= 5750 && keen > 0.72) want('longrifle');
    else if (left >= 3700) want('rifle');
    else if (left >= 2500 && left < 3700) {
      // not enough for a rifle and a vest: a cheap gun, or save for next round
      if (keen > 0.4) want(keen > 0.6 ? 'smg' : 'shotgun');
    }
  }
  if (kit.main || left >= 1000) {
    if (!want('helmet')) want('vest');
  } else if (left >= 650 && cash <= CASH.start) want('vest'); // the first round: a vest, or a better pistol
  if (side === 'defend' && kit.main && left >= 400) want('kit');
  if (!kit.main && kit.side === 'sidearm' && left >= 700 && cash > CASH.start) want('magnum');
  return list;
}
