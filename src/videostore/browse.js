// What you do in the video store, as rules: the tapes in your hands, renting
// them at the counter, what you have out and when it's due back, returning
// it, and the late fees.
//
// Up to HANDS boxes at a time: take one down and it's in your hands (and
// gone from its slot); put it back and it's on the shelf again. At the
// counter the clerk rings up everything you're holding: a new release goes
// out for two nights, anything else for five, the kids' tapes cheapest; the
// previously viewed tapes on the far ends of the aisles are for sale, and
// those are yours to keep. Due back means by midnight on the day: real
// days, on your own calendar. Bring one back late and there's a fee for
// each day, which the clerk lets slide (there's no money in the forest).
//
// What you have out, what you've bought and your membership card are yours,
// saved (index.js registers them): which films they are is kept by title as
// well as id, so nothing hangs on the catalog growing the same ids for ever.
//
// No three.js and no DOM in here: the tests read it.
//
//   new Counter()
//   .hands                 [{ id, title, key }]: key, the slot it came from
//   .out                   [{ id, title, key, at, due, kind }]: rented, not back
//   .owned                 [{ id, title }]: bought
//   .take(film, key) -> 'ok' | 'full' | 'have'
//   .putBack() -> what was put back, or null
//   .dropAll() -> everything that was in your hands
//   .checkout(now) -> a receipt: { items, total, due, buy }
//   .returnAll(now) -> { items: [{ title, late, fee }], fees }
//   .taken()               the slots whose boxes aren't on the shelf: Set of keys
//   .serialize() / .load(data) / Counter.validate(raw)
//
// Emits 'change' when any of it changes.

import { Emitter } from '../core/events.js';
import { SECTIONS } from './floorplan.js';

export const HANDS = 3; // boxes you can carry at once
export const DAY = 24 * 60 * 60 * 1000; // ms
// How each section's tapes go out: dollars, nights, a day's late fee; or for sale.
export const TERMS = {
  new: { price: 3.99, nights: 2, late: 1.5, label: 'new release' },
  catalog: { price: 2.49, nights: 5, late: 1, label: '5-night rental' },
  family: { price: 0.99, nights: 5, late: 0.5, label: 'kids’ 5-night rental' },
  picks: { price: 1.99, nights: 5, late: 1, label: 'staff pick, 5 nights' },
  sale: { price: 9.99, buy: true, label: 'previously viewed: yours to keep' },
};
const KEPT_OWNED = 200; // the most bought tapes remembered

export const termsOf = (film) => TERMS[(SECTIONS[film.section] && SECTIONS[film.section].rent) || 'catalog'];
export const money = (v) => `$${v.toFixed(2)}`;

// Midnight at the end of the day `nights` days after `now`, on this
// machine's calendar.
export function dueAt(now, nights) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + nights);
  return d.getTime();
}

// How many days late something due at `due` is, brought back at `now`.
export const daysLate = (due, now) => (now <= due ? 0 : Math.ceil((now - due) / DAY));

export class Counter extends Emitter {
  constructor() {
    super();
    this.hands = [];
    this.out = [];
    this.owned = [];
    this.card = null; // { number, since, rentals }
  }

  take(film, key) {
    if (this.hands.some((h) => h.key === key)) return 'have';
    if (this.hands.length >= HANDS) return 'full';
    this.hands.push({ id: film.id, title: film.title, key, section: film.section });
    this.emit('change');
    return 'ok';
  }

  putBack() {
    const h = this.hands.pop() || null;
    if (h) this.emit('change');
    return h;
  }

  dropAll() {
    const all = this.hands;
    this.hands = [];
    if (all.length) this.emit('change');
    return all;
  }

  // Ring up what's in your hands. byId(id) -> the film (for its terms).
  checkout(now, byId, number = null) {
    if (!this.hands.length) return null;
    const items = [];
    let total = 0;
    let due = Infinity;
    for (const h of this.hands) {
      const film = byId(h.id) || { section: h.section };
      const T = termsOf(film);
      total += T.price;
      if (T.buy) {
        this.owned.push({ id: h.id, title: h.title });
        items.push({ title: h.title, price: T.price, buy: true });
      } else {
        const d = dueAt(now, T.nights);
        due = Math.min(due, d);
        this.out.push({ id: h.id, title: h.title, key: h.key, at: now, due: d, kind: film.section === 'new' ? 'new' : 'catalog' });
        items.push({ title: h.title, price: T.price, due: d });
      }
    }
    if (this.owned.length > KEPT_OWNED) this.owned.splice(0, this.owned.length - KEPT_OWNED);
    if (!this.card) this.card = { number: number || '0000 0000 0000', since: now, rentals: 0 };
    this.card.rentals += items.filter((i) => !i.buy).length;
    this.hands = [];
    this.emit('change');
    return { items, total: Math.round(total * 100) / 100, due: Number.isFinite(due) ? due : null, buy: items.every((i) => i.buy) };
  }

  returnAll(now) {
    if (!this.out.length) return null;
    const items = this.out.map((o) => {
      const late = daysLate(o.due, now);
      const T = o.kind === 'new' ? TERMS.new : TERMS.catalog;
      return { title: o.title, key: o.key, id: o.id, late, fee: late * T.late };
    });
    this.out = [];
    this.emit('change');
    return { items, fees: Math.round(items.reduce((n, i) => n + i.fee, 0) * 100) / 100 };
  }

  // The slots whose boxes are off the shelf, by you: in your hands, or out
  // at home with you.
  taken() {
    return new Set([...this.hands.map((h) => h.key), ...this.out.map((o) => o.key)]);
  }

  serialize() {
    return { out: this.out.map((o) => ({ ...o })), owned: this.owned.map((o) => ({ ...o })), card: this.card && { ...this.card } };
  }

  load(data) {
    const d = Counter.validate(data);
    this.out = d.out;
    this.owned = d.owned;
    this.card = d.card;
    this.hands = [];
    this.emit('change');
  }

  // A save is bytes somebody sent us: keep only what has the right shape.
  static validate(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    const str = (v, n = 120) => typeof v === 'string' && v.length <= n;
    const out = (Array.isArray(r.out) ? r.out : [])
      .filter((o) => o && num(o.id) && str(o.title) && str(o.key, 40) && num(o.at) && num(o.due))
      .slice(0, 50)
      .map((o) => ({ id: o.id, title: o.title, key: o.key, at: o.at, due: o.due, kind: o.kind === 'new' ? 'new' : 'catalog' }));
    const owned = (Array.isArray(r.owned) ? r.owned : [])
      .filter((o) => o && num(o.id) && str(o.title))
      .slice(-KEPT_OWNED)
      .map((o) => ({ id: o.id, title: o.title }));
    const c = r.card;
    const card = c && typeof c === 'object' && str(c.number, 20) && num(c.since) && num(c.rentals) ? { number: c.number, since: c.since, rentals: Math.max(0, Math.floor(c.rentals)) } : null;
    return { out, owned, card };
  }
}
