// Builds the scene: the set, the things in it, the weather, the saucer and
// the lights, and updates them all from t. (?blockout shows milestone 0's
// grey boxes instead of the set.)
import { Color, Vector3, Group } from 'three/webgpu';
import { fog } from 'three/tsl';
import { createBlockout } from './set/blockout.js';
import { batchStatic } from './set/batch.js';
import { createRig } from './light/rig.js';
import { createGround } from './set/ground.js';
import { createShop } from './set/shop.js';
import { createInterior } from './set/interior.js';
import { createCanopy } from './set/canopy.js';
import { createLamps } from './set/lamps.js';
import { createFence } from './set/fence.js';
import { createSign } from './set/welcome.js';
import { createSmallProps } from './props/small.js';
import { createVan } from './props/van.js';
import { createSedan, carX, CAR } from './props/sedan.js';
import { CANOPY } from './set/layout.js';
import { createTrees } from './plants/tree.js';
import { createGrass } from './plants/grass.js';
import { createUfo } from './ufo/index.js';
import { emi, T } from './timeline.js';
import { createSky } from './weather/sky.js';
import { createLightning } from './weather/lightning.js';
import { createRain } from './weather/rain.js';
import { fogUniforms, fogFactor, FOG } from './weather/fog.js';

export async function buildWorld(ctx) {
  const { scene, camera, scatterLights, has, params } = ctx;
  const parts = [];
  const add = (part) => { if (part.object) scene.add(part.object); parts.push(part); return part; };

  scene.fogNode = fog(fogUniforms.colour, fogFactor());
  scene.background = new Color(0, 0, 0);

  const rig = createRig(ctx);
  scene.add(rig.object);
  const sky = createSky(ctx);
  scene.add(sky.object);
  const lightning = createLightning({ ...ctx, rig });
  scene.add(lightning.object);
  add(createGround({ ...ctx, farLamps: rig.farLamps }));

  let trees = null;
  if (params.blockout) add(createBlockout({ ground: false, light: false }));
  else {
    // What never moves, gathered so it can be merged into a few draws.
    const still = new Group();
    for (const make of [createShop, createInterior, createCanopy, createLamps, createFence, createSign, createSmallProps, createVan]) {
      still.add(make().object);
    }
    if (has('batch')) {
      const b = batchStatic(still);
      console.info(`set: ${b.meshes} meshes merged into ${b.into}`);
    }
    scene.add(still);
    add(createSedan({ ...ctx, rig }));
    if (has('trees')) trees = add(createTrees());
    if (has('grass')) add(createGrass());
  }
  const ufo = params.blockout ? null : add(createUfo({ ...ctx, rig }));

  const rain = has('rain') ? createRain(ctx) : null;
  if (rain) scene.add(rain.object);

  // What the sound needs to know each frame (audio/mix.js).
  const listener = { underCanopy: false, car: null, ufo: null };
  const carRel = { x: 0, z: 0, approach: 0 };
  const ufoRel = { distance: 0, speed: 0 };
  const _fwd = new Vector3();
  const _rel = new Vector3();
  function listen(t) {
    const c = camera.position;
    listener.underCanopy = c.x > CANOPY.x0 && c.x < CANOPY.x1 && c.z > CANOPY.z0 && c.z < CANOPY.z1;
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    _fwd.normalize();
    if (!params.blockout && t > T.carSeen - 3 && t < T.carGone + 2) {
      _rel.set(carX(t), 0.7, CAR.lane).sub(c);
      carRel.z = _rel.dot(_fwd);
      carRel.x = -_rel.x * _fwd.z + _rel.z * _fwd.x;
      carRel.approach = (CAR.speed * _rel.x) / Math.max(1, _rel.length());
      listener.car = carRel;
    } else listener.car = null;
    if (ufo && ufo.state.visible) {
      ufoRel.distance = ufo.state.position.distanceTo(c);
      ufoRel.speed = ufo.state.speed;
      listener.ufo = ufoRel;
    } else listener.ufo = null;
  }

  const fogColour = FOG.colour.clone();
  const flashColour = new Color(0.25, 0.27, 0.34);

  return {
    rig,
    listener,
    update(t) {
      scatterLights.begin();
      lightning.update(t, camera);
      const f = lightning.state.flash;
      sky.update(t, { flash: f, boltDir: lightning.state.boltDir });
      fogUniforms.colour.value.copy(fogColour).lerp(flashColour, f * 0.22);
      rig.update(t);
      for (const p of parts) p.update(t);
      // A stronger gust in the trees while the saucer is overhead.
      if (trees) trees.update(t, emi(t));
      scatterLights.end();
      if (rain) rain.update(t, camera, f);
      listen(t);
    },
  };
}
