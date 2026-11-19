// Global tunables. Most can be overridden from the URL, e.g.
//   ?seed=42&px=4&soft=0.3&view=5
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const num = (key, fallback) => {
  const v = params.get(key);
  return v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
};

// ?q=low trades distance and grass density for speed on modest GPUs.
const low = params.get('q') === 'low';

export const CONFIG = {
  // The world is generated from this seed. Changing it gives a whole new forest.
  seed: num('seed', 20261119),

  // Terrain streaming
  chunkSize: 64, // meters per chunk side
  viewRadius: num('view', low ? 3 : 4), // chunks loaded around the player
  // meters between terrain vertices by ring distance (0-1, 2, 3+)
  lodSteps: [1, 2, 4],

  // Grass is real geometry close to the player only
  grassRadius: num('grass', low ? 28 : 40),
  grassTile: 16,
  grassDensity: num('grassDensity', low ? 4.5 : 7), // max blades per m²

  // Pixel look
  // Target height (in "art pixels") of the low-resolution render.
  pixelTargetHeight: num('lines', 300),
  // Explicit pixel size (screen px per art pixel). 0 = derive from pixelTargetHeight.
  pixelSize: num('px', 0),
  // 0 = hard nearest-neighbour pixels, 1 = fully bilinear. In between is the
  // "is it pixel art or is it a painting?" zone.
  softness: num('soft', 0.55),
  outline: num('outline', 0.28),
  colorLevels: num('levels', 36),

  // Lighting
  shadowMapSize: low ? 1024 : 2048,
  shadowExtent: 60,
  timeOfDay: num('time', 16.6), // hours, 0-24

  // Player
  walkSpeed: 3.4,
  runSpeed: 7.5,
  jumpSpeed: 6.2,
  gravity: 19,

  reset: params.has('reset'),
  debug: params.has('debug'),
};
