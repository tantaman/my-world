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
// it. The render pipeline draws the same bank along the ledge, including
// when it lies ahead of you or across the sky.

import { Vector3, Vector4 } from 'three';
import { DECK, UNDER } from '../render/uniforms.js';
import { wrap } from './land.js';
import { TERRACES, WAYS, WIDE } from './plan.js';

const EASE = 0.5; // 1/s: how quickly the smoke closes round you, or lifts
const FAR = 7800; // m: the last thing drawn (the sea, to the horizon)
const CAMERA_FAR = 50000; // m: keep the horizon clear of the depth buffer's sky cutoff
const HAZE = 0.16; // how thick the air is, 1 being the forest's: clear sea air, the far shore of the world
const THIN = 0.012; // per metre of height: how quickly it thins upward from the sea
const WRATH = TERRACES[2];
const SMOKE = {
  from: 18, to: 45, // m of clear path at the entrance and the next stair
  feather: 25, // m for the smoke to thicken at either end
  inward: 4, outward: 18, // m of room along the bank and out over the rim
  height: 28, // m of room for the billows
  density: 0.64, // 1/m through the thickest part
  dark: 0.9, // how much of the sunlight it takes
};
const SMOKE_R = WRATH.r - WIDE / 2;
const SMOKE_FROM = WAYS[2].a1 - SMOKE.from / SMOKE_R;
const SMOKE_TO = WAYS[3].a0 + SMOKE.to / SMOKE_R;

export class MountAir {
  // sky: the forest's (world/sky.js)
  constructor(sky, land) {
    this.sky = sky;
    const from = SMOKE_FROM + land.turn;
    const to = SMOKE_TO + land.turn;
    this.bank = {
      center: new Vector3(land.cx, land.top + WRATH.h, land.cz),
      shape: new Vector4(WRATH.r - WIDE - SMOKE.inward, WRATH.r + SMOKE.outward, SMOKE.height, SMOKE.density),
      edges: new Vector4(Math.sin(from), -Math.cos(from), -Math.sin(to), Math.cos(to)),
      feather: SMOKE.feather,
    };
    // The smoke at your feet, for the light and the voices (0..1).
    this.smoke = 0;
    this.fresh = true;
    this._kept = {};
  }

  // Ease the local light and voices as you cross the ends of the bank.
  update(dt, onTerrace, r, th) {
    const along = Math.min(wrap(SMOKE_FROM - th), wrap(th - SMOKE_TO)) * r;
    const want = onTerrace ? Math.min(1, Math.max(0, along / SMOKE.feather)) : 0;
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

  // Lend the pipeline's air to the mountain.
  // -> what to hand to pipeline.render as the exposure.
  lend(pipeline, camera, sea) {
    const kept = this._kept;
    kept.haze = pipeline.haze;
    kept.fogFar = pipeline.fogFar;
    kept.fogFloor = pipeline.fogFloor;
    kept.fogThin = pipeline.fogThin;
    kept.airBank = pipeline.airBank;
    kept.deck = DECK.uDeckCover.value;
    kept.under = UNDER.uUnder.value;
    kept.far = camera.far;
    pipeline.haze = HAZE;
    pipeline.fogFar = FAR;
    pipeline.fogFloor = sea;
    pipeline.fogThin = THIN;
    pipeline.airBank = this.bank;
    DECK.uDeckCover.value = 0;
    UNDER.uUnder.value = 0;
    camera.far = CAMERA_FAR;
    camera.updateProjectionMatrix();
    return this.sky.exposure;
  }

  // ...and hand them back.
  giveBack(pipeline, camera) {
    const kept = this._kept;
    pipeline.haze = kept.haze;
    pipeline.fogFar = kept.fogFar;
    pipeline.fogFloor = kept.fogFloor;
    pipeline.fogThin = kept.fogThin;
    pipeline.airBank = kept.airBank;
    DECK.uDeckCover.value = kept.deck;
    UNDER.uUnder.value = kept.under;
    camera.far = kept.far;
    camera.updateProjectionMatrix();
  }
}
