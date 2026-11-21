// Global tunables. Most can be overridden from the URL, e.g.
//   ?seed=42&px=4&soft=0.3&view=5
//
// This is the only place that reads the address bar. Everything else asks
// CONFIG, or urlHas() when it needs to know whether the visitor said so
// explicitly (so a remembered setting doesn't override what they just typed).
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const urlHas = (key) => params.has(key);
const num = (key, fallback) => {
  const v = params.get(key);
  return v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
};

// ?q=low trades distance and grass density for speed on modest GPUs.
const low = params.get('q') === 'low';

export const CONFIG = {
  // The world is generated from this seed. Changing it gives a whole new forest.
  seed: num('seed', 20261119),
  // ...on this land (see world/lands.js): ?land=1 grows a world that is only
  // local the way every world was grown at first. 0 = the newest. A saved
  // world carries its own seed and land.
  land: num('land', 0),

  // Terrain streaming
  chunkSize: 64, // meters per chunk side
  viewRadius: num('view', low ? 3 : 4), // chunks loaded around the player
  // meters between terrain vertices by ring distance (0-1, 2, 3+)
  lodSteps: [1, 2, 4],

  // Grass is real geometry close to the player only
  grassRadius: num('grass', low ? 28 : 40),
  grassTile: 16,
  grassDensity: num('grassDensity', low ? 4.5 : 7), // max blades per m²

  // The picture. Without pixel art it is drawn as fine as the screen, but no
  // more than this many lines tall: past that it's drawn smaller and blown up
  // smoothly, which a big, dense screen barely shows and the card feels a lot.
  sharpLines: num('sharp', low ? 720 : 1080),
  // Ambient occlusion: how much a nook or a foot of a trunk is shut off from
  // the sky's light, 0..1 (0 = not worked out at all).
  ao: num('ao', low ? 0 : 0.85),

  // Pixel art: ?pixel turns it on (it's on the settings panel too).
  pixelArt: params.has('pixel') && params.get('pixel') !== '0',
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

  // Player (m/s). A brisk hiking walk; much faster than this and a real
  // person breaks into a jog, so the stride starts to look frantic.
  walkSpeed: 2.2,
  runSpeed: 7.5,
  jumpSpeed: 6.2,
  gravity: 19,

  // Wildlife: 0 = none, 1 = the usual, 2 = twice as many about.
  animals: num('animals', 1),

  // Building
  creative: params.has('creative'), // build without gathering materials
  clearBuild: params.has('clearbuild'), // forget what was built and changed in this (local) world

  // ?w=<id> opens a world kept on the save server
  worldId: (params.get('w') || '').trim().toLowerCase(),

  mute: params.has('mute'),
  reset: params.has('reset'),
  debug: params.has('debug'),
};
