// What a saved world is.
//
// The forest is procedural, so a snapshot holds a seed and nothing else about
// the trees, the rocks or the shape of the land as it was grown. What it does
// hold is everything you changed: the ground you moved, the trees you felled,
// what you built, the places you marked, and where you were standing.
//
// Keep this honest in both directions — this file and regions.js are the only
// places that know the shape of a save. The game only ever handles a whole
// snapshot; regions.js is what cuts one up for storage and puts it back.

export const SNAPSHOT_VERSION = 1;

export function collectSnapshot({ seed, name = '', builder, marks, player, sky }) {
  return {
    v: SNAPSHOT_VERSION,
    seed,
    name,
    saved: Date.now(),
    world: builder.snapshot(),
    marks: { marks: marks.list(), tracked: marks.tracked },
    player: {
      x: round(player.pos.x),
      z: round(player.pos.z),
      yaw: round(player.yaw, 1000),
      camYaw: round(player.camYaw, 1000),
      camPitch: round(player.camPitch, 1000),
    },
    hours: round(sky.hours, 1000),
  };
}

// A snapshot from the server is just bytes somebody else sent us, so check the
// shape before the rest of the game trusts it. -> a snapshot, or null.
export function validateSnapshot(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.v !== SNAPSHOT_VERSION) return null;
  if (!Number.isFinite(data.seed)) return null;
  const world = data.world && typeof data.world === 'object' ? data.world : {};
  const player = data.player && typeof data.player === 'object' ? data.player : {};
  const marks = data.marks && typeof data.marks === 'object' ? data.marks : {};
  return {
    v: SNAPSHOT_VERSION,
    seed: Math.trunc(data.seed),
    name: typeof data.name === 'string' ? data.name.slice(0, 80) : '',
    saved: Number.isFinite(data.saved) ? data.saved : 0,
    world: {
      v: 1,
      inv: world.inv && typeof world.inv === 'object' ? world.inv : {},
      datum: world.datum && typeof world.datum === 'object' ? world.datum : null,
      terrain: Array.isArray(world.terrain) ? world.terrain : [],
      forest: world.forest && typeof world.forest === 'object' ? world.forest : null,
      buildings: Array.isArray(world.buildings) ? world.buildings : [],
    },
    marks: {
      marks: Array.isArray(marks.marks) ? marks.marks : [],
      tracked: typeof marks.tracked === 'string' ? marks.tracked : null,
    },
    player: {
      x: Number.isFinite(player.x) ? player.x : null,
      z: Number.isFinite(player.z) ? player.z : null,
      yaw: Number.isFinite(player.yaw) ? player.yaw : 0,
      camYaw: Number.isFinite(player.camYaw) ? player.camYaw : undefined,
      camPitch: Number.isFinite(player.camPitch) ? player.camPitch : undefined,
    },
    hours: Number.isFinite(data.hours) ? data.hours : null,
  };
}

// Where to stand when a world opens. Falls back to the natural spawn.
export function spawnFrom(snapshot, fallback) {
  const p = snapshot && snapshot.player;
  if (!p || p.x === null || p.z === null) return fallback;
  return { x: p.x, z: p.z, yaw: p.yaw, camYaw: p.camYaw, camPitch: p.camPitch };
}

const round = (v, f = 100) => Math.round(v * f) / f;
