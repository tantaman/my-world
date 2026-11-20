// A save registry with every domain the game ships, and nothing live behind
// them: enough to take a world apart and put it back together in Node.

import { SaveDomains } from '../../src/save/domains.js';
import { LOOSE } from '../../src/save/regions.js';
import { terrainSave } from '../../src/build/terrainEdits.js';
import { forestSave } from '../../src/build/forestry.js';
import { buildingsSave } from '../../src/build/buildings.js';
import { marksSave } from '../../src/map/marks.js';
import { firesSave } from '../../src/fires/fires.js';
import { landSave } from '../../src/save/land.js';

// The domains whose live halves are bound in the game's install functions.
// Their ids and scopes are part of the save format; keep them in step.
export const YOURS = [
  { id: 'inv', scope: 'yours' },
  { id: 'datum', scope: 'yours' },
  { id: 'player', scope: 'yours', local: 'state' },
  { id: 'hours', scope: 'yours', local: 'state' },
  { id: 'tracked', scope: 'yours', local: 'marks' },
  { id: 'blueprint', scope: 'yours' },
];

const nameSave = {
  id: 'name',
  scope: 'world',
  local: false,
  kinds: ['name'],
  encode: (name, put) => name && put(LOOSE, 'name', name),
  decode() {
    let name = '';
    return { take: (r, k, rest, v) => void (name = v), done: () => name };
  },
};

// live: { [id]: { collect, restore, ... } } to stand in for the game.
// except: ids to leave out, to stand in for an older game that didn't have them.
export function makeDomains(live = {}, { except = [] } = {}) {
  const domains = new SaveDomains();
  for (const d of [nameSave, landSave, terrainSave, forestSave, buildingsSave, firesSave, marksSave, ...YOURS]) {
    if (!except.includes(d.id)) domains.register({ ...d, ...(live[d.id] || {}) });
  }
  return domains;
}

export const plain = (elements) => {
  const out = {};
  for (const r of [...elements.keys()].sort()) out[r] = Object.fromEntries([...elements.get(r)].sort(([a], [b]) => (a < b ? -1 : 1)));
  return out;
};

export const fromPlain = (obj) => new Map(Object.entries(obj).map(([r, m]) => [r, new Map(Object.entries(m))]));
