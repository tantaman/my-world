// Who is in the town, and whose browser runs the match.
//
// Everyone in a shared world who walks in through the gate is in the same
// match. The first one in runs it (the host: match.js); everyone after is a
// guest of theirs, takes a bot's place, and is told how things stand a dozen
// times a second. They say so to each other over the world's socket
// (save.say, on the 'skirmish' channel), and none of it is kept:
//
//   { t: 'in', since, host }   I'm in the town (said every couple of seconds,
//                              so someone arriving hears of the match, and
//                              someone at the gate can see how many are in);
//                              `since`: when I walked in; `host`: I run it
//   { t: 'out' }               I've left
//   { t: 'snap', s }           host -> guest: how things stand (match.snapshot)
//   { t: 'me' | 'shot' | 'throw' | 'buy' | 'drop', … }
//                              guest -> host: what I'm doing (match.hear)
//
// If the host leaves, or goes quiet, whoever has been in longest takes the
// match on from what they were last told. If two start one at the same
// moment, the later gives theirs up and joins the earlier.
//
// Alone, or in a world that isn't on the server, you're a host with nobody
// to tell: nothing is said at all.
//
// No three.js in here, and no socket: it is handed a way to say things, and
// told what's heard.
//
// Emits:
//   'match'  (match | null)   there's a match to draw (a new one each time
//                             you walk in, or become someone's guest)

import { Emitter } from '../core/events.js';
import { Match } from './match.js';

export const CHANNEL = 'skirmish';
const HELLO = 2; // s between saying you're in
const SILENT = 7; // s without a word before someone is taken to have left
const WAIT = 1.2; // s to hear of a match already going before starting one
const SNAP = 1 / 12; // s between the host saying how things stand
const HOSTLESS = 4; // s without a word from the host before someone takes the match on

// Was a (who came in at `sinceA`) in before b?
const before = (sinceA, a, sinceB, b) => sinceA < sinceB || (sinceA === sinceB && String(a) < String(b));

export class Session extends Emitter {
  // say(body, to): tell the others in this world (or one of them, by id);
  //   -> false if there's nobody to tell
  // who(): { id, name }, who you are to them: id null when there's no server
  // others(): how many other people are in this world at all
  constructor({ say = () => false, who = () => ({ id: null, name: 'You' }), others = () => 0, rules = undefined } = {}) {
    super();
    this._say = say;
    this.who = who;
    this.others = others;
    this.rules = rules;
    this.inside = new Map(); // everyone else in the town: id -> { since, host, heard, name }
    this.state = 'out'; // 'out' | 'joining' | 'host' | 'guest'
    this.match = null;
    this.hostId = null;
    this.me = { id: 'solo', name: 'You' };
    this.since = 0;
    this.clock = 0;
    this.waited = 0;
    this.helloIn = 0;
    this.snapIn = 0;
    this.heardHost = 0;
  }

  // Walk in.
  enter() {
    if (this.state !== 'out') return;
    const { id, name } = this.who();
    this.me = { id: id || 'solo', name: name || 'You' };
    this.since = Date.now() + Math.random();
    this.waited = 0;
    this.state = 'joining';
    // nobody else in the world, or no world to be in: there's no match to hear of
    if (!id || this.others() === 0) return this._host();
    this._hello();
    // someone already said they run one
    const host = this._hostKnown();
    if (host) this._guest(host);
  }

  // Walk out.
  leave() {
    if (this.state === 'out') return;
    this._say({ t: 'out' });
    this.state = 'out';
    this.match = null;
    this.hostId = null;
    this.emit('match', null);
  }

  _hostKnown() {
    let best = null;
    for (const [id, m] of this.inside) if (m.host && (!best || before(m.since, id, this.inside.get(best).since, best))) best = id;
    return best;
  }

  _hello() {
    this.helloIn = HELLO;
    this._say({ t: 'in', since: this.since, host: this.state === 'host' });
  }

  // Start a match, with everyone who's already in the town in it.
  _host() {
    this.state = 'host';
    this.hostId = this.me.id;
    this.match = new Match({ me: this.me, host: true, seed: (Math.random() * 2 ** 31) | 0, rules: this.rules });
    this.match.join(this.me.id, this.me.name);
    for (const [id, m] of this.inside) this.match.join(id, m.name);
    this.emit('match', this.match);
    if (this.who().id) this._hello();
  }

  // Be someone's guest.
  _guest(host) {
    this.state = 'guest';
    this.hostId = host;
    this.heardHost = this.clock;
    this.match = new Match({ me: this.me, host: false, rules: this.rules });
    this.emit('match', this.match);
  }

  // The host has gone: whoever has been in longest runs it from here.
  _succeed() {
    let next = this.me.id;
    let since = this.since;
    for (const [id, m] of this.inside) {
      if (before(m.since, id, since, next)) {
        next = id;
        since = m.since;
      }
    }
    this.hostId = next;
    this.heardHost = this.clock;
    if (next !== this.me.id) return;
    this.state = 'host';
    this.match.promote([this.me.id, ...this.inside.keys()]);
    this._hello();
  }

  // Something said on the channel, by `from` (called `name`).
  hear(from, name, body) {
    if (!body || typeof body !== 'object' || from === this.me.id) return;
    if (body.t === 'in') {
      const since = Number.isFinite(body.since) ? body.since : Infinity;
      const known = this.inside.has(from);
      this.inside.set(from, { since, host: !!body.host, heard: this.clock, name: name || 'Someone' });
      if (this.state === 'host') {
        // two of us running one: whoever was in first keeps theirs
        if (body.host && before(since, from, this.since, this.me.id)) return this._guest(from);
        this.match.join(from, name);
        if (!known) this._hello();
      } else if (body.host && (this.state === 'joining' || (this.state === 'guest' && from !== this.hostId && this._hostKnown() === from))) {
        this._guest(from);
      }
      return;
    }
    if (body.t === 'out') return this.gone(from);
    if (this.state === 'guest') {
      if (body.t !== 'snap' || from !== this.hostId) return;
      this.heardHost = this.clock;
      this.match.apply(body.s);
    } else if (this.state === 'host') this.match.hear(from, body);
  }

  // Someone has left the town (or the world).
  gone(id) {
    if (!this.inside.delete(id)) return;
    if (this.state === 'host') this.match.leave(id);
    else if (this.state === 'guest' && id === this.hostId) this._succeed();
  }

  // Each frame. you: what you'd do (see the top of match.js), while you're in.
  update(dt, you = null) {
    this.clock += dt;
    for (const [id, m] of this.inside) if (this.clock - m.heard > SILENT) this.gone(id);
    if (this.state === 'out') return;
    if ((this.helloIn -= dt) <= 0 && this.who().id) this._hello();
    if (this.state === 'joining') {
      if ((this.waited += dt) > WAIT) this._host();
      return;
    }
    if (this.state === 'guest' && this.clock - this.heardHost > HOSTLESS) {
      this.inside.delete(this.hostId);
      this._succeed();
    }
    this.match.update(dt, you);
    if (this.state === 'host') {
      if ((this.snapIn -= dt) > 0) return;
      this.snapIn = SNAP;
      const s = this.match.snapshot();
      for (const id of this.inside.keys()) this._say({ t: 'snap', s }, id);
    } else {
      for (const msg of this.match.out.splice(0)) this._say(msg, this.hostId);
    }
  }
}
