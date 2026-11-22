// The forest's ski runs, wherever the high country holds snow: the world is
// cut into RUNS.cell squares, and in each the top with the most snow below it
// (descent.js runDrop, on a lattice RUNS.step apart) is a run, named and on
// the map. Most squares have none: the high country is rare. A look over a
// square reads only the broad land and the snow line, so it is cheap, and
// done outright the first time it's asked.
//
// The High Country ski run, the one surveyed from the start (index.js), was
// there first: none of these is within RUNS.apart of it.
//
// No three.js in here: the tests read it.
//
// A run: { id: 'ski:run:<i>:<j>', i, j, x, z, drop (m of snow below), name }

import { runDrop } from './descent.js';

export const RUNS = {
  cell: 10000, // m, the side of a square
  step: 250, // m between the spots looked at in it
  apart: 3000, // m kept from the High Country ski run
};
// What a run is called: a word for the mountain and one for the run, each
// going round on a lattice so the squares round about have others.
const PEAKS = ['Raven', 'Ptarmigan', 'Marten', 'Ermine', 'Lynx', 'Cairn', 'Gable', 'Scree', 'Corrie', 'Tarn', 'Hoarfrost', 'Larch', 'Stag', 'Owl', 'Juniper', 'Granite'];
const KINDS = ['Bowl', 'Couloir', 'Glades', 'Chute', 'Face', 'Run'];
const wrap = (k, n) => ((k % n) + n) % n;
export function runName(seed, i, j) {
  return `${PEAKS[wrap(i * 7 + j * 11 + seed, PEAKS.length)]} ${KINDS[wrap(i * 2 + j * 5 + (seed >> 4), KINDS.length)]}`;
}

// gen: the WorldGen; landforms: the real places (kept clear of); home: the
// High Country ski run's top, or null.
export class SkiRuns {
  constructor(gen, landforms, { home = null } = {}) {
    this.gen = gen;
    this.landforms = landforms;
    this.home = home;
    this.cells = new Map(); // "i:j" -> run or null
  }

  // The run in square (i, j), or null.
  cell(i, j) {
    const k = `${i}:${j}`;
    if (!this.cells.has(k)) this.cells.set(k, this._look(i, j));
    return this.cells.get(k);
  }

  // Runs whose tops are in a rectangle of the world.
  within(x0, z0, x1, z1) {
    const C = RUNS.cell;
    const out = [];
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) {
        const r = this.cell(i, j);
        if (r && r.x >= x0 && r.x <= x1 && r.z >= z0 && r.z <= z1) out.push(r);
      }
    }
    return out;
  }

  // The run with this id, or null.
  byId(id) {
    const m = /^ski:run:(-?\d+):(-?\d+)$/.exec(String(id));
    return m ? this.cell(Number(m[1]), Number(m[2])) : null;
  }

  _look(i, j) {
    const { cell: C, step } = RUNS;
    let best = null;
    for (let z = j * C + step / 2; z < (j + 1) * C; z += step) {
      for (let x = i * C + step / 2; x < (i + 1) * C; x += step) {
        const drop = runDrop(this.gen, this.landforms, x, z);
        if (drop && (!best || drop > best.drop)) best = { x, z, drop };
      }
    }
    if (!best) return null;
    if (this.home && Math.hypot(best.x - this.home.x, best.z - this.home.z) < RUNS.apart) return null;
    return { id: `ski:run:${i}:${j}`, i, j, x: best.x, z: best.z, drop: best.drop, name: runName(this.gen.seed, i, j) };
  }
}
