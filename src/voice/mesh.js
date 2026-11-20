// A line to each person here: one WebRTC connection apiece, carrying audio
// both ways, browser to browser.
//
// The world's object only carries the few small messages that set a
// connection up (`signal`: an offer, an answer, and the routes each side
// finds to the other). The audio itself never goes near the server.
//
//   - Of any two people, the one whose id sorts first calls and the other
//     answers, so they never both call at once.
//   - A call is numbered (`n`), and anything about an older one is ignored,
//     so calling again is always safe: a call that hasn't connected after a
//     while, or that failed, is simply made again, a little later each time.
//   - Each connection carries one audio track each way and is never
//     renegotiated. Your microphone, once you have one, is put onto every
//     connection's sender at once (replaceTrack), and taken off again when
//     you let it go.
//
// Nothing here knows about a browser beyond RTCPeerConnection, which is
// handed in (`RTC`), so it can be stood in for in tests.

import { Emitter } from '../core/events.js';

// ms a call is given to connect before it is made again: the first try, and
// then each one after
const PATIENCE = [6000, 10000, 20000, 40000, 60000];
const SERVERS_LAST = 6 * 3600 * 1000; // ms before asking for the ICE servers again

// Emits:
//   'track'  (id, track)   their voice
//   'drop'   (id)          the line to them is gone (their voice with it)
//   'state'  (id, state)   how the line is: 'new', 'connecting', 'connected',
//                          'disconnected', 'failed'
export class Mesh extends Emitter {
  // signal(to, body)  send to one person, through the world's object
  // servers()         -> a promise of the ICE servers to use (see worker/ice.js)
  // RTC               RTCPeerConnection
  constructor({ signal, servers = async () => [], RTC = globalThis.RTCPeerConnection } = {}) {
    super();
    this.signal = signal;
    this.servers = servers;
    this.RTC = RTC;
    this.me = null;
    this.here = new Set();
    this.links = new Map(); // id -> link
    this.track = null;
    this._ice = null;
    this._iceAt = 0;
  }

  // Who is here, and who you are. Calls whoever is new and hangs up on
  // whoever has gone; a new `me` (you came back on a new socket) starts over.
  sync(me, ids) {
    if (me !== this.me) {
      this.closeAll();
      this.me = me;
    }
    const was = this.here;
    this.here = new Set(ids);
    // Only hang up on people who were here and have gone: a call can come
    // from someone before word of where they are standing has.
    for (const id of was) if (!this.here.has(id)) this.#hangUp(id);
    if (!me || !this.RTC) return;
    for (const id of this.here) if (!this.links.has(id) && me < id) this.#call(id, 0);
  }

  // Something someone sent about a call.
  heard(from, body) {
    if (!from || !body || typeof body !== 'object' || typeof body.n !== 'string' || !this.me || !this.RTC) return;
    const sdp = body.sdp && typeof body.sdp === 'object' ? body.sdp : null;
    if (sdp && sdp.type === 'offer') return void this.#answer(from, body.n, sdp);
    const link = this.links.get(from);
    if (!link || link.n !== body.n) return; // about a call that is over
    if (sdp && sdp.type === 'answer' && link.calling && !link.ready) return void this.#answered(link, sdp);
    if (body.ice && typeof body.ice === 'object') {
      if (link.ready) link.pc.addIceCandidate(body.ice).catch(() => {});
      else link.queued.push(body.ice);
    }
  }

  // What to send: your microphone, or null for nothing.
  setTrack(track) {
    this.track = track;
    for (const link of this.links.values()) this.#send(link);
  }

  // Call again whoever hasn't connected in time; give up on calls that came
  // in and never got anywhere.
  update(now = performance.now()) {
    for (const link of [...this.links.values()]) {
      if (link.state === 'connected') continue;
      if (now - link.since < PATIENCE[Math.min(link.tries, PATIENCE.length - 1)]) continue;
      if (link.calling && this.here.has(link.id)) this.#call(link.id, link.tries + 1);
      else this.#hangUp(link.id);
    }
  }

  // -> [{ id, state, calling }], for the console and the tests
  list() {
    return [...this.links.values()].map((l) => ({ id: l.id, state: l.state, calling: l.calling }));
  }

  closeAll() {
    for (const id of [...this.links.keys()]) this.#hangUp(id);
  }

  // ── Calls ─────────────────────────────────────────────────────────────────
  async #call(id, tries) {
    const link = this.#open(id, newCall(), true, tries);
    const servers = await this.#iceServers();
    if (this.links.get(id) !== link) return; // hung up meanwhile
    try {
      const pc = this.#connect(link, servers);
      link.tx = pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.#send(link);
      await pc.setLocalDescription(await pc.createOffer());
      if (this.links.get(id) !== link) return;
      this.signal(id, { n: link.n, sdp: plain(pc.localDescription) });
    } catch (err) {
      this.#failed(link, err);
    }
  }

  async #answer(id, n, sdp) {
    const old = this.links.get(id);
    if (old && old.n === n) return; // heard twice
    if (old) this.#hangUp(id);
    const link = this.#open(id, n, false, 0);
    const servers = await this.#iceServers();
    if (this.links.get(id) !== link) return;
    try {
      const pc = this.#connect(link, servers);
      await pc.setRemoteDescription(sdp);
      link.tx = pc.getTransceivers()[0] || null;
      if (link.tx) link.tx.direction = 'sendrecv';
      this.#send(link);
      await pc.setLocalDescription(await pc.createAnswer());
      if (this.links.get(id) !== link) return;
      this.signal(id, { n, sdp: plain(pc.localDescription) });
      this.#ready(link);
    } catch (err) {
      this.#failed(link, err);
    }
  }

  async #answered(link, sdp) {
    try {
      await link.pc.setRemoteDescription(sdp);
      this.#ready(link);
    } catch (err) {
      this.#failed(link, err);
    }
  }

  // ── A line ────────────────────────────────────────────────────────────────
  #open(id, n, calling, tries) {
    if (this.links.has(id)) this.#hangUp(id);
    const link = { id, n, calling, tries, pc: null, tx: null, ready: false, queued: [], state: 'new', since: performance.now() };
    this.links.set(id, link);
    return link;
  }

  #connect(link, servers) {
    const pc = new this.RTC({ iceServers: servers });
    link.pc = pc;
    const mine = () => this.links.get(link.id) === link;
    pc.onicecandidate = (e) => {
      if (e.candidate && mine()) this.signal(link.id, { n: link.n, ice: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.ontrack = (e) => {
      if (mine()) this.emit('track', link.id, e.track);
    };
    pc.onconnectionstatechange = () => {
      if (!mine()) return;
      const state = pc.connectionState;
      if (state === link.state) return;
      if (link.state === 'connected') link.since = performance.now(); // patience runs from losing it
      link.state = state;
      if (state === 'connected') link.tries = 0;
      // a failed line is called again (or given up on) at the next update
      if (state === 'failed' || state === 'closed') link.since = -Infinity;
      this.emit('state', link.id, state);
    };
    return pc;
  }

  // The other side's description is in: the routes it sent can go in too.
  #ready(link) {
    link.ready = true;
    for (const c of link.queued.splice(0)) link.pc.addIceCandidate(c).catch(() => {});
  }

  #send(link) {
    if (link.tx && link.tx.sender) link.tx.sender.replaceTrack(this.track).catch(() => {});
  }

  #failed(link, err) {
    if (this.links.get(link.id) !== link) return;
    console.warn(`[voice] the line to ${link.id} failed:`, err && err.message ? err.message : err);
    link.state = 'failed';
    link.since = -Infinity;
    this.emit('state', link.id, 'failed');
  }

  #hangUp(id) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    if (link.pc) {
      link.pc.onicecandidate = link.pc.ontrack = link.pc.onconnectionstatechange = null;
      try {
        link.pc.close();
      } catch {
        /* already closed */
      }
    }
    this.emit('drop', id);
  }

  // Asked for once, and again when they will have run out or if asking failed.
  #iceServers() {
    if (!this._ice || performance.now() - this._iceAt > SERVERS_LAST) {
      this._iceAt = performance.now();
      this._ice = Promise.resolve()
        .then(() => this.servers())
        .then((list) => (Array.isArray(list) ? list : []))
        .catch(() => []);
      this._ice.then((list) => {
        if (!list.length) this._iceAt = -Infinity;
      });
    }
    return this._ice;
  }
}

const newCall = () => Math.random().toString(36).slice(2, 10);
const plain = (d) => ({ type: d.type, sdp: d.sdp });
