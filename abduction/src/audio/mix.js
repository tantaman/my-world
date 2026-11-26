// The sound, all Web Audio (PLAN.md 5.16): a bus everything goes through,
// cut off with the picture at the end, and a meter per channel for the
// overlay. Started from the title card's click (a browser will not play
// sound without one); its clock then drives t (timeline.js), so picture and
// sound cannot drift.
import { T } from '../timeline.js';
import { BOLTS } from '../weather/lightning.js';
import { rain, thunder, car, saucer, drone, glitch, noiseBuffer } from './voices.js';

const SPEED_OF_SOUND = 343;

export async function createMix() {
  const ctx = new AudioContext();
  await ctx.resume();
  const start = ctx.currentTime + 0.05;
  const bus = ctx.createGain();
  bus.gain.value = 1;
  // Everything cut off at the end, between 70.5 and 71.5 s.
  bus.gain.setValueAtTime(1, start + 70.5);
  bus.gain.linearRampToValueAtTime(0.6, start + T.glitch[0]);
  bus.gain.setValueAtTime(0, start + 71.5);
  const comp = ctx.createDynamicsCompressor();
  bus.connect(comp).connect(ctx.destination);

  // Meters: the two channels, split and measured.
  const split = ctx.createChannelSplitter(2);
  comp.connect(split);
  const meters = [0, 1].map((ch) => {
    const a = ctx.createAnalyser();
    a.fftSize = 1024;
    split.connect(a, ch);
    return { a, buf: new Float32Array(a.fftSize) };
  });

  const noise = noiseBuffer(ctx, 3);
  const voices = [rain(ctx, bus, noise), car(ctx, bus, noise), saucer(ctx, bus, start)];
  drone(ctx, bus, start);
  glitch(ctx, bus, noise, start);
  // Thunder after each strike, by its distance from where the camera is then.
  const strikes = [[T.strike1, BOLTS[0], 1], [T.strike2, BOLTS[1], 1.3]];
  for (const [at, bolt, loud] of strikes) {
    const d = Math.hypot(bolt.at[0], bolt.at[2] - 10);
    thunder(ctx, bus, noise, start, at, d / SPEED_OF_SOUND, loud);
  }

  return {
    ctx,
    startTime: start,
    // listener: { underCanopy, car: {x, z, approach} | null, ufo: {distance, speed} | null }
    update(t, listener) {
      for (const v of voices) v.update(t, listener);
    },
    levels() {
      return meters.map(({ a, buf }) => {
        a.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length);
        // -48 dB .. 0 dB onto 0..1.
        return Math.max(0, Math.min(1, 1 + (20 * Math.log10(rms + 1e-6)) / 48));
      });
    },
  };
}
