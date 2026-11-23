// The deathmatch: everyone for themselves, a frag for each fighter you
// rail, one taken away for falling into the void. First to the frag limit
// wins, or whoever has most when the clock runs out.
//
// No three.js in here, and nothing about where anyone is: the arena
// (arena.js) says who fragged whom, and this keeps the score.
//
// Emits:
//   'frag'   ({ killer, victim, how })   killer is null for a fall
//   'lead'   ('taken' | 'tied' | 'lost') the fighter marked `me` went into,
//            level with, or out of first place
//   'end'    ({ winner, standings })

import { Emitter } from '../core/events.js';

export const RELOAD = 1.5; // s for the railgun to charge again

export const RULES = {
  frags: 20, // the frag limit
  time: 600, // s on the clock
};

export class Match extends Emitter {
  // fighters: [{ id, name, me? }]
  constructor(fighters, rules = RULES) {
    super();
    this.rules = rules;
    this.fighters = fighters.map((f) => ({ id: f.id, name: f.name, me: !!f.me, frags: 0, deaths: 0 }));
    this.byId = new Map(this.fighters.map((f) => [f.id, f]));
    this.time = 0;
    this.over = false;
    this.winner = null;
  }

  get left() {
    return Math.max(0, this.rules.time - this.time);
  }

  // victim was fragged by killer (an id), or fell (killer null), or railed
  // themselves somehow (killer === victim).
  frag(killerId, victimId, how = 'rail') {
    if (this.over) return;
    const victim = this.byId.get(victimId);
    if (!victim) return;
    const killer = killerId === null || killerId === victimId ? null : this.byId.get(killerId);
    const was = this._myPlace();
    victim.deaths++;
    if (killer) killer.frags++;
    else victim.frags--;
    this.emit('frag', { killer, victim, how });
    const now = this._myPlace();
    if (was && now) {
      const ahead = (p) => p.place === 1 && !p.tied; // first, alone
      const level = (p, f) => p.place === 1 && p.tied && f > 0; // sharing first, with something to show for it
      const mine = this.fighters.find((f) => f.me).frags;
      if (ahead(now) && !ahead(was)) this.emit('lead', 'taken');
      else if (level(now, mine) && !level(was, mine)) this.emit('lead', 'tied');
      else if (ahead(was) && !ahead(now) && !level(now, mine)) this.emit('lead', 'lost');
    }
    if (killer && killer.frags >= this.rules.frags) this._end();
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.time >= this.rules.time) this._end();
  }

  // Everyone, best first: most frags, then fewest deaths, then by name.
  standings() {
    return [...this.fighters].sort((a, b) => b.frags - a.frags || a.deaths - b.deaths || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // Where a fighter stands: { place (1 first), tied }
  placeOf(id) {
    const f = this.byId.get(id);
    if (!f) return null;
    const better = this.fighters.filter((o) => o.frags > f.frags).length;
    const level = this.fighters.filter((o) => o !== f && o.frags === f.frags).length;
    return { place: better + 1, tied: level > 0 };
  }

  _myPlace() {
    const me = this.fighters.find((f) => f.me);
    return me ? this.placeOf(me.id) : null;
  }

  _end() {
    this.over = true;
    const standings = this.standings();
    this.winner = standings[0];
    this.emit('end', { winner: this.winner, standings });
  }
}

// 1st, 2nd, 3rd, 4th...
export function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${s}`;
}
