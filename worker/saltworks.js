// A transient match on the world's authenticated live socket. Inputs advance
// the clock while somebody is playing, so idle worlds can still hibernate.
import { Match } from '../src/saltworks/match.js';
import { IDLE as NO_INPUT, controls } from '../src/saltworks/motion.js';

const INTERVAL = 35; // ms between accepted inputs from a client
const IDLE = 8000; // ms to release a slot whose client has stopped reporting
const MAX_ELAPSED = 250; // ms simulated together after a lag spike
const MAX_VISITORS = 40; // ten active slots and up to thirty waiting

export class ArenaRoom {
  constructor() {
    this.clients = new Map();
    this.match = null;
    this.last = 0;
  }

  receive(id, name, msg, now) {
    if (msg.action === 'leave') return this.leave(id, now);
    if (msg.action !== 'input' || !Number.isSafeInteger(msg.seq) || msg.seq < 0) return;
    const previous = this.clients.get(id);
    if (previous !== undefined && now - previous < INTERVAL) return;
    this.advance(now);
    if (!this.clients.has(id) && this.clients.size >= MAX_VISITORS) return { full: true, seq: msg.seq };
    if (!this.match) {
      this.match = new Match();
      this.epoch = crypto.randomUUID();
    }
    this.clients.set(id, now);
    this.match.join(id, name);
    const slot = this.match.slot(id);
    if (slot && msg.slot === slot.id && msg.round === this.match.round) this.match.input(id, controls(msg));
    return { epoch: this.epoch, seq: msg.seq, state: this.match.snapshot(id) };
  }

  advance(now) {
    if (this.match) {
      for (const [id, seen] of this.clients) {
        const silent = now - seen;
        if (silent >= IDLE) {
          this.clients.delete(id);
          this.match.leave(id);
        } else if (silent > MAX_ELAPSED) {
          const fighter = this.match.slot(id);
          if (fighter) fighter.input = { ...NO_INPUT, yaw: fighter.yaw, pitch: fighter.pitch };
        }
      }
      if (this.match.empty) this.match = null;
      else {
        this.match.fill();
        this.match.advance(Math.max(0, Math.min(MAX_ELAPSED, now - this.last)) / 1000);
      }
    }
    this.last = now;
  }

  leave(id, now) {
    if (!this.clients.has(id)) return;
    this.advance(now);
    this.clients.delete(id);
    this.match?.leave(id);
    if (this.match?.empty) this.match = null;
    else this.match?.fill();
  }
}
