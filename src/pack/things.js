// What's yours: the things you have come by, for the pack to list.
//
// A feature that gives you something to have says so with a source: a
// function that returns what you have of it now, or nothing.
//
//   things.add(() => (worn ? [{ label: 'a jetpack', note: 'on your back', icon: JETPACK }] : null));
//
//   label   what it is, as you'd say you had it: 'logs', 'a jetpack', 'your horse'
//   note    how much of it, or how it stands: '4 m', 'on your back' (optional)
//   icon    what it looks like: a picture (picture.js) (optional, but the
//           pack is a poorer place without it)
//   empty   true for what you have none of just now: a material run out.
//           It is still listed, greyed (optional)
//
// A source is asked each time the pack is looked into. It reads its own
// feature's state and nothing is kept here, so the pack saves nothing: what
// you have is saved by whatever gave it to you, spelled as it always was.
// Things are listed in the order their sources were added.
//
// What everyone always has (the axe, the skis, the inner tube) isn't for
// this list: those are things to do, and the commands list them.

import { tag } from './picture.js';
import { ALL } from './pictures.js';

export class Things {
  constructor() {
    this.sources = [];
  }

  add(source) {
    if (typeof source !== 'function') throw new Error('what is yours is a function: () => [{ label, note }]');
    this.sources.push(source);
  }

  // -> [{ label, note, icon, empty }], note '' where there's nothing to add,
  //    icon null where it has none
  list() {
    const out = [];
    for (const source of this.sources) {
      const got = source();
      if (!got) continue;
      for (const t of got) if (t && t.label) out.push({ label: String(t.label), note: t.note ? String(t.note) : '', icon: t.icon || null, empty: !!t.empty });
    }
    return out;
  }
}

// A list of things as one string: while it stays the same there is nothing
// to write again.
export function told(things) {
  let s = '';
  for (const t of things) s += `${t.label}:${t.note}:${t.icon ? tag(t.icon) : ''}:${t.empty ? 0 : 1}|`;
  return s;
}

// What you carry of each material (build/inventory.js), as things: the ones
// the HUD's line has, one to a row, in the pictures the materials were
// defined with.
//   stock: { creative, kinds: [{ id, label, format, optional, icon }], amounts }
export function materials(stock) {
  if (stock.creative) return [{ label: 'materials', note: 'unlimited', icon: ALL }];
  return stock.kinds
    .filter((k) => !k.optional || stock.amounts[k.id] > 1e-6)
    .map((k) => ({ label: k.label, note: k.format(stock.amounts[k.id]), icon: k.icon || null, empty: !(stock.amounts[k.id] > 1e-6) }));
}
