// Talking: push to talk and its hang (src/voice/talk.js), how far a voice
// carries (voices.js), the lines between browsers and how a call is set up
// over them (mesh.js, against a stand-in RTCPeerConnection), the microphone
// (mic.js), and what the server passes on (worker/world.js, worker/ice.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Talk, QUIET, ALOUD, RADIO } from '../src/voice/talk.js';
import { carry, airCutoff, NEAR, REACH } from '../src/voice/voices.js';
import { Mesh } from '../src/voice/mesh.js';
import { Mic } from '../src/voice/mic.js';
import { sayable } from '../worker/world.js';
import { iceServers, STUN, TURN_TTL } from '../worker/ice.js';

// ── Push to talk ────────────────────────────────────────────────────────────

test('hold a key to talk; let go and you stay on a moment for the last word', () => {
  const talk = new Talk({ hang: 0.3 });
  const heard = [];
  talk.on('change', (mode, was) => heard.push([was, mode]));
  assert.equal(talk.update(0.016, { aloud: true }), ALOUD);
  assert.equal(talk.update(0.1, {}), ALOUD, 'still on just after letting go');
  assert.equal(talk.update(0.1, {}), ALOUD);
  assert.equal(talk.update(0.15, {}), QUIET, 'and off once the hang is over');
  assert.deepEqual(heard, [
    [QUIET, ALOUD],
    [ALOUD, QUIET],
  ]);
});

test('the radio wins over talking aloud, and letting go of it goes straight back', () => {
  const talk = new Talk({ hang: 0.3 });
  assert.equal(talk.update(0.016, { aloud: true, radio: true }), RADIO);
  assert.equal(talk.update(0.016, { aloud: true }), ALOUD, 'no hang when you are still talking aloud');
  assert.equal(talk.update(0.016, { radio: true }), RADIO);
  assert.equal(talk.update(0.2, {}), RADIO, 'the radio hangs too');
  talk.stop();
  assert.equal(talk.mode, QUIET, 'stop() is at once');
});

// ── How far a voice carries ─────────────────────────────────────────────────

test('a voice is as loud as it gets up close, fades with distance, and stops', () => {
  assert.equal(carry(0), 1);
  assert.equal(carry(NEAR), 1);
  let last = 1;
  for (let d = NEAR; d < REACH; d += 0.5) {
    const g = carry(d);
    assert.ok(g <= last + 1e-9, `no louder further off (${d} m)`);
    last = g;
  }
  assert.ok(carry(10) > 0.2, 'someone across a clearing is clearly heard');
  assert.equal(carry(REACH), 0, 'and nobody past REACH');
  assert.equal(carry(500), 0);
  assert.equal(carry(Infinity), 0);
  assert.equal(carry(NaN), 0, 'someone who cannot be placed is not heard aloud');
  assert.ok(airCutoff(1) > airCutoff(20) && airCutoff(20) > airCutoff(REACH - 1), 'and duller the further off');
});

// ── Lines between browsers ──────────────────────────────────────────────────

// A stand-in for RTCPeerConnection: enough of one to set a call up. It
// connects once it has both descriptions and a route from the other side.
let nextTrack = 1;
class FakePC {
  static made = [];
  constructor(config) {
    this.config = config;
    this.tx = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.routes = [];
    this.connectionState = 'new';
    this.closed = false;
    FakePC.made.push(this);
  }
  addTransceiver(kind, { direction }) {
    return this.#transceiver(direction);
  }
  #transceiver(direction) {
    const t = { direction, sender: { track: null, replaceTrack: async (track) => void (t.sender.track = track) }, track: { id: `t${nextTrack++}` } };
    this.tx.push(t);
    return t;
  }
  getTransceivers() {
    return this.tx;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'v=0 offer' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'v=0 answer' };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
    setTimeout(() => this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'host 1' }) } }), 1);
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    if (d.type === 'offer') this.#transceiver('recvonly');
    this.#maybe();
  }
  async addIceCandidate(c) {
    this.routes.push(c);
    this.#maybe();
  }
  #maybe() {
    if (this.closed || this.connectionState === 'connected' || !this.localDescription || !this.remoteDescription || !this.routes.length) return;
    this.connectionState = 'connected';
    this.ontrack?.({ track: this.tx[0].track });
    this.onconnectionstatechange?.();
  }
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

// Two (or more) people, their messages carried a moment later, as the
// world's object would.
function people(...ids) {
  const meshes = {};
  const sent = [];
  for (const id of ids) {
    const mesh = new Mesh({
      RTC: FakePC,
      servers: async () => [{ urls: ['stun:example'] }],
      signal: (to, body) => {
        sent.push({ from: id, to, body });
        setTimeout(() => meshes[to]?.heard(id, JSON.parse(JSON.stringify(body))), 1);
        return true;
      },
    });
    mesh.tracks = new Map();
    mesh.on('track', (from, track) => mesh.tracks.set(from, track));
    mesh.on('drop', (from) => mesh.tracks.delete(from));
    meshes[id] = mesh;
  }
  return { meshes, sent };
}
const settle = () => new Promise((r) => setTimeout(r, 40));

test('of two people, the first calls and the other answers, and they hear each other', async () => {
  const { meshes, sent } = people('p1', 'p2');
  meshes.p1.sync('p1', ['p2']);
  meshes.p2.sync('p2', ['p1']);
  await settle();
  assert.deepEqual(
    sent.filter((m) => m.body.sdp).map((m) => [m.from, m.body.sdp.type]),
    [
      ['p1', 'offer'],
      ['p2', 'answer'],
    ],
    'one call, one answer: never both calling',
  );
  assert.deepEqual(meshes.p1.list(), [{ id: 'p2', state: 'connected', calling: true }]);
  assert.deepEqual(meshes.p2.list(), [{ id: 'p1', state: 'connected', calling: false }]);
  assert.ok(meshes.p1.tracks.has('p2') && meshes.p2.tracks.has('p1'), 'each has the other’s voice');
  assert.deepEqual(FakePC.made.at(-1).config.iceServers, [{ urls: ['stun:example'] }], 'with the servers asked for');
});

test('your microphone goes onto every line, and comes off again', async () => {
  const { meshes } = people('a', 'b', 'c');
  for (const id of ['a', 'b', 'c']) meshes[id].sync(id, ['a', 'b', 'c'].filter((x) => x !== id));
  await settle();
  const mic = { id: 'mic' };
  meshes.a.setTrack(mic);
  await settle();
  const senders = [...meshes.a.links.values()].map((l) => l.tx.sender.track);
  assert.deepEqual(senders, [mic, mic], 'to b and to c');
  meshes.a.setTrack(null);
  await settle();
  assert.deepEqual([...meshes.a.links.values()].map((l) => l.tx.sender.track), [null, null]);
  // a line made after you have a microphone starts with it on
  const late = people('x', 'y');
  late.meshes.y.setTrack(mic);
  late.meshes.x.sync('x', ['y']);
  late.meshes.y.sync('y', ['x']);
  await settle();
  assert.equal([...late.meshes.y.links.values()][0].tx.sender.track, mic, 'and the one answering sends it too');
});

test('someone leaving is hung up on; coming back on a new socket starts over', async () => {
  const { meshes } = people('p1', 'p2');
  meshes.p1.sync('p1', ['p2']);
  meshes.p2.sync('p2', ['p1']);
  await settle();
  const line = [...meshes.p1.links.values()][0];
  meshes.p1.sync('p1', []);
  assert.equal(meshes.p1.links.size, 0);
  assert.ok(line.pc.closed, 'the connection is closed');
  assert.ok(!meshes.p1.tracks.has('p2'), 'and their voice dropped');

  meshes.p2.sync('p2', ['p1']);
  meshes.p2.sync('p9', ['p1']); // the socket blinked: p2 is p9 now
  assert.equal(meshes.p2.links.size, 0, 'everything from before is hung up');
});

test('a call nobody answers is made again, and what is said about an old one is ignored', async () => {
  const { meshes, sent } = people('p1', 'p2');
  const silent = meshes.p2;
  delete meshes.p2; // p2 is here, but not hearing (an older game, say)
  meshes.p1.sync('p1', ['p2']);
  await settle();
  const first = sent.find((m) => m.body.sdp).body.n;
  meshes.p1.update(performance.now() + 1000);
  assert.equal(meshes.p1.links.get('p2').n, first, 'it is given time');
  meshes.p1.update(performance.now() + 60_000);
  await settle();
  const second = meshes.p1.links.get('p2').n;
  assert.notEqual(second, first, 'then called again');
  assert.equal(meshes.p1.links.get('p2').tries, 1);

  // the late answer to the first call changes nothing
  meshes.p1.heard('p2', { n: first, sdp: { type: 'answer', sdp: 'late' } });
  await settle();
  assert.equal(meshes.p1.links.get('p2').pc.remoteDescription, null);
  // a call coming in replaces whatever was there
  silent.sync('p2', ['p1']);
  meshes.p2 = silent;
  silent.heard('p1', { n: second, sdp: { type: 'offer', sdp: 'v=0' } });
  await settle();
  assert.equal(meshes.p1.links.get('p2').state, 'connected', 'and once heard, it connects');
});

test('nonsense about a call is ignored', () => {
  const { meshes } = people('p1');
  meshes.p1.sync('p1', []);
  for (const body of [null, 'x', 7, {}, { n: 3 }, { n: 'a', sdp: 'offer' }, { n: 'a', ice: 'x' }]) meshes.p1.heard('p2', body);
  meshes.p1.heard('', { n: 'a', sdp: { type: 'offer', sdp: '' } });
  assert.equal(meshes.p1.links.size, 0);
});

test('without WebRTC, nobody is called', () => {
  const sent = [];
  const mesh = new Mesh({ RTC: undefined, signal: (to, body) => sent.push(body) });
  mesh.sync('p1', ['p2']);
  mesh.heard('p2', { n: 'a', sdp: { type: 'offer', sdp: '' } });
  assert.equal(mesh.links.size, 0);
  assert.equal(sent.length, 0);
});

// ── The microphone ──────────────────────────────────────────────────────────

function fakeMedia({ fail = null } = {}) {
  const asked = [];
  return {
    asked,
    getUserMedia: async (c) => {
      asked.push(c);
      if (fail) throw Object.assign(new Error(fail), { name: fail });
      const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
      return { getAudioTracks: () => [track], getTracks: () => [track] };
    },
  };
}

test('the microphone is asked for the first time you talk, off between words, and let go of', async () => {
  const media = fakeMedia();
  const mic = new Mic({ media, rest: 1000 });
  const tracks = [];
  mic.on('track', (t) => tracks.push(t));
  assert.equal(media.asked.length, 0, 'not asked for up front');
  mic.live = true;
  await mic.open();
  assert.equal(media.asked.length, 1);
  assert.equal(media.asked[0].audio.echoCancellation, true, 'with echo cancelling');
  const track = tracks[0];
  assert.equal(track.enabled, true);
  mic.live = false;
  assert.equal(track.enabled, false, 'silence between words');
  mic.update(performance.now() + 500);
  assert.ok(!track.stopped, 'kept a while');
  mic.update(performance.now() + 2000);
  assert.ok(track.stopped, 'then let go of');
  assert.deepEqual(tracks, [track, null]);
  mic.live = true;
  await mic.open();
  assert.equal(media.asked.length, 2, 'and asked for again next time');
});

test('no microphone says why', async () => {
  const why = [];
  const blocked = new Mic({ media: fakeMedia({ fail: 'NotAllowedError' }) });
  blocked.on('denied', (w) => why.push(w));
  assert.equal(await blocked.open(), null);
  const none = new Mic({ media: fakeMedia({ fail: 'NotFoundError' }) });
  none.on('denied', (w) => why.push(w));
  await none.open();
  const nothing = new Mic({ media: {} });
  nothing.on('denied', (w) => why.push(w));
  await nothing.open();
  assert.deepEqual(why, ['blocked', 'none', 'none']);
});

// ── What the server passes on ───────────────────────────────────────────────

test('what can be said is small, on a named channel, to everyone or to one', () => {
  assert.deepEqual(sayable({ ch: 'voice', body: { mode: 'radio' } }), { ch: 'voice', to: null, body: { mode: 'radio' } });
  assert.deepEqual(sayable({ ch: 'rtc', to: 'p3', body: { n: 'x' } }), { ch: 'rtc', to: 'p3', body: { n: 'x' } });
  assert.equal(sayable({ body: 1 }), null, 'a channel is needed');
  assert.equal(sayable({ ch: 'Not A Channel', body: 1 }), null);
  assert.equal(sayable({ ch: 'x'.repeat(40), body: 1 }), null);
  assert.equal(sayable({ ch: 'rtc', to: 5, body: 1 }), null, 'to someone by id');
  assert.equal(sayable({ ch: 'rtc', body: 'x'.repeat(20000) }), null, 'and not too much of it');
  assert.deepEqual(sayable({ ch: 'voice' }), { ch: 'voice', to: null, body: null });
});

test('ICE servers: STUN alone, or TURN credentials when the Worker has a key', async () => {
  assert.deepEqual(await iceServers({}), STUN);
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
          { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
        ],
      }),
    };
  };
  const got = await iceServers({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'secret' }, { fetch });
  assert.equal(asked[0].url, 'https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers');
  assert.equal(asked[0].init.headers.authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(asked[0].init.body), { ttl: TURN_TTL });
  assert.deepEqual(got, [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  ], 'without port 53, which browsers block');

  const quiet = console.error;
  console.error = () => {};
  try {
    const down = await iceServers({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'secret' }, { fetch: async () => ({ ok: false, status: 503 }) });
    assert.deepEqual(down, STUN, 'a TURN service that is down still leaves STUN');
  } finally {
    console.error = quiet;
  }
});
