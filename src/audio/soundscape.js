// A procedural soundscape. Like everything else in the world there are no
// audio files: wind, leaves, birds, crickets, owls and footsteps are all
// synthesised with the Web Audio API from noise and oscillators.
//
// Browsers only allow audio after the visitor interacts with the page, so
// nothing is created until the first click / key / tap.

import { clamp, lerp, smoothstep } from '../noise.js';
import { playCall } from './calls.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SILENT = 0.0001;

// ── Buffers ────────────────────────────────────────────────────────────────
function makeNoise(ctx, kind, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // pink (Paul Kellet)
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

// Diffuse forest reverb: decaying noise whose high end dies away faster.
function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.08 + 0.85 * t; // one-pole lowpass that closes over time
      lp += (Math.random() * 2 - 1 - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.004 ? i / (ctx.sampleRate * 0.004) : 1);
    }
  }
  return buf;
}

// Exponential attack/decay envelope on a gain param.
function envelope(param, t, attack, peak, decay) {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay);
}

function setPos(node, x, y, z) {
  if (node.positionX) {
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else node.setPosition(x, y, z);
}

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.level = 1.45;
    this._unlock = () => this.unlock();
    this._events = ['pointerdown', 'keydown', 'touchend', 'click'];
    if (typeof window !== 'undefined') {
      for (const ev of this._events) addEventListener(ev, this._unlock, { capture: true });
      document.addEventListener('visibilitychange', () => this._applyRunState());
    }
  }

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

    // Wind: two decorrelated brown-noise beds, low-passed, panned wide.
    this.wind = [];
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      lp.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.65;
      src.connect(lp).connect(g).connect(pan).connect(this.master);
      src.start(t, rand(0, 6));
      this.wind.push({ lp, g, side });
    }

    // Leaves: pink noise, band-limited high, swells with the gusts.
    this.leaves = [];
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1700;
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.value = 4200;
      bp.gain.value = 4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.8;
      src.connect(hp).connect(bp).connect(lp).connect(g).connect(pan);
      pan.connect(this.master);
      src.start(t, rand(0, 4));
      this.leaves.push({ g, side });
    }

    // Crickets: a handful of voices dotted around, each chirping on its own clock.
    this.crickets = [];
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = rand(4300, 5300);
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.9, 0.9);
      osc.connect(g).connect(pan).connect(this.master);
      osc.start(t);
      this.crickets.push({ g, next: t + rand(0, 1), period: rand(0.5, 0.95), amp: rand(0.35, 1), pulses: Math.random() < 0.5 ? 3 : 2 });
    }

    this.gust = 0.5;
    this.gustTarget = 0.5;
    this.nextBird = t + rand(1, 3);
    this.nextOwl = t + rand(10, 25);
    this.cricketLevel = 0;
    this.env = { night: 0, forest: 0.5, birdActivity: 0 };
  }

  // ── Per frame ────────────────────────────────────────────────────────────
  // env: { hours, night, forest (0..1 at the player), height, wind, camera }
  update(dt, env) {
    if (!this.ctx || (!this.offline && this.ctx.state !== 'running')) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    if (env.camera) this._updateListener(env.camera);

    // gusts: a slow random walk on top of the shared wind strength
    if (Math.random() < dt * 0.25) this.gustTarget = rand(0.15, 1);
    this.gust = lerp(this.gust, this.gustTarget, 1 - Math.exp(-dt * 0.6));
    const gust = clamp(this.gust * (env.wind ?? 1), 0, 1.2);
    const open = 1 - (env.forest ?? 0.5);
    const high = clamp(((env.height ?? 0) + 10) / 55, 0, 1);
    const night = env.night ?? 0;
    this.env.night = night;
    this.env.forest = env.forest ?? 0.5;

    const windLevel = (0.04 + 0.1 * open + 0.06 * high) * (0.3 + 0.7 * gust);
    for (const w of this.wind) {
      const wobble = 1 + 0.15 * Math.sin(t * 0.3 + w.side * 2);
      w.g.gain.setTargetAtTime(windLevel * wobble, t, 0.6);
      w.lp.frequency.setTargetAtTime(220 + 520 * gust + 260 * open * wobble, t, 0.6);
    }
    // leaves rustle in swells as gusts move through the canopy
    const leafLevel = (0.003 + 0.032 * gust * gust * gust) * smoothstep(0.15, 0.8, env.forest ?? 0.5) * (1 - night * 0.4);
    for (const l of this.leaves) {
      const swell = 0.55 + 0.45 * Math.sin(t * (0.45 + 0.1 * l.side) + l.side * 3) * Math.sin(t * 0.17 + 1);
      l.g.gain.setTargetAtTime(leafLevel * swell, t, 0.35);
    }

    // crickets fade in at dusk, louder in the open
    this.cricketLevel = smoothstep(0.15, 0.75, night) * (0.45 + 0.55 * open) * 0.022;
    const horizon = t + 0.12;
    for (const c of this.crickets) {
      while (c.next < horizon) {
        const amp = this.cricketLevel * c.amp;
        if (amp > 0.0006 && c.next >= t) {
          for (let p = 0; p < c.pulses; p++) {
            const s = c.next + p * 0.032;
            c.g.gain.setValueAtTime(0, s);
            c.g.gain.linearRampToValueAtTime(amp, s + 0.004);
            c.g.gain.linearRampToValueAtTime(0, s + 0.021);
          }
        }
        c.next = Math.max(c.next, t) + c.period * rand(0.9, 1.12);
      }
    }

    // birds: a dawn chorus, quieter days, a little evensong, silent nights
    const h = env.hours ?? 12;
    const dawn = Math.exp(-Math.pow((h - 6.8) / 1.4, 2));
    const dusk = Math.exp(-Math.pow((h - 18.2) / 1.0, 2)) * 0.55;
    const day = h > 7 && h < 18 ? 0.35 : 0;
    const activity = Math.max(dawn, dusk, day) * (1 - smoothstep(0.3, 0.8, night)) * (0.45 + 0.55 * (env.forest ?? 0.5));
    this.env.birdActivity = activity;
    if (t >= this.nextBird) {
      if (activity > 0.05) this._bird(t + 0.05, activity, h);
      this.nextBird = t + lerp(10, 1.3, activity) * rand(0.5, 1.4);
    }
    if (t >= this.nextOwl) {
      if (night > 0.6) this._owl(t + 0.05);
      this.nextOwl = t + rand(22, 55);
    }
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

  // A sound source somewhere in the trees around the listener.
  _place(minD, maxD, yMin, yMax) {
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
    pan.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.25 + d / 50;
    pan.connect(send).connect(this.reverb);
    return { out, nodes: [out, pan, send], dist: d };
  }

  _voice(dest, t, end, type = 'sine', harmonic = 0.12) {
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
  _freq(v, t, f, glideTo, dur) {
    v.osc.frequency.setValueAtTime(f, t);
    if (glideTo) v.osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    if (v.h) {
      v.h.frequency.setValueAtTime(f * 2, t);
      if (glideTo) v.h.frequency.exponentialRampToValueAtTime(glideTo * 2, t + dur);
    }
  }

  _note(v, t, dur, amp, attack = 0.012) {
    v.g.gain.setValueAtTime(0, t);
    v.g.gain.linearRampToValueAtTime(amp, t + attack);
    v.g.gain.setValueAtTime(amp, t + Math.max(attack, dur - 0.03));
    v.g.gain.linearRampToValueAtTime(0, t + dur);
  }

  _cleanup(at, nodes) {
    const ms = (at - this.ctx.currentTime + 0.3) * 1000;
    if (this.offline) return;
    setTimeout(() => nodes.forEach((n) => n.disconnect()), Math.max(0, ms));
  }

  // ── Birds ────────────────────────────────────────────────────────────────
  _bird(t, activity, hours) {
    const forest = this.env.forest;
    const r = Math.random();
    let song;
    if (r < 0.32) song = 'thrush';
    else if (r < 0.52) song = 'whistle';
    else if (r < 0.72) song = 'trill';
    else if (r < 0.86) song = 'chips';
    else if (r < 0.95) song = hours < 11 || forest < 0.6 ? 'dove' : 'thrush';
    else song = forest > 0.5 ? 'woodpecker' : 'chips';
    // a singer often repeats itself a moment later, like real birds do
    const repeats = song === 'woodpecker' || song === 'dove' ? 1 : Math.random() < 0.5 ? 2 : 1;
    const { out, nodes, dist } = this._place(10, 48, 3, 13);
    const loud = rand(0.06, 0.13) * (0.7 + 0.3 * activity);
    let tt = t;
    for (let i = 0; i < repeats; i++) {
      tt = this[`_${song}`](out, tt, loud) + rand(0.8, 2.2);
    }
    this._cleanup(tt, nodes);
    return dist;
  }

  // Hermit-thrush-like: a held flute note then a quick ornamented run.
  _thrush(dest, t, amp) {
    const scale = [1760, 1975, 2217, 2637, 2960, 3322, 3520, 3951];
    const start = Math.floor(rand(0, 4));
    const notes = [{ f: scale[start], d: rand(0.3, 0.42) }];
    const n = 3 + Math.floor(rand(0, 4));
    for (let i = 0; i < n; i++) notes.push({ f: scale[Math.min(scale.length - 1, start + 1 + Math.floor(rand(0, 4)))], d: rand(0.06, 0.12) });
    const end = t + notes.reduce((s, x) => s + x.d + 0.025, 0);
    const v = this._voice(dest, t, end, 'sine', 0.08);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = rand(22, 30);
    const vg = this.ctx.createGain();
    vg.gain.value = 18;
    vib.connect(vg).connect(v.osc.frequency);
    vib.start(t);
    vib.stop(end + 0.05);
    let tt = t;
    for (const [i, x] of notes.entries()) {
      this._freq(v, tt, x.f, x.f * (i ? rand(0.97, 1.04) : 0.985), x.d);
      this._note(v, tt, x.d, amp * (i ? 0.75 : 1), i ? 0.006 : 0.03);
      tt += x.d + 0.025;
    }
    return end;
  }

  // Chickadee "fee-bee".
  _whistle(dest, t, amp) {
    const f1 = rand(3700, 4100);
    const f2 = f1 * rand(0.82, 0.88);
    const d1 = rand(0.26, 0.34);
    const d2 = rand(0.3, 0.4);
    const end = t + d1 + 0.07 + d2;
    const v = this._voice(dest, t, end, 'sine', 0.04);
    this._freq(v, t, f1, f1 * 0.98, d1);
    this._note(v, t, d1, amp, 0.03);
    this._freq(v, t + d1 + 0.07, f2, f2 * 0.99, d2);
    this._note(v, t + d1 + 0.07, d2, amp * 0.9, 0.03);
    return end;
  }

  // A warbler's accelerating trill.
  _trill(dest, t, amp) {
    const n = 8 + Math.floor(rand(0, 8));
    let f = rand(3200, 4800);
    let d = 0.065;
    let tt = t;
    const v = this._voice(dest, t, t + n * 0.09, 'sine', 0.15);
    for (let i = 0; i < n; i++) {
      this._freq(v, tt, f * 1.18, f * 0.82, d);
      this._note(v, tt, d, amp * (0.6 + 0.4 * (i / n)), 0.006);
      tt += d + 0.018;
      d *= 0.96;
      f *= 1.012;
    }
    return tt;
  }

  // Short contact chips.
  _chips(dest, t, amp) {
    const n = 2 + Math.floor(rand(0, 3));
    const f = rand(5200, 6500);
    let tt = t;
    const v = this._voice(dest, t, t + n * 0.25, 'sine', 0.1);
    for (let i = 0; i < n; i++) {
      this._freq(v, tt, f, f * 0.7, 0.03);
      this._note(v, tt, 0.03, amp * 0.8, 0.003);
      tt += rand(0.13, 0.22);
    }
    return tt;
  }

  // Soft wood-pigeon coos.
  _dove(dest, t, amp) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(dest);
    const pattern = [
      [0.32, 500, 470],
      [0.55, 545, 480],
      [0.3, 500, 470],
      [0.28, 490, 460],
    ];
    let tt = t;
    const end = t + pattern.reduce((s, p) => s + p[0] + 0.18, 0);
    const v = this._voice(lp, t, end, 'triangle', 0.2);
    for (const [d, f0, f1] of pattern) {
      this._freq(v, tt, f0, f1, d);
      this._note(v, tt, d, amp * 1.6, 0.06);
      tt += d + 0.18;
    }
    if (!this.offline) setTimeout(() => lp.disconnect(), (end - ctx.currentTime + 0.5) * 1000);
    return end;
  }

  // A distant woodpecker drumming on a dead trunk.
  _woodpecker(dest, t, amp) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(900, 1500);
    bp.Q.value = 6;
    bp.connect(dest);
    const n = 14 + Math.floor(rand(0, 10));
    let tt = t;
    let gap = 1 / rand(15, 19);
    for (let i = 0; i < n; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      const g = ctx.createGain();
      src.connect(g).connect(bp);
      envelope(g.gain, tt, 0.001, amp * 3.2 * (1 - (i / n) * 0.6), 0.018);
      src.start(tt, rand(0, 2.5), 0.03);
      tt += gap;
      gap *= 1.012;
    }
    if (!this.offline) setTimeout(() => bp.disconnect(), (tt - ctx.currentTime + 0.5) * 1000);
    return tt;
  }

  // Great horned owl: hoo, h-hoo, hoo, hoo.
  _owl(t) {
    const { out, nodes } = this._place(30, 70, 6, 14);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(out);
    const f = rand(320, 380);
    const pattern = [0.42, 0.14, 0.2, 0.5, 0.55];
    const gaps = [0.32, 0.08, 0.28, 0.32, 0];
    let tt = t;
    const end = t + pattern.reduce((s, x, i) => s + x + gaps[i], 0);
    const v = this._voice(lp, t, end, 'sine', 0.05);
    pattern.forEach((d, i) => {
      this._freq(v, tt, f * (i === 1 ? 1.06 : 1), f * 0.94, d);
      this._note(v, tt, d, 0.12, 0.05);
      tt += d + gaps[i];
    });
    this._cleanup(end, [...nodes, lp]);
  }

  // ── Animals ──────────────────────────────────────────────────────────────
  // A call from an animal standing at (x, y, z): see calls.js for the kinds.
  call(kind, x, y, z, opts) {
    if (!this.ctx || !this.enabled || (!this.offline && this.ctx.state !== 'running')) return;
    const l = this.listener;
    if (l && Math.hypot(x - l.x, z - l.z) > 260) return;
    playCall(this, kind, x, y, z, opts);
  }

  // ── Footsteps ────────────────────────────────────────────────────────────
  // surface: 'dirt' | 'grass' | 'litter'; run: 0..1; kind: 'step' | 'jump' | 'land'
  footstep(surface, run = 0, kind = 'step', strength = 1) {
    if (!this.ctx || (!this.offline && this.ctx.state !== 'running')) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.004;
    const land = kind === 'land';
    const vol = (0.16 + 0.16 * run) * rand(0.82, 1.12) * (land ? 1.2 + strength : kind === 'jump' ? 0.8 : 1);

    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.12;
    out.connect(send).connect(this.reverb);
    const nodes = [out, send];

    // the weight of the body landing
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const tg = ctx.createGain();
    thump.frequency.setValueAtTime(rand(95, 125) * (land ? 0.7 : 1), t);
    thump.frequency.exponentialRampToValueAtTime(48, t + 0.08);
    const thumpAmp = (surface === 'grass' ? 0.35 : 0.7) * (land ? 1.6 : 1);
    envelope(tg.gain, t, 0.004, thumpAmp, land ? 0.16 : 0.07);
    thump.connect(tg).connect(out);
    thump.start(t);
    thump.stop(t + 0.25);
    nodes.push(tg);

    const noise = (buf, at, dur, filters, peak, attack, decay) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rand(0.85, 1.15);
      let node = src;
      for (const f of filters) {
        const b = ctx.createBiquadFilter();
        b.type = f[0];
        b.frequency.value = f[1] * rand(0.85, 1.15);
        if (f[2]) b.Q.value = f[2];
        node.connect(b);
        node = b;
        nodes.push(b);
      }
      const g = ctx.createGain();
      envelope(g.gain, at, attack, peak, decay);
      node.connect(g).connect(out);
      nodes.push(g);
      src.start(at, rand(0, 2), dur);
    };

    const sharp = 1 + run * 0.5;
    if (surface === 'dirt') {
      noise(this.white, t, 0.2, [['bandpass', 850, 0.9]], 0.9 * sharp, 0.003, 0.085);
      noise(this.white, t + 0.006, 0.08, [['highpass', 3200]], 0.22 * sharp, 0.002, 0.035);
      // a little gravel grit
      for (let i = 0; i < 4; i++) noise(this.white, t + rand(0.005, 0.07), 0.02, [['bandpass', 4500, 3]], rand(0.08, 0.2), 0.001, 0.008);
    } else if (surface === 'grass') {
      noise(this.pink, t, 0.35, [['highpass', 1300], ['bandpass', 3300, 0.6]], 0.75 * sharp, 0.025, 0.18 - run * 0.05);
      noise(this.white, t + 0.03, 0.2, [['highpass', 5000]], 0.12, 0.03, 0.1);
    } else {
      // leaf litter: a crackle of little dry snaps over a soft crush
      noise(this.pink, t, 0.25, [['bandpass', 1800, 0.8]], 0.45 * sharp, 0.006, 0.12);
      const grains = 7 + Math.floor(rand(0, 6) + run * 4);
      for (let i = 0; i < grains; i++) {
        noise(this.white, t + rand(0, 0.13), 0.015, [['bandpass', rand(2000, 5000), 2.5]], rand(0.15, 0.5) * sharp, 0.001, rand(0.004, 0.012));
      }
    }
    thump.onended = () => {
      if (!this.offline) setTimeout(() => nodes.forEach((n) => n.disconnect()), 400);
    };
  }

  // ── Work sounds ──────────────────────────────────────────────────────────
  // kind: 'chop' | 'notch' | 'hew' | 'creak' | 'crash' | 'dig' | 'fill' | 'thud' |
  //       'stone' | 'pick' | 'grub' | 'deny'
  // opts: { size 0..1 (how big the tree / log is), strength 0..1 }
  sfx(kind, opts = {}) {
    if (!this.ctx || (!this.offline && this.ctx.state !== 'running')) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const size = opts.size ?? 0.5;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = kind === 'crash' ? 0.5 : 0.28;
    out.connect(send).connect(this.reverb);
    const nodes = [out, send];
    let end = t + 0.5;

    const noise = (buf, at, dur, filters, peak, attack, decay, rate = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * rand(0.92, 1.08);
      let node = src;
      for (const f of filters) {
        const b = ctx.createBiquadFilter();
        b.type = f[0];
        b.frequency.value = f[1];
        if (f[2]) b.Q.value = f[2];
        node.connect(b);
        node = b;
        nodes.push(b);
      }
      const g = ctx.createGain();
      envelope(g.gain, at, attack, peak, decay);
      node.connect(g).connect(out);
      nodes.push(g);
      src.start(at, rand(0, 2), dur);
      end = Math.max(end, at + dur + 0.2);
    };
    const tone = (type, at, f0, f1, peak, attack, decay) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + attack + decay);
      const g = ctx.createGain();
      envelope(g.gain, at, attack, peak, decay);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + attack + decay + 0.05);
      nodes.push(g);
      end = Math.max(end, at + attack + decay + 0.2);
    };

    switch (kind) {
      case 'chop':
      case 'notch':
      case 'hew': {
        // steel biting into wood: a hard knock, a woody body, a few chips
        const pitch = kind === 'hew' ? 1.25 : kind === 'notch' ? 1.12 : 1 - size * 0.25;
        const amp = kind === 'chop' ? 0.9 : 0.7;
        noise(this.white, t, 0.06, [['bandpass', 2600 * pitch, 1.2]], amp * 0.5, 0.001, 0.025);
        noise(this.pink, t, 0.2, [['bandpass', 520 * pitch, 2.5]], amp * 1.1, 0.002, 0.11);
        noise(this.brown, t, 0.25, [['lowpass', 380]], amp * 0.9, 0.002, 0.12);
        tone('sine', t, 190 * pitch, 85 * pitch, amp * 0.55, 0.002, 0.12);
        tone('triangle', t, 410 * pitch * rand(0.95, 1.05), 380 * pitch, amp * 0.12, 0.002, 0.18);
        for (let i = 0; i < 3; i++) noise(this.white, t + rand(0.02, 0.09), 0.02, [['bandpass', rand(3000, 5500), 3]], rand(0.05, 0.14), 0.001, 0.01);
        break;
      }
      case 'creak': {
        // fibres giving way: a slow, rough groan with snaps
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(rand(55, 75), t);
        o.frequency.linearRampToValueAtTime(rand(95, 130), t + 1.4);
        const trem = ctx.createOscillator();
        trem.frequency.value = rand(11, 17);
        const tg = ctx.createGain();
        tg.gain.value = 0.5;
        const am = ctx.createGain();
        am.gain.value = 0.5;
        trem.connect(tg).connect(am.gain);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(SILENT, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.5);
        g.gain.exponentialRampToValueAtTime(SILENT, t + 1.6);
        o.connect(am).connect(bp).connect(g).connect(out);
        o.start(t);
        trem.start(t);
        o.stop(t + 1.7);
        trem.stop(t + 1.7);
        nodes.push(tg, am, bp, g);
        for (let i = 0; i < 4; i++) noise(this.white, t + rand(0.2, 1.4), 0.03, [['bandpass', rand(1200, 2600), 2]], rand(0.2, 0.45), 0.001, 0.02);
        end = t + 2;
        break;
      }
      case 'crash': {
        // a trunk hitting the ground and the crown thrashing through the brush
        const s = opts.strength ?? 1;
        tone('sine', t, 70, 32, 1.4 * s, 0.004, 0.5);
        noise(this.brown, t, 0.8, [['lowpass', 260]], 1.6 * s, 0.004, 0.45);
        noise(this.pink, t + 0.02, 1.6, [['highpass', 900], ['lowpass', 6000]], 0.9 * s, 0.05, 1.1);
        for (let i = 0; i < 14; i++) noise(this.white, t + rand(0.0, 0.7), 0.03, [['bandpass', rand(1500, 4500), 2.5]], rand(0.1, 0.4) * s, 0.001, rand(0.008, 0.03));
        break;
      }
      case 'dig':
      case 'fill': {
        // spade into soil, then the scrape and the toss
        const f = kind === 'dig' ? 1 : 0.8;
        noise(this.white, t, 0.12, [['bandpass', 3400 * f, 1.5]], 0.25, 0.002, 0.05);
        noise(this.pink, t + 0.01, 0.35, [['bandpass', 700 * f, 0.9]], 0.65, 0.01, 0.2);
        tone('sine', t, 110, 60, 0.35, 0.003, 0.09);
        for (let i = 0; i < 6; i++) noise(this.white, t + rand(0.03, 0.22), 0.02, [['bandpass', rand(2500, 5000), 3]], rand(0.05, 0.16), 0.001, 0.01);
        break;
      }
      case 'grub': {
        noise(this.pink, t, 0.4, [['bandpass', 380, 1.4]], 0.7, 0.01, 0.25);
        for (let i = 0; i < 5; i++) noise(this.white, t + rand(0, 0.3), 0.03, [['bandpass', rand(900, 2200), 2]], rand(0.2, 0.4), 0.001, 0.02);
        break;
      }
      case 'thud': {
        // a heavy log set down on another: low knock with a hollow ring
        const s = 0.6 + size * 0.6;
        tone('sine', t, 120, 52, 0.9 * s, 0.003, 0.22);
        noise(this.pink, t, 0.25, [['bandpass', 240, 3]], 0.8 * s, 0.003, 0.16);
        tone('triangle', t + 0.005, 230 * rand(0.95, 1.05), 210, 0.12, 0.003, 0.3);
        noise(this.white, t, 0.04, [['bandpass', 1800, 1.5]], 0.15, 0.001, 0.02);
        break;
      }
      case 'stone': {
        for (let i = 0; i < 3; i++) {
          const at = t + i * rand(0.05, 0.11);
          noise(this.white, at, 0.04, [['bandpass', rand(1900, 3200), 6]], rand(0.35, 0.6), 0.001, 0.025);
          tone('sine', at, rand(1300, 2100), 1100, 0.08, 0.001, 0.05);
        }
        break;
      }
      case 'pick': {
        noise(this.pink, t, 0.2, [['bandpass', 900, 1]], 0.4, 0.01, 0.1);
        noise(this.white, t + 0.06, 0.04, [['bandpass', 2600, 4]], 0.3, 0.001, 0.025);
        break;
      }
      case 'deny': {
        tone('triangle', t, 220, 180, 0.14, 0.01, 0.12);
        tone('triangle', t + 0.1, 180, 150, 0.12, 0.01, 0.14);
        break;
      }
      default:
        break;
    }
    if (!this.offline) setTimeout(() => nodes.forEach((n) => n.disconnect()), (end - ctx.currentTime + 0.6) * 1000);
  }
}
