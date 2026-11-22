// The air of Hell: "the air without a star". What is overhead, what light
// there is and where it comes from, and how far you can see through it.
//
// Each region of the plan says what its air is like (plan.REGIONS[].air);
// this eases from one to the next as you go down, and holds what is drawn
// with it:
//
//   the dome    the dark overhead, the murk at eye level, and a glow toward
//               the middle of the pit, where the fires are
//   the lights  one from above and below (the murk's own), and one, low,
//               from the middle of the pit
//
// There is no sun down here and no hour of the day, so none of this is the
// sky's (world/sky.js). The picture is put together from the same shared
// sky uniforms the forest's is, though (the fog takes its colour from them:
// render/pipeline.js), so they are lent to Hell while it is being drawn, and
// handed back after: lend() and its return.

import * as THREE from 'three';
import { SKY, DECK, UNDER } from '../render/uniforms.js';
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SEEN } from './look.js';

const EASE = 0.7; // 1/s: how quickly the air of the next region comes over you
const FOG = 0.0021; // per metre: the forest's air, which the pipeline's `haze` is counted in
const DIM = 2.3; // how many times over the air dims a thing as far off as you can see
const FAR = [1.9, 2600]; // the last thing drawn: this many sights off, and never further (m)
const SKY_DEPTH = 1.3e-4; // 1/m: how much nearer than the far plane the picture's "sky" begins, as 1/z
const LOW = 0.16; // how far above level the light from the pit comes (sine)

const MURK = 2.0; // how strong the light of the murk itself is (the fires are lights of their own: render/lights.js)
const PIT = 2.6; // and the light from the pit

const KEYS = ['zen', 'hor', 'glow', 'amb', 'gnd'];

export class HellAir {
  constructor(scene) {
    this.now = { zen: [0, 0, 0], hor: [0, 0, 0], glow: [0, 0, 0], amb: [0, 0, 0], gnd: [0, 0, 0], sight: 600, lit: 2.2 };
    this.fresh = true;
    this.toAxis = new THREE.Vector3(1, 0, 0);
    // more murk than the region has of its own (0..1): rain, smoke
    this.thick = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: SKY,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        ${SKY_UNIFORMS_GLSL}
        ${NOISE_GLSL}
        ${SKY_GLSL}
        varying vec3 vDir;
        void main() {
          vec3 rd = normalize(vDir);
          vec3 col = skyGradient(rd);
          // smoke going over, slowly, lit a little from under
          if (rd.y > 0.0) {
            vec2 uv = rd.xz / (rd.y + 0.22) * 1.3 + vec2(uTime * 0.004, -uTime * 0.0025);
            float c = fbm4(uv * 0.8) * 0.7 + fbm4(uv * 2.6 + 3.0) * 0.3;
            float cov = smoothstep(0.42, 0.78, c) * smoothstep(0.0, 0.3, rd.y);
            col = mix(col, uHorizon * 0.55 + uSunColor * 0.06, cov * 0.7);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), mat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.hemi.layers.enableAll();
    scene.add(this.hemi);
    this.pit = new THREE.DirectionalLight(0xffffff, 1);
    this.pit.layers.enableAll();
    scene.add(this.pit, this.pit.target);
    this._kept = {};
  }

  // Ease toward a region's air (at once, the first time or with snap), and
  // put the dome and the lights where the eye is. toAxis: the way to the
  // middle of the pit from there, in plan (x, z; any length).
  update(dt, air, eye, ax, az, snap = false) {
    const k = snap || this.fresh ? 1 : 1 - Math.exp(-dt * EASE);
    this.fresh = false;
    const now = this.now;
    for (const key of KEYS) for (let c = 0; c < 3; c++) now[key][c] += (air[key][c] - now[key][c]) * k;
    now.sight += (air.sight - now.sight) * k;
    now.lit += (air.lit - now.lit) * k;
    const l = Math.hypot(ax, az) || 1;
    this.toAxis.set(ax / l, LOW, az / l).normalize();

    this.dome.position.copy(eye);
    this.hemi.color.setRGB(...now.amb);
    this.hemi.groundColor.setRGB(...now.gnd);
    this.hemi.intensity = MURK;
    this.pit.color.setRGB(...now.glow);
    this.pit.intensity = PIT;
    this.pit.target.position.copy(eye);
    this.pit.position.copy(eye).addScaledVector(this.toAxis, 200);
    this.pit.target.updateMatrixWorld();
  }

  // How far you can see just now (m).
  get sight() {
    return this.now.sight * (1 - 0.6 * this.thick);
  }

  // Lend the shared sky and the pipeline's air to Hell, to draw it by.
  // -> what to hand to pipeline.render as the exposure.
  lend(pipeline, camera) {
    const now = this.now;
    const kept = this._kept;
    kept.sun = SKY.uSunDir.value.clone();
    kept.zen = SKY.uZenith.value.clone();
    kept.hor = SKY.uHorizon.value.clone();
    kept.col = SKY.uSunColor.value.clone();
    kept.night = SKY.uNight.value;
    kept.haze = pipeline.haze;
    kept.fogFar = pipeline.fogFar;
    kept.fogFloor = pipeline.fogFloor;
    kept.fogThin = pipeline.fogThin;
    kept.deck = DECK.uDeckCover.value;
    kept.under = UNDER.uUnder.value;
    kept.far = camera.far;

    SKY.uSunDir.value.copy(this.toAxis);
    SKY.uZenith.value.setRGB(...now.zen);
    SKY.uHorizon.value.setRGB(...now.hor);
    SKY.uSunColor.value.setRGB(...now.glow);
    SKY.uNight.value = 0;
    const sight = this.sight;
    pipeline.haze = DIM / sight / FOG;
    pipeline.fogFar = Math.min(FAR[1], sight * FAR[0]);
    SEEN.uSeeFar.value = pipeline.fogFar;
    pipeline.fogFloor = camera.position.y;
    pipeline.fogThin = 1e-5; // as thick at any height: there is no sky for it to thin out into
    DECK.uDeckCover.value = 0;
    UNDER.uUnder.value = 0;
    // (the picture takes whatever is in the last hundred-thousandth of its
    // depth for sky, and leaves the air off it: keep the far plane well past
    // the last thing drawn)
    camera.far = 1 / (1 / pipeline.fogFar - SKY_DEPTH);
    camera.updateProjectionMatrix();
    return now.lit;
  }

  // ...and hand them back.
  giveBack(pipeline, camera) {
    const kept = this._kept;
    SKY.uSunDir.value.copy(kept.sun);
    SKY.uZenith.value.copy(kept.zen);
    SKY.uHorizon.value.copy(kept.hor);
    SKY.uSunColor.value.copy(kept.col);
    SKY.uNight.value = kept.night;
    pipeline.haze = kept.haze;
    pipeline.fogFar = kept.fogFar;
    pipeline.fogFloor = kept.fogFloor;
    pipeline.fogThin = kept.fogThin;
    DECK.uDeckCover.value = kept.deck;
    UNDER.uUnder.value = kept.under;
    camera.far = kept.far;
    camera.updateProjectionMatrix();
  }
}
