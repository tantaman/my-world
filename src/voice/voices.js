// What you hear of other people: their own voices, from where they stand,
// and the radio, from yours.
//
// Each person's voice arrives on one track (mesh.js) and goes two ways:
//
//   aloud   from where they are standing, at their mouth, and less the
//           further off they are: as loud as a voice gets within NEAR, gone
//           by REACH, and duller with distance, the way a voice is across a
//           clearing (carry(), airCutoff()).
//   radio   through the radio (radio.js): thin and crackly, and as loud from
//           the far side of the world as from beside you.
//
// Each way is opened only while they say they are talking that way
// (talk.js): someone on the radio is heard on it by everyone, and aloud as
// well by whoever is standing beside them.
//
// This is a sound layer (audio/soundscape.js): nothing is built until the
// soundscape has an audio context, and it goes out on buses of its own,
// 'voices' and 'radio', which can be turned up and down like any other —
// world.sound.volume('radio', 0.5).

import { lerp, smoothstep } from '../noise.js';
import { QUIET, RADIO } from './talk.js';
import { Radio } from './radio.js';

export const NEAR = 2.5; // m: as loud as a voice gets, this close
export const REACH = 40; // m: and not heard at all past here
const FADE_FROM = 24; // m: where it starts fading right out
const VOICE = 1.3; // how loud someone beside you is
const SHOUT_ROOM = 0.45; // how much of a far-off voice reaches the forest reverb
const OPEN = 0.012; // s: how fast the way in opens once they talk
const SHUT = 0.07; // s: and closes after

// How loud someone talking aloud is d metres away, 0..1.
export function carry(d) {
  if (!(d < REACH)) return 0;
  return Math.min(1, NEAR / Math.max(d, 0.01)) * (1 - smoothstep(FADE_FROM, REACH, d));
}

// How high a voice d metres away still reaches (Hz): the air and the leaves
// take the top off it first.
export function airCutoff(d) {
  return lerp(16000, 2400, smoothstep(4, REACH, d));
}

export class Voices {
  // where(id) -> { x, y, z } of someone's mouth, or null if they can't be
  //              placed (not seen yet)
  // ear()     -> { x, y, z } of yours: the hiker's, not the camera's, since
  //              it is whoever is beside *you* you want to hear best
  constructor({ where, ear }) {
    this.where = where;
    this.ear = ear;
    this.people = new Map(); // id -> { id, track, mode, nodes, level }
    this.s = null;
    this.radio = null;
    this.mine = { track: null, nodes: null, level: 0 };
  }

  // The sound layer to hand to sound.addLayer().
  layer() {
    return {
      name: 'voices',
      build: (s) => this.#build(s),
      update: (s, t, dt) => this.#update(s, t, dt),
    };
  }

  // Their voice arrived (a MediaStreamTrack).
  add(id, track) {
    const p = this.#person(id);
    if (p.track === track) return;
    this.#unwire(p);
    p.track = track;
  }

  // Their voice is gone (they left, or the line to them dropped).
  remove(id) {
    const p = this.people.get(id);
    if (!p) return;
    this.#unwire(p);
    p.track = null;
    if (p.mode === QUIET) this.people.delete(id);
  }

  // What they say they are doing: QUIET, ALOUD or RADIO.
  mode(id, mode) {
    const p = this.#person(id);
    const was = p.mode;
    p.mode = mode;
    if (this.radio && was !== RADIO && mode === RADIO) this.radio.open();
    if (this.radio && was === RADIO && mode !== RADIO) this.radio.close();
    if (mode === QUIET && !p.track) this.people.delete(id);
  }

  // How loud they are right now, 0..1 (0 while they aren't talking).
  level(id) {
    const p = this.people.get(id);
    return p ? p.level : 0;
  }

  // How loud they are let through right now: { aloud, radio }, each 0..1-ish.
  heard(id) {
    const n = this.people.get(id)?.nodes;
    return n ? { aloud: n.aloud.gain.value, radio: n.radio.gain.value } : { aloud: 0, radio: 0 };
  }

  // Your own microphone, to show you that you are being heard.
  setMine(track) {
    this.#unwire(this.mine);
    this.mine.track = track;
    this.mine.level = 0;
  }

  myLevel() {
    return this.mine.level;
  }

  // The click of your own radio's button.
  keyed(down) {
    if (this.radio) this.radio.key(down);
  }

  // ── The graph ─────────────────────────────────────────────────────────────
  #build(s) {
    this.s = s;
    s.bus('voices');
    this.radio = new Radio(s);
  }

  #person(id) {
    let p = this.people.get(id);
    if (!p) this.people.set(id, (p = { id, track: null, mode: QUIET, nodes: null, level: 0 }));
    return p;
  }

  // From their track into the mix: a meter, the way in aloud, the way in on
  // the radio.
  #wire(p) {
    const s = this.s;
    const ctx = s.ctx;
    const stream = new MediaStream([p.track]);
    // Chrome only lets a voice from another browser into Web Audio while a
    // media element is playing it too (silently).
    const el = typeof Audio !== 'undefined' ? new Audio() : null;
    if (el) {
      el.muted = true;
      el.srcObject = stream;
      el.play?.()?.catch?.(() => {});
    }
    const src = ctx.createMediaStreamSource(stream);
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    src.connect(meter);
    const nodes = { el, src, meter, buf: new Float32Array(meter.fftSize), all: [src, meter] };
    if (p !== this.mine) {
      const aloud = ctx.createGain();
      aloud.gain.value = 0;
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = airCutoff(0);
      // direction from the panner, distance from carry(): rolloff off
      const pan = ctx.createPanner();
      pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
      pan.distanceModel = 'inverse';
      pan.rolloffFactor = 0;
      const { dry, wet } = s.bus('voices');
      src.connect(aloud).connect(air).connect(pan).connect(dry);
      const room = ctx.createGain();
      room.gain.value = 0;
      pan.connect(room).connect(wet);
      const radio = ctx.createGain();
      radio.gain.value = 0;
      src.connect(radio).connect(this.radio.input);
      Object.assign(nodes, { aloud, air, pan, room, radio });
      nodes.all.push(aloud, air, pan, room, radio);
    }
    p.nodes = nodes;
  }

  #unwire(p) {
    if (!p.nodes) return;
    for (const n of p.nodes.all) n.disconnect();
    if (p.nodes.el) p.nodes.el.srcObject = null;
    p.nodes = null;
    p.level = 0;
  }

  #update(s, t, dt) {
    const ear = this.ear();
    let onAir = false;
    for (const p of this.people.values()) {
      if (!p.nodes && p.track) this.#wire(p);
      if (p.mode === RADIO) onAir = true;
      const n = p.nodes;
      if (!n) continue;
      const at = p.mode !== QUIET ? this.where(p.id) : null;
      const d = at ? Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z) : Infinity;
      gate(n.aloud.gain, at ? carry(d) * VOICE : 0, t);
      gate(n.radio.gain, p.mode === RADIO ? 1 : 0, t);
      if (at) {
        s.moveTo(n.pan, at.x, at.y, at.z, t);
        n.air.frequency.setTargetAtTime(airCutoff(d), t, 0.1);
        n.room.gain.setTargetAtTime(0.08 + SHOUT_ROOM * smoothstep(3, REACH, d), t, 0.1);
      }
      p.level = loudness(n, p.mode !== QUIET, p.level, dt);
    }
    this.radio.carrier(onAir, t);
    const mine = this.mine;
    if (!mine.nodes && mine.track) this.#wire(mine);
    if (mine.nodes) mine.level = loudness(mine.nodes, mine.track.enabled, mine.level, dt);
  }
}

// Open a way in fast, close it a little slower.
function gate(param, v, t) {
  param.setTargetAtTime(v, t, v > param.value ? OPEN : SHUT);
}

// How loud a voice is right now, 0..1, eased so it reads as a level rather
// than flickering with each syllable.
function loudness(n, on, was, dt) {
  let now = 0;
  if (on) {
    n.meter.getFloatTimeDomainData(n.buf);
    let sum = 0;
    for (let i = 0; i < n.buf.length; i++) sum += n.buf[i] * n.buf[i];
    now = Math.min(1, Math.sqrt(sum / n.buf.length) * 8);
  }
  return was + (now - was) * Math.min(1, dt * (now > was ? 18 : 6));
}
