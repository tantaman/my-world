// What the club sounds like, made from noise, oscillators and numbers like
// every other sound here (audio/soundscape.js), on a bus of its own
// ('improv'):
//
//   the room     a layer: the murmur of the crowd before the show and
//                between shows; the house music, a funk groove from the
//                speakers, soft while people find their seats and up loud
//                when a comic is brought on; heard in the room you're in,
//                and a little from the lobby
//   one-offs     the room laughing (four sizes of it), applause (with a
//                whoop or two for a big one), the room shouting suggestions
//   underfoot    carpet (the video store's: videostore/sound.js)
//
// The laughs and the applause are worked out a few at a time (laughs.js),
// out of the frame's allowance, the first time you come near: pump(ms).
//
//   const room = clubSounds()          sound.addLayer(room)
//   room.pump(ms)                      -> true while there's more to work out
//   room.set({ heard, murmur, music }) each frame: how much of the room you
//                                      hear (0..1), how many are talking, the music
//   room.laugh(level) · room.applause(s, cheer) · room.shout() · room.stop()

import { SILENT } from '../audio/kit.js';
import { laughing, clapping, murmuring, shouting } from './laughs.js';

const BUS = 'improv';
const BEAT = 60 / 100; // s, the house music's beat
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MUSIC = 0.11; // as loud as the music gets
const MURMUR = 0.32; // ...and the crowd talking
const ONE_OFF = 0.9; // ...and a laugh or applause, in the room

// What's worked out, in the order it's wanted: the laughs first.
const MAKE = [
  ['laugh1', () => laughing(1, 11)],
  ['laugh2', () => laughing(2, 21)],
  ['laugh0', () => laughing(0, 31)],
  ['laugh3', () => laughing(3, 41)],
  ['clap', () => clapping(4.5, 51, { people: 40, cheer: 1 })],
  ['clapBig', () => clapping(5.5, 61, { people: 55, cheer: 3 })],
  ['laugh2b', () => laughing(2, 71)],
  ['laugh1b', () => laughing(1, 81)],
  ['shout', () => shouting(91)],
  ['murmur', () => murmuring(9, 101)],
];

// The groove: a bar of bass (semitones over E), and the chord stabs.
const BASS = [[0, 0], [0.75, 0], [1.5, 3], [2, 5], [2.75, 7], [3.25, 10], [3.5, 12]];
const STABS = [[1, [64, 67, 71, 74]], [2.5, [64, 67, 71, 74]], [3.75, [62, 66, 69, 72]]];

export function clubSounds() {
  const made = new Map(); // name -> { rate, data }
  let making = null; // { name, steps }: what's being worked out
  return {
    name: 'improv',
    ctx: null,
    buffers: new Map(),
    level: { heard: 0, murmur: 0, music: 0 },

    pump(ms) {
      const until = performance.now() + ms;
      for (const [name, make] of MAKE) {
        if (made.has(name)) continue;
        if (!making || making.name !== name) making = { name, steps: make() };
        for (;;) {
          const r = making.steps.next();
          if (r.done) {
            made.set(name, r.value);
            making = null;
            break;
          }
          if (performance.now() > until) return true;
        }
      }
      return false;
    },
    get ready() {
      return made.size >= MAKE.length;
    },

    build(s) {
      const ctx = s.ctx;
      this.s = s;
      this.ctx = ctx;
      const { dry } = s.bus(BUS);
      this.out = ctx.createGain();
      this.out.gain.value = SILENT;
      this.out.connect(dry);
      this.music = ctx.createGain();
      this.music.gain.value = SILENT;
      // (the house speakers: no deep bass, no fizz)
      const speakers = ctx.createBiquadFilter();
      speakers.type = 'lowpass';
      speakers.frequency.value = 5200;
      this.music.connect(speakers).connect(dry);
      this.crowd = ctx.createGain();
      this.crowd.gain.value = SILENT;
      this.crowd.connect(this.out);
      this.next = 0;
      this.bar = 0;
      this.loop = null;
    },

    buffer(name) {
      if (!this.ctx) return null;
      let b = this.buffers.get(name);
      if (b) return b;
      const m = made.get(name);
      if (!m) return null;
      b = this.ctx.createBuffer(1, m.data.length, m.rate);
      b.copyToChannel(m.data, 0);
      this.buffers.set(name, b);
      return b;
    },

    play(name, gain = 1, rate = 1) {
      const b = this.buffer(name);
      if (!b || !this.s?.live) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = gain * ONE_OFF;
      src.connect(g).connect(this.out);
      src.start();
      src.onended = () => g.disconnect();
      this.playing = this.playing || new Set();
      this.playing.add(src);
      src.addEventListener('ended', () => this.playing.delete(src));
      return src;
    },

    laugh(level) {
      if (level <= 0) return this.play('laugh0', 0.5, 0.95 + Math.random() * 0.1);
      const alt = Math.random() < 0.5 ? 'b' : '';
      const name = level >= 3 ? 'laugh3' : level === 2 ? `laugh2${alt}` : `laugh1${alt}`;
      const src = this.play(name, 1, 0.96 + Math.random() * 0.08) || this.play(`laugh${Math.min(3, level)}`);
      // a big one gets a hand, too
      if (level >= 3) setTimeout(() => this.play('clap', 0.55), 900);
      return src;
    },
    applause(seconds = 4, cheer = false) {
      return this.play(cheer ? 'clapBig' : 'clap', cheer ? 1 : 0.85, (cheer ? 5.5 : 4.5) / Math.max(2, Math.min(seconds + 0.6, 7)));
    },
    shout() {
      return this.play('shout', 0.8);
    },
    stop() {
      for (const src of this.playing || []) {
        try {
          src.stop();
        } catch {
          // (already stopped)
        }
      }
    },

    set(level) {
      Object.assign(this.level, level);
    },

    update(s, t) {
      const L = this.level;
      this.out.gain.setTargetAtTime(Math.max(SILENT, L.heard), t, 0.25);
      this.crowd.gain.setTargetAtTime(Math.max(SILENT, L.murmur * MURMUR), t, 0.6);
      this.music.gain.setTargetAtTime(Math.max(SILENT, L.heard * L.music * MUSIC), t, 0.3);
      // the murmur, looping, while there's anyone to murmur
      const want = L.heard > 0.01 && L.murmur > 0.01;
      if (want && !this.loop) {
        const b = this.buffer('murmur');
        if (b) {
          this.loop = s.ctx.createBufferSource();
          this.loop.buffer = b;
          this.loop.loop = true;
          this.loop.connect(this.crowd);
          this.loop.start();
        }
      } else if (!want && this.loop) {
        this.loop.stop(t + 1);
        this.loop = null;
      }
      // the music, a bar at a time, scheduled a little ahead
      if (L.heard * L.music < 0.01) {
        this.next = 0;
        return;
      }
      if (this.next < t) this.next = t + 0.05;
      while (this.next < t + 0.6) {
        this._bar(this.next);
        this.next += BEAT * 4;
        this.bar++;
      }
    },

    _bar(at) {
      const ctx = this.ctx;
      const out = this.music;
      const tone = (type, f, when, len, amp, glide = 1) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, when);
        if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide, when + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(SILENT, when);
        g.gain.exponentialRampToValueAtTime(amp, when + 0.006);
        g.gain.exponentialRampToValueAtTime(SILENT, when + len);
        o.connect(g).connect(out);
        o.start(when);
        o.stop(when + len + 0.05);
        o.onended = () => g.disconnect();
      };
      const noise = (when, len, amp, hp) => {
        const src = ctx.createBufferSource();
        src.buffer = this.s.white;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = hp;
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp, when);
        g.gain.exponentialRampToValueAtTime(SILENT, when + len);
        src.connect(f).connect(g).connect(out);
        src.start(when, Math.random() * 1.5, len + 0.05);
        src.onended = () => g.disconnect();
      };
      const turn = this.bar % 4 === 3;
      // the kick and the snare, the hats on the eighths
      for (const b of [0, 1.75, 2.5]) tone('sine', 120, at + b * BEAT, 0.28, 0.9, 0.35);
      for (const b of [1, 3]) noise(at + b * BEAT, 0.16, 0.5, 1400);
      for (let e = 0; e < 8; e++) noise(at + e * BEAT * 0.5, 0.04, e % 2 ? 0.12 : 0.2, 7000);
      // the bass, and the stabs
      const root = turn ? 45 : 40; // E, or A on the last bar of four
      for (const [b, n] of BASS) tone('triangle', NOTE(root + n), at + b * BEAT, BEAT * 0.45, 0.55);
      for (const [b, chord] of STABS) for (const n of chord) tone('square', NOTE(n + (turn ? 5 : 0)), at + b * BEAT, 0.12, 0.05);
    },
  };
}
