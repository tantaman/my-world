// What a waterfall sounds like: a layer (see addLayer in audio/soundscape.js)
// that gives each of the falls nearest you a voice of its own, placed where
// its water lands. A deep roar of brown noise under a hiss of pink, the roar
// the deeper and the louder the further the water drops; a cascade is more
// hiss than roar. Which falls those are, and how far off, comes from the
// feature each frame (falls.heard).

import { setPos, SILENT } from '../audio/kit.js';

const BUS = 'ambience';
// How loud a fall is at 1 m for each metre it drops, and the most.
const LOUD_PER_M = 0.035;
const LOUDEST = 0.5;
// m: within this a fall is as loud as it gets; past it, it falls away as 1/d.
const NEAR = 3;

export function roar(falls) {
  return {
    name: 'falls',

    build() {
      this.voices = [];
    },

    update(s, t) {
      const list = falls.heard;
      while (this.voices.length < list.length) this.voices.push(voice(s));
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        const f = list[i];
        if (!f) {
          v.out.gain.setTargetAtTime(SILENT, t, 0.4);
          continue;
        }
        // a different fall took this voice: move it there while it's quiet
        if (v.at !== f) {
          v.out.gain.setValueAtTime(SILENT, t);
          v.at = f;
        }
        const [x, y, z] = f.shape.foot;
        setPos(v.pan, x, y + 0.5, z);
        const h = f.shape.height;
        v.pan.refDistance = NEAR + h * 0.3;
        v.out.gain.setTargetAtTime(Math.min(LOUDEST, LOUD_PER_M * h), t, 0.4);
        // a big drop is deep; a cascade, all hiss
        const deep = f.shape.cascade ? 0.15 : Math.min(1, h / 10);
        v.low.gain.setTargetAtTime(0.25 + 0.75 * deep, t, 0.4);
        v.hiss.gain.setTargetAtTime(0.5 - 0.25 * deep, t, 0.4);
        v.lp.frequency.setTargetAtTime(500 + 900 * (1 - deep), t, 0.4);
      }
    },
  };
}

// One fall's voice: brown noise (the roar) and pink (the hiss of spray),
// through a low-pass, into a panner where the water lands.
function voice(s) {
  const ctx = s.ctx;
  const { dry, wet } = s.bus(BUS);
  const pan = ctx.createPanner();
  pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
  pan.distanceModel = 'inverse';
  pan.refDistance = NEAR;
  pan.rolloffFactor = 1.2;
  pan.connect(dry);
  const send = ctx.createGain();
  send.gain.value = 0.3;
  pan.connect(send).connect(wet);
  const out = ctx.createGain();
  out.gain.value = SILENT;
  out.connect(pan);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(out);
  const low = ctx.createGain();
  const hiss = ctx.createGain();
  low.connect(lp);
  hiss.connect(out);
  const brown = ctx.createBufferSource();
  brown.buffer = s.brown;
  brown.loop = true;
  brown.connect(low);
  const pink = ctx.createBufferSource();
  pink.buffer = s.pink;
  pink.loop = true;
  // (the hiss through a high shelf of its own, so it's spray, not rumble)
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  pink.connect(hp).connect(hiss);
  const at = ctx.currentTime;
  brown.start(at, Math.random() * 3);
  pink.start(at, Math.random() * 3);
  return { pan, out, lp, low, hiss, at: null };
}
