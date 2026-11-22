// Places under the ground you can be in: caves, and Hell. Everywhere else the terrain
// says where the ground is; inside one of these, the space does — its floor,
// its roof, its walls — and the terrain overhead is only the hill on top.
//
// A space is any object with
//
//   x0, z0, x1, z1           its extent in plan
//   surface                  what footsteps sound like on its floor ('rock')
//   inside(x, z, y, out)     is a body at (x, z) with its feet about y in it?
//                            -> bool; fills out.floor and out.roof (Infinity
//                            where it is open to the sky)
//   walls(x, z, out, y)      for someone inside: out.d, how far to its walls
//                            (m, < 0 in them; Infinity where there are none
//                            to speak of) and out.nx, out.nz, the way out of them.
//                            y is how high their feet are, for a space whose
//                            walls are only walls to someone low enough (a
//                            cliff you can walk off the top of)
//   air(x, y, z, m)          is (x, y, z) open air in it, at least m from rock?
//   light(x, z)              optional: how much daylight reaches (x, z) in it,
//                            1 at its mouth .. 0 deep inside. Where it is dark
//                            the sky's light is dimmed and the headlamp comes
//                            on (src/caves/index.js)
//
// There is one of these for the whole world, like Solids. The player, the
// people you share a world with and the camera read it; whoever makes a
// space adds it, and can also be asked to make the ones at a spot right away
// (ensure), for when someone is set down there (a reload, a teleport).

export class Spaces {
  constructor() {
    this.list = [];
    this.makers = [];
    this._out = { floor: 0, roof: Infinity };
  }

  add(space) {
    if (!this.list.includes(space)) this.list.push(space);
  }

  remove(space) {
    const i = this.list.indexOf(space);
    if (i >= 0) this.list.splice(i, 1);
  }

  // fn(x, z): make whatever spaces there are at (x, z) now, if they aren't yet.
  onDemand(fn) {
    this.makers.push(fn);
  }

  ensure(x, z) {
    for (const fn of this.makers) fn(x, z);
  }

  // The space a body at (x, z) with its feet about y is in, or null.
  // out gets its floor and roof there.
  at(x, z, y, out = this._out) {
    for (const s of this.list) {
      if (x < s.x0 || z < s.z0 || x > s.x1 || z > s.z1) continue;
      if (s.inside(x, z, y, out)) return s;
    }
    return null;
  }

  // Is (x, y, z) open air in any space?
  air(x, y, z, m = 0) {
    for (const s of this.list) {
      if (x < s.x0 || z < s.z0 || x > s.x1 || z > s.z1) continue;
      if (s.air(x, y, z, m)) return true;
    }
    return false;
  }
}
