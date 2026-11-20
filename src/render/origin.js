// Where the picture is drawn from.
//
// Everything in the game is worked out in JavaScript's 64-bit numbers, which
// are good to a hair's breadth anywhere on Earth. The graphics card works in
// 32-bit floats, which carry about seven digits: a thousand kilometres from
// the middle of the world, nothing finer than 6 cm. Hand it positions like
// that and the ground's texture smears, trunks snap to a grid and shadows
// fall in stripes.
//
// So it is never handed them. While a frame is drawn, and only then, the
// whole scene is slid so that a spot near the camera (the origin) sits at
// zero, and slid back afterwards. The game goes on thinking in world
// coordinates, everywhere, all the time; the card only ever sees numbers a
// kilometre or two across, the same at the far side of the Earth as in the
// middle.
//
// That takes care of everything that is *placed* (a mesh, a light, a bone).
// Three things it can't reach, and they have rules of their own:
//
//   numbers in buffers   A vertex or an instance is stored as a 32-bit float
//                        whatever is done here. So geometry is built round
//                        its own mesh, and the mesh is what gets put in the
//                        world: a chunk's plants are measured from the
//                        chunk's corner, a cabin's logs from the cabin.
//                        anchor() below is for things redrawn every frame
//                        from wherever they happen to be (sparks, chips).
//   uniforms             A uniform that says *where* something is (the
//                        player, for the grass to part round) is registered
//                        with place(), and is slid along with the scene.
//   patterns             A shader that draws from position (the ground, the
//                        water) can't be given the true position either. It
//                        asks worldXZ() (glsl.js): the place within a few
//                        kilometres' period, which the patterns repeat on.

// m. The origin sits on multiples of this, and moves when the camera gets
// more than this far from it: so it stays put for a long walk, and what is
// drawn is never more than this (and the view) from zero.
export const SNAP = 1024;

export class Origin {
  constructor(snap = SNAP) {
    this.snap = snap;
    this.x = 0;
    this.z = 0;
    this._places = new Set(); // uniforms holding a place: { value: Vector2 | Vector3 }
    this._fixed = new Set(); // objects that stay where they are while the scene slides
    this._kept = []; // what begin() changed, for end() to put back exactly
  }

  // Keep the origin near (x, z). True if it moved.
  follow(x, z) {
    const s = this.snap;
    if (Math.abs(x - this.x) <= s && Math.abs(z - this.z) <= s) return false;
    this.x = Math.round(x / s) * s + 0;
    this.z = Math.round(z / s) * s + 0;
    return true;
  }

  // Where the origin is within a repeating `period` (m), 0 .. period each
  // way, as out.x and out.y (a Vector2 of x and z).
  wrapped(period, out = {}) {
    out.x = mod(this.x, period);
    out.y = mod(this.z, period);
    return out;
  }

  // A uniform whose value is a place in the world: a Vector3, or a Vector2
  // of (x, z), or an array of either. Set it in world coordinates like
  // anything else; it is slid with the scene while a frame is drawn.
  place(uniform) {
    this._places.add(uniform);
    return uniform;
  }

  // An object that must not slide with the rest: one whose position is not
  // a place at all (a hemisphere light's is the direction of the sky).
  keep(object) {
    this._fixed.add(object);
    return object;
  }

  // Slide the scene, the camera and the registered uniforms so the origin is
  // at zero. The camera is not in the scene, so it is slid by hand.
  begin(scene, camera) {
    this._kept.length = 0;
    this._move(scene.position, 'z', -1);
    if (!camera.parent) this._move(camera.position, 'z', -1);
    for (const u of this._places) {
      if (Array.isArray(u.value)) for (const v of u.value) this._move(v, 'z' in v ? 'z' : 'y', -1);
      else this._move(u.value, 'z' in u.value ? 'z' : 'y', -1);
    }
    for (const o of this._fixed) this._move(o.position, 'z', 1);
  }

  // Slide v (its x, and its z or y) by the origin, remembering where it was.
  _move(v, zKey, sign) {
    this._kept.push(v, zKey, v.x, v[zKey]);
    v.x += sign * this.x;
    v[zKey] += sign * this.z;
  }

  // Put everything back, and the world matrices with it, so that between
  // frames a mesh's matrixWorld is where it is in the world.
  end(scene, camera) {
    const kept = this._kept;
    for (let i = 0; i < kept.length; i += 4) {
      kept[i].x = kept[i + 2];
      kept[i][kept[i + 1]] = kept[i + 3];
    }
    kept.length = 0;
    scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
  }
}

const mod = (a, n) => ((a % n) + n) % n;

// For something redrawn every frame from world positions (sparks, chips,
// drops): keep `object` within `reach` m of (x, z), on a whole metre, and
// write its buffers relative to where it is.
//
//   const at = anchor(mesh, first.x, first.z);
//   positions.setXYZ(i, p.x - at.x, p.y, p.z - at.z);
//
// Returns object.position. If it had to move, everything measured from the
// old spot must be written again (which, redrawn every frame, it is).
export function anchor(object, x, z, reach = 256) {
  const p = object.position;
  if (Math.abs(x - p.x) > reach || Math.abs(z - p.z) > reach) {
    p.x = Math.round(x);
    p.z = Math.round(z);
    if (!object.matrixAutoUpdate) object.updateMatrix();
  }
  return p;
}
