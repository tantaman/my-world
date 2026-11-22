// The socket everyone builds over.
//
// One connection per person to the world's Durable Object. Changes go up as
// ops and come straight back down from everyone else; where people are
// standing goes both ways and is never stored, and so does anything else
// people here say to each other (say(), on a channel of its own).
//
// This is deliberately thin. There is no prediction to reconcile here: the
// builder already applies your own edits the moment you swing, the object is
// the only writer so its order is the order, and a change that loses a race
// loses it on one element, not on your afternoon. Nothing is ever rolled back.
//
// The object only lets in people it knows. A socket it closes with
// NOT_SIGNED_IN is not tried again: trying again would get the same answer.

import { NOT_SIGNED_IN } from './who.js';

const RETRY = [500, 1000, 2000, 4000, 8000, 15000];

export class Live {
  constructor({ id, handlers }) {
    this.id = id;
    this.on = handlers; // { ops, at, gone, here, say, reopen, state, denied }
    this.ws = null;
    this.me = null;
    this.gen = 0;
    this.attempt = 0;
    this.timer = 0;
    this.want = false;
    this.acks = new Map(); // batch id -> { resolve, reject }
    this.nextBatch = 1;
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  open(gen) {
    this.want = true;
    this.gen = gen || this.gen;
    this.#connect();
  }

  close() {
    this.want = false;
    clearTimeout(this.timer);
    if (this.ws) this.ws.close();
    this.ws = null;
  }

  // -> a promise that settles when the object has taken the batch.
  send(ops, extra = {}) {
    if (!this.connected) return Promise.reject(new Error('not connected'));
    const id = this.nextBatch++;
    this.ws.send(JSON.stringify({ t: 'ops', id, ops, ...extra }));
    return new Promise((resolve, reject) => {
      this.acks.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.acks.delete(id)) reject(new Error('the save server did not answer'));
      }, 10000);
    });
  }

  // Where you are, and which hiker you are (player/hikers.js). Dropped on
  // the floor if the socket is down — it is only ever true for an instant
  // anyway. (Who you are signed in as, the object knows already.)
  at(x, z, yaw, who) {
    if (this.connected) this.ws.send(JSON.stringify(typeof who === 'string' ? { t: 'at', x, z, yaw, who } : { t: 'at', x, z, yaw }));
  }

  // Something for the others here, on a channel (`ch`), to everyone or to one
  // of them by id; the object says who it came from. Never stored, and
  // dropped if the socket is down. -> whether it went.
  say(ch, body, to = null) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify(to ? { t: 'say', ch, to, body } : { t: 'say', ch, body }));
    return true;
  }

  #connect() {
    if (!this.want || this.ws) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try {
      ws = new WebSocket(`${scheme}://${location.host}/api/worlds/${encodeURIComponent(this.id)}/live?since=${this.gen}`);
    } catch {
      return this.#retry();
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this.on.state?.('open');
    });
    ws.addEventListener('message', (e) => this.#heard(e.data));
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.#fail();
      this.on.state?.('closed');
      if (e.code === NOT_SIGNED_IN) {
        this.want = false;
        this.on.denied?.(e.reason);
        return;
      }
      this.#retry();
    });
    ws.addEventListener('error', () => {
      // 'close' always follows, and does the work.
      this.on.state?.('error');
    });
  }

  #heard(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === 'welcome') {
      this.me = msg.you;
      this.gen = msg.gen;
      if (msg.reopen) this.on.reopen?.();
      else if (msg.missed && msg.missed.length) this.on.ops?.(msg.missed, msg.gen);
      this.on.here?.(msg.here || []);
      return;
    }
    if (msg.t === 'ops') {
      this.gen = msg.gen;
      this.on.ops?.(msg.ops || [], msg.gen);
      return;
    }
    if (msg.t === 'ack') {
      const waiting = this.acks.get(msg.for);
      if (waiting) {
        this.acks.delete(msg.for);
        if (msg.error) waiting.reject(new Error(msg.error));
        else {
          this.gen = msg.gen;
          waiting.resolve(msg);
        }
      }
      return;
    }
    if (msg.t === 'at') return this.on.at?.(msg);
    if (msg.t === 'say') return this.on.say?.(msg);
    if (msg.t === 'gone') return this.on.gone?.(msg.id);
    if (msg.t === 'reopen') return this.on.reopen?.();
  }

  #fail() {
    for (const [, waiting] of this.acks) waiting.reject(new Error('the connection dropped'));
    this.acks.clear();
  }

  #retry() {
    if (!this.want) return;
    clearTimeout(this.timer);
    const wait = RETRY[Math.min(this.attempt++, RETRY.length - 1)];
    this.timer = setTimeout(() => this.#connect(), wait);
  }
}
