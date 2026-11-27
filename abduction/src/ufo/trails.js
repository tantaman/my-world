// The saucer's trails (PLAN.md 5.11, 12 and 17), as the original draws
// them at 48 to 50 s and 60.6 to 64 s: not lightning but bundles of fine
// blue-white strands, like combed hair of light, that wrap round the rim and
// stream out behind it, splaying apart and fading toward their ends, with a
// spray of sparks along their outer side.
//
// Each strand is where a point near the rim has been over the last half
// second: the flight evaluated at earlier times (flight.js), with the point
// running round the rim at the swirl's rate. So hovering, a strand is an arc
// hugging the rim (the second before it leaves); moving, the arcs are drawn
// out behind it into curls. A bundle is many strands from one point, each
// started a little apart and drifting further apart as it ages; the two
// bundles are opposite, set so that as it leaves they are on its two sides. Strands are
// ribbons facing the camera; sparks are small camera-facing quads, each born
// at a point on a fixed grid of times and flying off from where it was
// born. All of it from t alone: no state, the same frame every time.
import {
  Group, Mesh, BufferGeometry, BufferAttribute, MeshBasicNodeMaterial, AdditiveBlending, Vector3, Quaternion,
  DynamicDrawUsage, DoubleSide,
} from 'three/webgpu';
import { attribute, vec3, float, uv, abs, max, length, pow } from 'three/tsl';
import { flightAt, createFlightState, swirlAt, trailsAt, SWIRL_DONE, SPIN_RATE, LEAVE_ANGLE } from './flight.js';
import { SAUCER } from './saucer.js';

const EMITTERS = 2;              // points round the rim the bundles come from, opposite each other
const STRANDS = 18;              // strands in a bundle
const SAMPLES = 48;              // points along a strand
const HISTORY = 0.55;            // seconds of flight a strand reaches back over
const WIDTH = 0.024;             // metres: half a strand's width where it leaves the rim
const WIDEN = 1.6;               // how much wider (fraction) a strand gets each second it ages
const GLOW = 6.5;               // brightness of a strand's core (linear, bloom from 1)
const COLOUR = [0.66, 0.82, 1.0];
// Where a bundle's strands start, apart from each other: metres out from the
// rim, metres up and down, radians round.
const START = { out: [-0.45, 0.3], up: 0.28, round: 0.3 };
const DRIFT = [0.8, 3.2];        // metres a second each strand drifts from the others as it ages
const WAVE = { metres: 0.45, hz: [1.2, 3.0] };   // the slow wave along a strand as it ages
const SPARK = { rate: 110, life: 0.7, speed: [0.5, 2.0], size: [0.02, 0.045], glow: 9 };

// A small integer hash to 0..1, for the sparks' fixed randomness.
function hash(a, b = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function ribbonGeometry(count, perStrand) {
  const n = count * perStrand * 2;
  const geo = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage);
  const fade = new BufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
  const uvs = new Float32Array(n * 2);
  const index = [];
  for (let s = 0; s < count; s++) {
    for (let i = 0; i < perStrand; i++) {
      const v = (s * perStrand + i) * 2;
      uvs.set([i / (perStrand - 1), 0, i / (perStrand - 1), 1], v * 2);
      if (i < perStrand - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('fade', fade);
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(index);
  return geo;
}

function quadGeometry(count) {
  const geo = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(count * 4 * 3), 3).setUsage(DynamicDrawUsage);
  const fade = new BufferAttribute(new Float32Array(count * 4), 1).setUsage(DynamicDrawUsage);
  const uvs = new Float32Array(count * 8);
  const index = [];
  for (let q = 0; q < count; q++) {
    uvs.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
    const v = q * 4;
    index.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('fade', fade);
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(index);
  return geo;
}

function additive() {
  return new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide });
}

export function createTrails({ camera }) {
  const group = new Group();
  const strandCount = EMITTERS * STRANDS;
  const ribbons = ribbonGeometry(strandCount, SAMPLES);
  const strandMat = additive();
  // A bright core with soft shoulders across the ribbon.
  const across = abs(uv().y.sub(0.5)).mul(2);
  strandMat.colorNode = vec3(...COLOUR).mul(attribute('fade', 'float')).mul(pow(float(1).sub(across), 2.2)).mul(GLOW);
  const strandMesh = new Mesh(ribbons, strandMat);
  strandMesh.frustumCulled = false;
  strandMesh.renderOrder = 6;
  strandMesh.layers.set(1);

  const sparkCount = EMITTERS * Math.ceil(SPARK.rate * SPARK.life);
  const sparks = quadGeometry(sparkCount);
  const sparkMat = additive();
  const r = length(uv().sub(0.5)).mul(2);
  sparkMat.colorNode = vec3(0.8, 0.9, 1.0).mul(attribute('fade', 'float')).mul(pow(max(float(1).sub(r), 0), 1.6)).mul(SPARK.glow);
  const sparkMesh = new Mesh(sparks, sparkMat);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 6;
  sparkMesh.layers.set(1);
  group.add(strandMesh, sparkMesh);

  // Each strand's own way of starting and spreading. The bundles' points
  // are set so that when the swirl stops as it leaves, they are on its two
  // sides, square to the way it goes.
  const base = LEAVE_ANGLE + Math.PI / 2 - swirlAt(SWIRL_DONE);
  const strands = [];
  for (let e = 0; e < EMITTERS; e++) {
    for (let k = 0; k < STRANDS; k++) {
      const h = (n) => hash(e * 131 + k * 7 + 1, n);
      const dir = new Vector3(h(1) * 2 - 1, h(2) * 2 - 1, h(3) * 2 - 1).normalize();
      strands.push({
        angle: base + (e / EMITTERS) * Math.PI * 2 + (h(4) * 2 - 1) * START.round,
        out: START.out[0] + h(5) * (START.out[1] - START.out[0]),
        up: (h(6) * 2 - 1) * START.up,
        dir,
        drift: DRIFT[0] + h(7) * (DRIFT[1] - DRIFT[0]),
        waveHz: WAVE.hz[0] + h(8) * (WAVE.hz[1] - WAVE.hz[0]),
        wavePhase: h(9) * Math.PI * 2,
        bright: 0.3 + 0.7 * h(10) ** 0.7,
        width: 0.6 + h(11) * 0.8,
      });
    }
  }

  // The flight at each sample's time, filled once a frame and shared by every strand.
  const state = createFlightState();
  const at = Array.from({ length: SAMPLES }, () => ({ p: new Vector3(), q: new Quaternion(), swirl: 0, level: 0 }));
  const pts = Array.from({ length: SAMPLES }, () => new Vector3());
  const _local = new Vector3();
  const _toCam = new Vector3();
  const _tangent = new Vector3();
  const _side = new Vector3();
  const _right = new Vector3();
  const _up = new Vector3();
  const _q = new Quaternion();
  const _v = new Vector3();
  const _perp = new Vector3();
  const dt = HISTORY / (SAMPLES - 1);

  // Where the rim point at `angle` (and offsets) is at a time whose flight is in st/q/swirl.
  // The angle is in the world's frame before the tilt: the hull's own spin
  // (applied first, flight.js) is taken back out.
  const rimPoint = (out, p, q, swirl, s, time) => {
    const a = s.angle + swirl + SPIN_RATE * time;   // three turns a point at angle a about Y by θ to a - θ
    const rr = SAUCER.radius + s.out;
    _local.set(Math.cos(a) * rr, SAUCER.rimY + s.up, Math.sin(a) * rr).applyQuaternion(q);
    return out.copy(p).add(_local);
  };

  return {
    object: group,
    update(t) {
      let any = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const ti = t - i * dt;
        const a = at[i];
        flightAt(ti, state);
        a.p.copy(state.position);
        a.q.setFromEuler(state.rotation);
        a.swirl = swirlAt(ti);
        a.level = state.visible ? trailsAt(ti) : 0;
        any += a.level;
      }
      // Sparks live a little longer than the strands reach.
      for (let back = HISTORY; back <= SPARK.life; back += 0.1) any += trailsAt(t - back);
      group.visible = any > 0;
      if (!any) return;

      // The strands.
      const pos = ribbons.attributes.position.array;
      const fade = ribbons.attributes.fade.array;
      for (let s = 0; s < strands.length; s++) {
        const st = strands[s];
        for (let i = 0; i < SAMPLES; i++) {
          const a = at[i];
          const age = i * dt;
          const pt = rimPoint(pts[i], a.p, a.q, a.swirl, st, t - i * dt);
          // Drifting apart, with a slow wave, as it ages.
          pt.addScaledVector(st.dir, st.drift * age * age * 1.4);
          _perp.set(-st.dir.z, st.dir.x, st.dir.y);
          pt.addScaledVector(_perp, WAVE.metres * Math.sin(age * st.waveHz * Math.PI * 2 + st.wavePhase) * (age / HISTORY));
        }
        for (let i = 0; i < SAMPLES; i++) {
          const a = at[i];
          const age = i * dt;
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(SAMPLES - 1, i + 1)];
          _tangent.subVectors(prev, next);
          if (_tangent.lengthSq() < 1e-10) _tangent.set(0, 1, 0);
          _tangent.normalize();
          _toCam.subVectors(camera.position, pts[i]).normalize();
          _side.crossVectors(_tangent, _toCam);
          if (_side.lengthSq() < 1e-10) _side.set(1, 0, 0);
          _side.normalize();
          const w = WIDTH * st.width * (1 + age * WIDEN);
          const v = (s * SAMPLES + i) * 2;
          const p = pts[i];
          pos[v * 3] = p.x - _side.x * w;
          pos[v * 3 + 1] = p.y - _side.y * w;
          pos[v * 3 + 2] = p.z - _side.z * w;
          pos[v * 3 + 3] = p.x + _side.x * w;
          pos[v * 3 + 4] = p.y + _side.y * w;
          pos[v * 3 + 5] = p.z + _side.z * w;
          // Bright where it leaves the rim, fading to its end; eased in at the very start.
          const along = 1 - i / (SAMPLES - 1);
          const f = a.level * st.bright * Math.pow(along, 1.1) * Math.min(1, i / 2 + 0.35);
          fade[v] = f;
          fade[v + 1] = f;
        }
      }
      ribbons.attributes.position.needsUpdate = true;
      ribbons.attributes.fade.needsUpdate = true;

      // The sparks: born on a grid of times at each bundle's point, flying off.
      camera.updateMatrixWorld();
      _right.setFromMatrixColumn(camera.matrixWorld, 0);
      _up.setFromMatrixColumn(camera.matrixWorld, 1);
      const spos = sparks.attributes.position.array;
      const sfade = sparks.attributes.fade.array;
      const per = Math.ceil(SPARK.rate * SPARK.life);
      const newest = Math.floor(t * SPARK.rate);
      for (let e = 0; e < EMITTERS; e++) {
        const st = strands[e * STRANDS];
        for (let j = 0; j < per; j++) {
          const born = newest - j;
          const tb = born / SPARK.rate;
          const age = t - tb;
          const q4 = (e * per + j) * 4;
          let level = 0;
          if (age >= 0 && age < SPARK.life) {
            flightAt(tb, state);
            level = state.visible ? trailsAt(tb) : 0;
          }
          if (level <= 0) {
            for (let c = 0; c < 4; c++) sfade[q4 + c] = 0;
            continue;
          }
          _q.setFromEuler(state.rotation);
          rimPoint(_v, state.position, _q, swirlAt(tb), st, tb);
          // Off in a direction of its own, mostly outward from the rim.
          const id = born * 7 + e;
          _local.set(_v.x - state.position.x, 0, _v.z - state.position.z).normalize();
          _tangent.set(hash(id, 1) * 2 - 1, hash(id, 2) * 2 - 1, hash(id, 3) * 2 - 1).addScaledVector(_local, 0.9).normalize();
          const speed = SPARK.speed[0] + hash(id, 4) * (SPARK.speed[1] - SPARK.speed[0]);
          _v.addScaledVector(_tangent, speed * age);
          _v.y -= 0.6 * age * age;
          const size = SPARK.size[0] + hash(id, 5) * (SPARK.size[1] - SPARK.size[0]);
          const twinkle = 0.55 + 0.45 * hash(id * 2 + 1, Math.floor(t * 24));
          const f = level * Math.pow(1 - age / SPARK.life, 1.3) * twinkle * (hash(id, 6) < 0.7 ? 1 : 0.35);
          for (let c = 0; c < 4; c++) {
            const sx = c === 0 || c === 3 ? -size : size;
            const sy = c < 2 ? -size : size;
            spos[(q4 + c) * 3] = _v.x + _right.x * sx + _up.x * sy;
            spos[(q4 + c) * 3 + 1] = _v.y + _right.y * sx + _up.y * sy;
            spos[(q4 + c) * 3 + 2] = _v.z + _right.z * sx + _up.z * sy;
            sfade[q4 + c] = f;
          }
        }
      }
      sparks.attributes.position.needsUpdate = true;
      sparks.attributes.fade.needsUpdate = true;
    },
  };
}
