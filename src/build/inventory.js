// What you're carrying: materials gathered and spent as you build.
//
// The materials are a list, not four fields, so a feature can add its own
// (inventory.define({ id: 'clay', label: 'clay', format: (v) => `${v} kg` }))
// and the HUD line and the save pick it up. One that is `optional` is only
// on the line while you have some: what most people never carry stays off it.

import * as pictures from './pictures.js';

const tenths = (m) => (Math.round(m * 10) / 10).toString();

// icon: what it looks like in your pack (src/pack/picture.js)
export const MATERIALS = [
  { id: 'log', label: 'logs', format: (v) => `${tenths(v)} m`, icon: pictures.LOG },
  { id: 'timber', label: 'timber', format: (v) => `${tenths(v)} m`, icon: pictures.TIMBER },
  { id: 'stone', label: 'stone', format: (v) => `${v}`, icon: pictures.STONE },
  { id: 'soil', label: 'soil', format: (v) => `${v.toFixed(1)} m³`, icon: pictures.SOIL },
];

export class Inventory {
  // creative: everything is to hand and nothing is used up
  constructor({ creative = false, materials = MATERIALS } = {}) {
    this.creative = creative;
    this.kinds = [];
    this.amounts = {}; // id -> how much; this is what is saved
    this.dirty = false;
    for (const m of materials) this.define(m);
  }

  define(material) {
    if (this.kinds.some((k) => k.id === material.id)) throw new Error(`material "${material.id}" is already defined`);
    this.kinds.push({ format: (v) => `${v}`, ...material });
    if (!(material.id in this.amounts)) this.amounts[material.id] = 0;
  }

  have(kind, n) {
    return this.creative || this.amounts[kind] >= n - 1e-6;
  }

  spend(kind, n) {
    if (!this.creative) this.amounts[kind] = Math.max(0, this.amounts[kind] - n);
    this.dirty = true;
  }

  gain(kind, n) {
    this.amounts[kind] += n;
    this.dirty = true;
  }

  // "logs 4 m · timber 0 m · stone 2 · soil 0.0 m³"
  line() {
    if (this.creative) return 'creative · unlimited materials';
    return this.kinds
      .filter((k) => !k.optional || this.amounts[k.id] > 1e-6)
      .map((k) => `${k.label} ${k.format(this.amounts[k.id])}`)
      .join(' · ');
  }

  load(data) {
    if (!data || typeof data !== 'object') return;
    for (const id in data) if (Number.isFinite(data[id])) this.amounts[id] = data[id];
    this.dirty = false;
  }
}

export { tenths };
