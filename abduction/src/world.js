// Builds the scene: the set, the things in it, the weather, the saucer and
// the lights, and updates them all from t. (?blockout shows milestone 0's
// grey boxes instead of the set.)
import { Color, Group } from 'three/webgpu';
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
import { createSedan } from './props/sedan.js';
import { createTrees } from './plants/tree.js';
import { createGrass } from './plants/grass.js';
import { createUfo } from './ufo/index.js';
import { emi, ramp, T } from './timeline.js';
import { createSky } from './weather/sky.js';
import { createLightning } from './weather/lightning.js';
import { createRain } from './weather/rain.js';
import { fogUniforms, fogFactor, FOG } from './weather/fog.js';
import { createEnvironment } from './light/environment.js';

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
  const environment = createEnvironment({ ...ctx, sky });
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

  const fogColour = FOG.colour.clone();
  const flashColour = new Color(0.25, 0.27, 0.34);

  return {
    rig,
    update(t) {
      scatterLights.begin();
      lightning.update(t, camera);
      const f = lightning.state.flash;
      sky.update(t, { flash: f, boltDir: lightning.state.boltDir });
      environment.update(f);
      fogUniforms.colour.value.copy(fogColour).lerp(flashColour, f * 0.1);
      rig.update(t);
      for (const p of parts) p.update(t);
      // The saucer's lamps light the field while it is over it.
      if (ufo) rig.ufoOver(ufo.state.position, ufo.state.visible ? ramp(t, T.ufoArrive + 2, T.ufoStop) * (1 - ramp(t, T.ufoTip, T.ufoTip + 1.5)) : 0);
      // A stronger gust in the trees while the saucer is overhead.
      if (trees) trees.update(t, emi(t));
      scatterLights.end();
      if (rain) rain.update(t, camera, f);
    },
  };
}
