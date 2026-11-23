// The air of Purgatory: a real sky, the forest's own (world/sky.js), with
// the sun keeping the mountain's hours rather than the forest's, and the sea
// going off into the haze to the horizon.
//
// The sky is lent: while you're on the mountain its dome, its sun and the
// light of the sky are moved into Purgatory's scene (index.js), and each
// frame it is worked out again for the mountain's hour (lendHour), the
// forest's being put back after. The picture is drawn through the
// pipeline's air, which is the forest's too: how thick it is, how far it
// reaches, where it thins out upward from; those are lent for the frame
// Purgatory is drawn in (lend), and handed back after (giveBack).
//
// On the third terrace, the smoke: "darkness of hell, and of a night
// deprived of every planet", so thick no eye could stay open. It comes in
// as you walk into it and closes round you; the sky and the sun go dark in
// it.

import { DECK, UNDER, SKY } from '../render/uniforms.js';

const EASE = 0.5; // 1/s: how quickly the smoke closes round you, or lifts
const FAR = 7800; // m: the last thing drawn (the sea, to the horizon)
const HAZE = 0.16; // how thick the air is, 1 being the forest's: clear sea air, the far shore of the world
const THIN = 0.012; // per metre of height: how quickly it thins upward from the sea
const SMOKE = { haze: 260, dark: 0.9, far: 60 }; // in the smoke: how thick, how much of the light it takes, how far anything is drawn
const SKY_DEPTH = 1.3e-4; // 1/m: how much nearer than the far plane the picture's "sky" begins, as 1/z

export class MountAir {
  // sky: the forest's (world/sky.js)
  constructor(sky) {
    this.sky = sky;
    // how thick the smoke is about you just now (0..1), and how thick
    // where you are says it should be
    this.smoke = 0;
    this.fresh = true;
    this._kept = {};
  }

  // Ease the smoke toward `want` (0..1).
  update(dt, want) {
    const k = this.fresh ? 1 : 1 - Math.exp(-dt * EASE * (want > this.smoke ? 1.5 : 1));
    this.fresh = false;
    this.smoke += (want - this.smoke) * k;
  }

  // Work the sky out for the mountain's `hours`, as seen from `focus` by an
  // eye at `eye`, and put the forest's hour back. (It is lit as the sun
  // there is, overcast or not: the mountain has no weather of the forest's.)
  lendHour(hours, focus, eye) {
    const sky = this.sky;
    const keep = { hours: sky.hours, overcast: sky.overcast, open: sky.open };
    sky.hours = hours;
    sky.overcast = 0;
    sky.open = 1;
    try {
      sky.update(focus, eye);
    } finally {
      sky.hours = keep.hours;
      sky.overcast = keep.overcast;
      sky.open = keep.open;
    }
    // in the smoke, the sun and the sky go dark
    const lit = 1 - SMOKE.dark * this.smoke;
    sky.sun.intensity *= lit;
    sky.hemi.intensity *= 1 - (SMOKE.dark - 0.25) * this.smoke;
  }

  // Lend the pipeline's air, and the sky's colours, to the mountain.
  // -> what to hand to pipeline.render as the exposure.
  lend(pipeline, camera, sea) {
    const kept = this._kept;
    kept.haze = pipeline.haze;
    kept.fogFar = pipeline.fogFar;
    kept.fogFloor = pipeline.fogFloor;
    kept.fogThin = pipeline.fogThin;
    kept.deck = DECK.uDeckCover.value;
    kept.under = UNDER.uUnder.value;
    kept.far = camera.far;
    kept.zen = SKY.uZenith.value.clone();
    kept.hor = SKY.uHorizon.value.clone();
    kept.col = SKY.uSunColor.value.clone();

    const s = this.smoke;
    pipeline.haze = HAZE + (SMOKE.haze - HAZE) * s * s;
    pipeline.fogFar = FAR + (SMOKE.far - FAR) * Math.min(1, s * 1.4);
    pipeline.fogFloor = sea;
    pipeline.fogThin = THIN * (1 - s) + 1e-5 * s;
    DECK.uDeckCover.value = 0;
    UNDER.uUnder.value = 0;
    if (s > 0.001) {
      // the smoke takes its colour from the sky: so the sky goes the smoke's
      const dark = 1 - SMOKE.dark * s;
      SKY.uZenith.value.multiplyScalar(dark);
      SKY.uHorizon.value.lerp(SKY.uHorizon.value.clone().setRGB(0.035, 0.033, 0.03), s).multiplyScalar(1 - 0.3 * s);
      SKY.uSunColor.value.multiplyScalar(dark);
    }
    // (the picture takes whatever is in the last hundred-thousandth of its
    // depth for sky: keep the far plane well past the last thing drawn)
    camera.far = 1 / (1 / pipeline.fogFar - SKY_DEPTH);
    camera.updateProjectionMatrix();
    return this.sky.exposure * (1 + 0.6 * s);
  }

  // ...and hand them back.
  giveBack(pipeline, camera) {
    const kept = this._kept;
    pipeline.haze = kept.haze;
    pipeline.fogFar = kept.fogFar;
    pipeline.fogFloor = kept.fogFloor;
    pipeline.fogThin = kept.fogThin;
    DECK.uDeckCover.value = kept.deck;
    UNDER.uUnder.value = kept.under;
    SKY.uZenith.value.copy(kept.zen);
    SKY.uHorizon.value.copy(kept.hor);
    SKY.uSunColor.value.copy(kept.col);
    camera.far = kept.far;
    camera.updateProjectionMatrix();
  }
}
