// A procedural soundscape. Like everything else in the world there are no
// audio files: wind, leaves, birds, crickets, owls, water, frogs and
// footsteps are all synthesised with the Web Audio API from noise and
// oscillators.
//
// This file is the engine: the audio context, the mixer, and the small kit of
// parts sounds are made from. What you actually hear is plugged into it:
//
//   layers       beds that play all the time and follow the world: wind,
//   (layers/)    crickets, birdsong, running water. sound.addLayer(layer).
//
//   effects      one-shot sounds of things happening: an axe biting, a log
//   (sfx.js)     set down. sound.sfx('chop', { size }); defineSfx() to add one.
//
//   calls        an animal's voice, placed in 3D where the animal is.
//   (calls.js)   sound.call('howl', x, y, z); defineCall() to add one.
//
//   footsteps    by what is underfoot. sound.footstep('grass', run);
//   (footsteps.js)   defineSurface() to add a kind of ground.
//
// So a feature with a sound of its own (a campfire's crackle, music) adds a
// layer or defines an effect from its own folder; nothing in here changes.
//
// Everything goes out through a *bus* — 'ambience', 'effects', 'wildlife',
// and any other name you ask for ('music') — each with its own level, so
// kinds of sound can be turned up and down independently: sound.volume(bus, v).
//
// Browsers only allow audio after the visitor interacts with the page, so
// nothing is created until the first click / key / tap.

import { clamp } from '../noise.js';
import { rand } from '../core/geom.js';
import { makeNoise, makeImpulse, setPos } from './kit.js';
import { playSfx } from './sfx.js';
import { playCall } from './calls.js';
import { playFootstep } from './footsteps.js';
import { weather } from './layers/weather.js';
import { crickets } from './layers/crickets.js';
import { birds } from './layers/birds.js';
import { water, pondLife } from './layers/water.js';

// What plays unless told otherwise, in the order it is built and updated.
const LAYERS = [weather, crickets, birds, water, pondLife];

export class Soundscape {
  constructor({ layers = LAYERS } = {}) {
    this.ctx = null;
    this.enabled = true;
    this.level = 1.45;
    this.layers = [...layers];
    this.buses = new Map(); // name -> { dry, wet, level }
    this.levels = {}; // name -> level asked for before the bus existed
    // The weather as it is heard, shared between layers: the wind's gusting
    // (set by the weather layer) and where the listener is standing.
    this.gust = 0.5;
    this.env = { night: 0, forest: 0.5, birdActivity: 0 };
    this.listener = null;
    this._unlock = () => this.unlock();
    this._events = ['pointerdown', 'keydown', 'touchend', 'click'];
    if (typeof window !== 'undefined') {
      for (const ev of this._events) addEventListener(ev, this._unlock, { capture: true });
      document.addEventListener('visibilitychange', () => this._applyRunState());
    }
  }

  // ── Starting and stopping ────────────────────────────────────────────────
  // Create (or resume) the audio context. Must happen inside a user gesture.
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.attach(new AC({ latencyHint: 'playback' }));
      } catch {
        return;
      }
      this.ctx.onstatechange = () => {
        if (this.ctx.state === 'running') for (const ev of this._events) removeEventListener(ev, this._unlock, { capture: true });
      };
    }
    this._applyRunState();
  }

  _applyRunState() {
    if (!this.ctx || this.offline) return;
    const want = this.enabled && !document.hidden;
    if (want && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!want && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) {
      if (on) this.unlock();
      return;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? this.level : 0, t, on ? 0.4 : 0.08);
    if (on) this._applyRunState();
    else setTimeout(() => this._applyRunState(), 400);
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // Can a sound be started right now?
  get live() {
    return !!this.ctx && (this.offline || this.ctx.state === 'running');
  }

  // Build the graph on a context (real-time, or offline for rendering previews).
  attach(ctx, destination = ctx.destination) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    const t = ctx.currentTime;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;
    this.comp.connect(destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.enabled ? this.level : 0, t + 0.05, this.offline ? 0.05 : 1.5);
    this.master.connect(this.comp);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.6, 2.4);
    const rv = ctx.createGain();
    rv.gain.value = 0.5;
    this.reverb.connect(rv).connect(this.master);

    this.white = makeNoise(ctx, 'white', 3);
    this.pink = makeNoise(ctx, 'pink', 5);
    this.brown = makeNoise(ctx, 'brown', 7);

    this.gust = 0.5;
    this.env = { night: 0, forest: 0.5, birdActivity: 0 };
    for (const layer of this.layers) layer.build(this, t);
  }

  // ── The mixer ────────────────────────────────────────────────────────────
  // A channel of the mix. Connect a sound to `dry`, and whatever of it should
  // carry through the trees to `wet` (the forest reverb).
  bus(name) {
    let b = this.buses.get(name);
    if (!b) {
      const level = this.levels[name] ?? 1;
      const dry = this.ctx.createGain();
      dry.gain.value = level;
      dry.connect(this.master);
      const wet = this.ctx.createGain();
      wet.gain.value = level;
      wet.connect(this.reverb);
      this.buses.set(name, (b = { dry, wet, level }));
    }
    return b;
  }

  // How loud a bus is, 0..1 and beyond. Remembered if the bus isn't there yet.
  volume(name, level) {
    this.levels[name] = level;
    const b = this.buses.get(name);
    if (!b) return;
    b.level = level;
    const t = this.ctx.currentTime;
    b.dry.gain.setTargetAtTime(level, t, 0.1);
    b.wet.gain.setTargetAtTime(level, t, 0.1);
  }

  // ── Layers ───────────────────────────────────────────────────────────────
  // A layer is { name, build(sound, t), update(sound, t, dt, env) }: build
  // makes its nodes once there is an audio context, update steers them every
  // frame. See layers/ for the ones that come with the game.
  addLayer(layer) {
    this.layers.push(layer);
    if (this.ctx) layer.build(this, this.ctx.currentTime);
  }

  // ── Per frame ────────────────────────────────────────────────────────────
  // env: { hours, night, forest (0..1 at the player), height, wind, camera,
  //        water (ChunkManager.waterAround) } — and anything else a layer a
  //        feature added wants to be told
  update(dt, env) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    if (env.camera) this._updateListener(env.camera);
    this.env.night = env.night ?? 0;
    this.env.forest = env.forest ?? 0.5;
    for (const layer of this.layers) layer.update(this, t, dt, env);
  }

  _updateListener(camera) {
    const L = this.ctx.listener;
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    // camera looks down -Z; up is +Y in its local frame
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    const ux = e[4];
    const uy = e[5];
    const uz = e[6];
    if (L.positionX) {
      L.positionX.value = p.x;
      L.positionY.value = p.y;
      L.positionZ.value = p.z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
    this.listener = { x: p.x, y: p.y, z: p.z };
  }

  // The wind as it is heard right now, 0 (still) .. 1.2 (a strong gust).
  gusting(env) {
    return clamp(this.gust * (env.wind ?? 1), 0, 1.2);
  }

  // ── The kit: parts sounds are made from ──────────────────────────────────
  // A sound source somewhere in the trees around the listener.
  // -> { out, nodes, dist }: connect to `out`; hand `nodes` to cleanup().
  place(minD, maxD, yMin, yMax, bus = 'ambience') {
    const ctx = this.ctx;
    const pan = ctx.createPanner();
    pan.panningModel = this.offline ? 'equalpower' : 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 10;
    pan.rolloffFactor = 1;
    const a = Math.random() * Math.PI * 2;
    const d = rand(minD, maxD);
    const l = this.listener || { x: 0, y: 0, z: 0 };
    setPos(pan, l.x + Math.cos(a) * d, l.y + rand(yMin, yMax), l.z + Math.sin(a) * d);
    const out = ctx.createGain();
    out.connect(pan);
    const { dry, wet } = this.bus(bus);
    pan.connect(dry);
    const send = ctx.createGain();
    send.gain.value = 0.25 + d / 50;
    pan.connect(send).connect(wet);
    return { out, nodes: [out, pan, send], dist: d };
  }

  // A one-off source at a given spot (like place, but not at random).
  placeAt(x, y, z, bus = 'ambience') {
    const ctx = this.ctx;
    const pan = ctx.createPanner();
    pan.panningModel = this.offline ? 'equalpower' : 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 8;
    pan.rolloffFactor = 1;
    setPos(pan, x, y, z);
    const out = ctx.createGain();
    out.connect(pan);
    const { dry, wet } = this.bus(bus);
    pan.connect(dry);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    pan.connect(send).connect(wet);
    return { out, nodes: [out, pan, send] };
  }

  // Glide a panner to a new spot.
  moveTo(panner, x, y, z, t) {
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(x, t, 0.25);
      panner.positionY.setTargetAtTime(y, t, 0.25);
      panner.positionZ.setTargetAtTime(z, t, 0.25);
    } else panner.setPosition(x, y, z);
  }

  // A pitched voice: an oscillator (and, if asked, its 2nd harmonic) through a
  // gain that starts silent. -> { osc, h, g }; shape it with freq() and note().
  voice(dest, t, end, type = 'sine', harmonic = 0.12) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(dest);
    let h = null;
    if (harmonic > 0) {
      h = ctx.createOscillator();
      h.type = 'sine';
      const hg = ctx.createGain();
      hg.gain.value = harmonic;
      h.connect(hg).connect(g);
      h.start(t);
      h.stop(end + 0.05);
    }
    osc.start(t);
    osc.stop(end + 0.05);
    return { osc, h, g };
  }

  // Schedule a pitch on a voice (and its 2nd harmonic).
  freq(v, t, f, glideTo, dur) {
    v.osc.frequency.setValueAtTime(f, t);
    if (glideTo) v.osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    if (v.h) {
      v.h.frequency.setValueAtTime(f * 2, t);
      if (glideTo) v.h.frequency.exponentialRampToValueAtTime(glideTo * 2, t + dur);
    }
  }

  // Sound one note on a voice.
  note(v, t, dur, amp, attack = 0.012) {
    v.g.gain.setValueAtTime(0, t);
    v.g.gain.linearRampToValueAtTime(amp, t + attack);
    v.g.gain.setValueAtTime(amp, t + Math.max(attack, dur - 0.03));
    v.g.gain.linearRampToValueAtTime(0, t + dur);
  }

  // Take nodes out of the graph once they have finished sounding (at `at`).
  cleanup(at, nodes, margin = 0.3) {
    if (this.offline) return;
    const ms = (at - this.ctx.currentTime + margin) * 1000;
    setTimeout(() => nodes.forEach((n) => n.disconnect()), Math.max(0, ms));
  }

  // ── One-shots ────────────────────────────────────────────────────────────
  // The sound of work, or of anything else that just happened: see sfx.js.
  sfx(kind, opts = {}) {
    if (this.live) playSfx(this, kind, opts);
  }

  // A call from an animal standing at (x, y, z): see calls.js for the kinds.
  call(kind, x, y, z, opts) {
    if (!this.live || !this.enabled) return;
    const l = this.listener;
    if (l && Math.hypot(x - l.x, z - l.z) > 260) return;
    playCall(this, kind, x, y, z, opts);
  }

  // surface: 'dirt' | 'grass' | 'litter' | 'water' (see footsteps.js);
  // run: 0..1; kind: 'step' | 'jump' | 'land' | 'swim'; strength: how hard you
  // landed, or for a step or a stroke in water, how deep it is (m)
  footstep(surface, run = 0, kind = 'step', strength = 1) {
    if (this.live) playFootstep(this, surface, run, kind, strength);
  }
}
