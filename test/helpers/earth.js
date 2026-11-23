// The real Earth (src/world/earth.js) for a test, with the tiles it needs
// fetched as the game fetches them: tilesFor(boxes) and they're in.

import { Earth, inflate, tilesIn, searchedAtFirst, detailList } from '../../src/world/earth.js';
import { EARTH_TILES, CLIMATE, EARTH_DETAILS } from '../../src/world/earthTiles.js';
import { HIKES } from '../../src/world/hikes.js';

const bytes = new Map(); // name -> inflated bytes, kept across tests
let climate = null;

async function tileBytes(name) {
  const load = EARTH_TILES[name] || EARTH_DETAILS[name].load;
  if (!bytes.has(name)) bytes.set(name, await inflate((await load()).default));
  return bytes.get(name);
}

async function climateOf() {
  if (!climate) {
    const c = (await CLIMATE()).default;
    climate = { names: c.names, bytes: await inflate(c.bytes) };
  }
  return climate;
}

// An Earth with the tiles under each box ([x0, z0, x1, z1], game m) and the
// climate.
export async function earthFor(boxes = []) {
  const earth = new Earth({ places: HIKES, details: EARTH_DETAILS });
  earth.setClimate(await climateOf());
  await addTiles(earth, boxes);
  return earth;
}

// And more tiles into one already made.
export async function addTiles(earth, boxes) {
  const names = new Set();
  for (const b of boxes) tilesIn(b[0], b[1], b[2], b[3], names, detailList(EARTH_DETAILS));
  for (const name of names) if (!earth.has(name)) earth.addTile({ name, bytes: await tileBytes(name) });
  return earth;
}

// A box r m round (x, z).
export const around = (x, z, r) => [x - r, z - r, x + r, z + r];

// The Earth as the game has it when it opens: round the start and round
// every hike (world/index.js), where what's grown from the seed is looked for.
let opening = null;
export const earthAtFirst = () => (opening ??= earthFor(searchedAtFirst(HIKES)));
