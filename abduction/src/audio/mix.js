// The sound, all Web Audio (PLAN.md 5.16): our cue (music.js, score.js)
// and the sounds of the place (voices.js) on two buses, a room (a
// convolution reverb from a generated impulse response) both send to, a
// little saturation on the music, and a safety limiter; at the end the
// whole closes down through a falling low-pass and is gone by 72.2 s, as the
// original's is. A meter per channel for the overlay.
//
// Everything is scheduled for the whole take when the sound starts, from t
// and from where the listener is then (hearing.js reads the camera's path,
// the car and the saucer), so the page and an offline render
// (renderTake, for tools/sound.mjs) play the same take sample for sample.
// Started from the title card's click (a browser will not play sound
// without one); its clock then drives t (timeline.js), so picture and sound
// cannot drift. On the private page the original's own sound plays in its
// place where reference/ has it (original.js), on the same clock.
import { LENGTH } from '../timeline.js';
import { impulse, softClip, dB, gain, once } from './dsp.js';
import { rain, thunder, car, saucer, prepareVoices } from './voices.js';
import { music, prepareMusic } from './music.js';

const LEAD_IN = 0.25;          // s from choosing t = 0 to its coming: time to build the graph, so nothing is late
const MUSIC = 3.5;             // dB, the music bus
const PLACE = 0;               // dB, the sounds' bus
const ROOM = -9;               // dB, the reverb's return
const ROOM_SECONDS = 3.2;      // s, its impulse response's length
const ROOM_RT60 = 2.6;         // s to die away 60 dB
const DRIVE = 1.3;             // how hard the music's saturation (tanh) rounds its peaks
const DRIVE_IN = 12;           // dB into the saturation (and back out after it): its loudest moments reach it
// The end, as the original's: everything eases down from 70.4 s, the last
// beat lands at 71.3, then it all closes down through a falling low-pass and
// is silent by 72.25. [t, dB] for the level, [t, Hz] for the low-pass.
const END_LEVEL = [[70.4, 0], [71.1, -9], [71.5, -13], [71.8, -24], [72.0, -34], [72.15, -55], [72.25, -100]];
// The start, as the original's: silent for 35 ms, then in over 55 ms. [s, s]
const START = [0.035, 0.09];
const END_CLOSE = [[71.2, 18000], [71.8, 2500], [72.15, 300]];
const CODEC_TOP = 15500;       // Hz, where the original's compression cut its highs off (two low-passes: 24 dB an octave)

const roomOf = (sr) => once('room', sr, () => impulse(sr, { seconds: ROOM_SECONDS, rt60: ROOM_RT60 }));

// Every buffer the take needs, computed (a tenth of a second or so) before
// its start is chosen, so that scheduling it is quick and nothing is late.
function prepare(sampleRate) {
  roomOf(sampleRate);
  prepareMusic(sampleRate);
  prepareVoices(sampleRate);
}

// Builds the whole take into ctx, t = 0 at `start` (its time), ending in `destination`.
function build(ctx, start, destination) {
  const end = start + LENGTH;
  const master = gain(ctx, 0);
  master.gain.setValueAtTime(0, start + START[0]);
  master.gain.linearRampToValueAtTime(1, start + START[1]);
  master.gain.setValueAtTime(1, start + END_LEVEL[0][0]);
  for (const [t, level] of END_LEVEL.slice(1)) master.gain.linearRampToValueAtTime(level <= -100 ? 0 : dB(level), start + t);
  const close = ctx.createBiquadFilter();
  close.type = 'lowpass';
  close.Q.value = 0.5;
  close.frequency.value = END_CLOSE[0][1];
  close.frequency.setValueAtTime(END_CLOSE[0][1], start + END_CLOSE[0][0]);
  for (const [t, f] of END_CLOSE.slice(1)) close.frequency.exponentialRampToValueAtTime(f, start + t);
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -6;
  limit.knee.value = 0;
  limit.ratio.value = 12;
  limit.attack.value = 0.002;
  limit.release.value = 0.12;
  // The original's sound is compressed with nothing kept over 15.5 kHz: ours too.
  const codec = [0, 1].map(() => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = CODEC_TOP;
    f.Q.value = 0.7;
    return f;
  });
  master.connect(close).connect(codec[0]).connect(codec[1]).connect(limit).connect(destination);

  // The room both buses send to.
  const room = ctx.createConvolver();
  room.normalize = false;
  room.buffer = roomOf(ctx.sampleRate);
  const roomOut = ctx.createGain();
  roomOut.gain.value = dB(ROOM);
  room.connect(roomOut).connect(master);

  const musicIn = ctx.createGain();
  musicIn.gain.value = dB(DRIVE_IN);
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClip(DRIVE);
  shaper.oversample = '2x';
  const musicOut = ctx.createGain();
  musicOut.gain.value = dB(MUSIC - DRIVE_IN);
  musicIn.connect(shaper).connect(musicOut).connect(master);
  const place = ctx.createGain();
  place.gain.value = dB(PLACE);
  place.connect(master);

  music(ctx, musicIn, room, start, end);
  rain(ctx, place, room, start);
  thunder(ctx, place, start);
  car(ctx, place, start);
  saucer(ctx, place, room, start);
  return limit;
}

// The page's sound, started from the title card's click. `recorded` (an
// AudioBuffer, or a promise of one or of null) is played instead of ours,
// from its first sample at t = 0: the original's own, on the private page
// (original.js). The context is made before it is waited for, while the
// click still counts.
export async function createMix({ recorded = null } = {}) {
  const ctx = new AudioContext();
  await ctx.resume();
  const take = await recorded;
  if (!take) prepare(ctx.sampleRate);
  const start = ctx.currentTime + LEAD_IN;
  let out;
  if (take) {
    // As it is: its own level, its own fade at the end.
    out = ctx.createBufferSource();
    out.buffer = take;
    out.connect(ctx.destination);
    out.start(start);
  } else out = build(ctx, start, ctx.destination);
  console.info(`sound: ${take ? 'the original\'s' : 'ours'}`);
  // The picture follows what is heard: the audio clock runs ahead of the
  // speakers by the output's latency, so t = 0 is that much after `start`.
  const heard = start + (ctx.outputLatency || ctx.baseLatency || 0);

  // Meters: the two channels, split and measured.
  const split = ctx.createChannelSplitter(2);
  out.connect(split);
  const meters = [0, 1].map((ch) => {
    const a = ctx.createAnalyser();
    a.fftSize = 1024;
    split.connect(a, ch);
    return { a, buf: new Float32Array(a.fftSize) };
  });

  return {
    ctx,
    startTime: heard,
    // Everything was scheduled at the start; nothing follows the frame.
    update() {},
    levels() {
      return meters.map(({ a, buf }) => {
        a.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length);
        // -60 dB .. -12 dB onto 0..1 (the take sits near -34 dB).
        return Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-6) + 60) / 48));
      });
    },
  };
}

// The whole take rendered offline, at `sampleRate`: an AudioBuffer (tools/sound.mjs).
export async function renderTake({ sampleRate = 48000 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(LENGTH * sampleRate), sampleRate);
  prepare(sampleRate);
  build(ctx, 0, ctx.destination);
  return ctx.startRendering();
}
