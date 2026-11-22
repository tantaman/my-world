// Where she is: the Halcyon's voyages, back and forth between her two ports,
// worked out from the clock on the wall alone, as the trains are (railway/
// timetable.js). So everyone in a world sees her in the same place without a
// word passing between them: sailing with friends is being aboard together
// when she goes, and missing the boat is being ashore.
//
// Her ports are Port Angeles, where people first arrive (the world starts on
// the Olympic Peninsula, by Lake Crescent, with Mount Storm King a walk off),
// and Maui, 835 km away, where the hikes on Haleakalā and round the island
// are. Each has its berth and its lane out to the open sea (site.js).
//
// A round trip:
//
//   alongside   DOCK s at a port; the call for all aboard goes out CALL s
//               before she sails
//   leaving     she lets go and moves off the pier sideways (side), swings
//               round to point out to sea (swing), and heads out along her
//               lane, gathering way (gather)
//   at sea      out along the lane until she's out of sight of land (out);
//               a fog bank comes down over her, and in the thick of it
//               she's carried across the world to the other port's lane
//               (fog), the way the plane is carried in cloud; then in along
//               it toward the land (in)
//   arriving    slowing as she comes in (gather), swinging round to lie
//               along the pier (swing), and onto it sideways (side)
//
// then alongside at the other port, and back. In the thick of the fog is the
// only time she jumps from one place to another; everywhere else she moves
// as a ship does.
//
// No three.js in here: the tests sail her.
//
//   new Voyage(berths, seed)   berths: [home's, Maui's] (site.js); the
//                              second may be a function, asked for only
//                              when it's needed (it's dear to find)
//   voyage.at(t, out, pose?)   where she is and what she's doing at t (s,
//                              the clock on the wall): fills out.phase
//                              ('docked', 'leaving', 'sea', 'arriving'),
//                              out.port (the port she's at, or left),
//                              out.to (the port she's bound for, if under
//                              way), out.left (s to the end of this phase),
//                              out.fog (0..1), and, if near a port (the
//                              berth her pose is measured from: out.near,
//                              and pose(near) says to), out.x, out.z,
//                              out.yaw, out.v (m/s ahead); undefined if not
//   voyage.next(t, port)       when she next sails from a port, and next
//                              comes in to it: { sails, arrives } (s)
//   CYCLE                      s, a round trip

export const PORTS = [
  { id: 'home', name: 'Port Angeles', short: 'Port Angeles' },
  { id: 'maui', name: 'Kahului, Maui', short: 'Maui', hike: 'waihee-ridge' },
];

// How long each part takes (s).
export const DOCK = 720;
export const CALL = 300;
export const LEAVE = { side: 50, swing: 70, gather: 120 };
export const SEA = { out: 250, fog: 40, in: 250 };
export const ARRIVE = { gather: 120, swing: 70, side: 50 };
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
export const LEG = sum(LEAVE) + sum(SEA) + sum(ARRIVE);
export const CYCLE = 2 * (DOCK + LEG);
// How thick the fog is, over its time: it comes down over FOG_EDGE s and
// lifts over as long; between, she can see nothing much.
const FOG_EDGE = 12;

const ease = (u) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

// A pose measured from a berth: (lx, lz) in her frame there (plan.js), her
// heading turned by `turn` from the berth's, into the world.
function place(b, lx, lz, turn, v, out) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  out.x = b.x + lx * c + lz * s;
  out.z = b.z - lx * s + lz * c;
  out.yaw = b.yaw + turn;
  out.v = v;
  return out;
}

export class Voyage {
  constructor(berths, seed = 0) {
    this.berths = berths;
    // each world's sailings fall at their own times
    this.offset = (((seed * 2654435761) >>> 0) % CYCLE) + 0.5;
  }

  // Port i's berth: a function is asked each time until it has one.
  berth(i) {
    const b = this.berths[i];
    if (typeof b !== 'function') return b;
    const found = b();
    if (found) this.berths[i] = found;
    return found || null;
  }

  // Where in the round trip t falls: (s into it, 0..CYCLE)
  _into(t) {
    const u = (t - this.offset) % CYCLE;
    return u < 0 ? u + CYCLE : u;
  }

  // pose(i): whether to work out where she is near port i (her berth there
  // being dear to find, someone far from it may not want it).
  at(t, out = {}, pose = () => true) {
    let u = this._into(t);
    const half = DOCK + LEG;
    const from = u < half ? 0 : 1;
    const to = 1 - from;
    u -= from * half;
    out.port = from;
    out.to = null;
    out.fog = 0;
    out.near = from;
    if (u < DOCK) {
      out.phase = 'docked';
      out.left = DOCK - u;
      return pose(from) ? this._still(from, out) : this._none(out);
    }
    out.to = to;
    u -= DOCK;
    const L = LEAVE;
    // leaving
    if (u < L.side + L.swing + L.gather) {
      out.phase = 'leaving';
      out.left = L.side + L.swing + L.gather - u;
      return pose(from) ? this._lane(from, u, false, out) : this._none(out);
    }
    u -= L.side + L.swing + L.gather;
    // at sea
    if (u < sum(SEA)) {
      out.phase = 'sea';
      out.left = sum(SEA) - u;
      const fog = u - SEA.out;
      if (fog > -FOG_EDGE && fog < SEA.fog + FOG_EDGE) out.fog = Math.min(ease((fog + FOG_EDGE) / FOG_EDGE), ease((SEA.fog + FOG_EDGE - fog) / FOG_EDGE));
      if (u < SEA.out + SEA.fog / 2) return pose(from) ? this._lane(from, L.side + L.swing + L.gather + u, false, out) : this._none(out);
      out.near = to;
      return pose(to) ? this._lane(to, sum(SEA) - u + ARRIVE.gather + ARRIVE.swing + ARRIVE.side, true, out) : this._none(out);
    }
    u -= sum(SEA);
    out.phase = 'arriving';
    out.near = to;
    out.left = sum(ARRIVE) - u;
    return pose(to) ? this._lane(to, sum(ARRIVE) - u, true, out) : this._none(out);
  }

  _none(out) {
    out.x = out.z = out.yaw = out.v = undefined;
    return out;
  }

  _still(i, out) {
    const b = this.berth(i);
    if (!b) return this._none(out);
    return place(b, 0, 0, 0, 0, out);
  }

  // Along berth i's lane: w s from letting go (leaving), or s short of
  // being alongside (coming in, which is leaving run backwards in time, but
  // bow first: she comes in heading for the land and swings the other way).
  _lane(i, w, coming, out) {
    const b = this.berth(i);
    if (!b) return this._none(out);
    const { swing: S, jump: J } = b.lane;
    const L = LEAVE;
    const sgn = coming ? -1 : 1; // which way she's heading along the lane (out: −x)
    if (w < L.side) {
      const k = ease(w / L.side);
      return place(b, -S * k, 0, 0, 0, out);
    }
    w -= L.side;
    if (w < L.swing) {
      const turn = -sgn * (Math.PI / 2) * ease(w / L.swing);
      return place(b, -S, 0, turn, 0, out);
    }
    w -= L.swing;
    // gathering way from rest to v over `gather`, then on at v: out to the
    // jump at the end of `out`, and a little past it into the fog
    const v = (J - S) / (L.gather / 2 + SEA.out);
    const d = w < L.gather ? (v * w * w) / (2 * L.gather) : (v * L.gather) / 2 + v * (w - L.gather);
    return place(b, -S - d, 0, -sgn * (Math.PI / 2), w < L.gather ? (v * w) / L.gather : v, out);
  }

  // When she next sails from port i, and next comes in to it, after t.
  next(t, i) {
    const u = this._into(t);
    const half = DOCK + LEG;
    const start = t - u; // when this round trip began
    const docked = i * half; // when she comes alongside at i, into the trip
    const sails = docked + DOCK;
    const after = (x) => (x >= u ? start + x : start + x + CYCLE);
    return { sails: after(sails), arrives: after(docked) };
  }
}
