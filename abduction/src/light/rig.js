// Every light in the scene, and which are real just now (PLAN.md 5.2).
//
// The scene is lit only by what you can see: lamps, tubes, a door lamp, the
// shop, a car, lightning, the saucer. The set of lights never changes size
// (one that is not needed has its intensity at 0), so materials are compiled
// once. Shadows from three lights at most: the nearest street lamp, the
// canopy and the beam.
//
// Of the row of street lamps, only the three nearest the camera are real
// lights; the rest are a glowing head, a cone in the fog (weather/fog.js)
// and a pool painted on the ground (set/ground.js), fed from `farLamps`.
import {
  Group, SpotLight, PointLight, RectAreaLight, DirectionalLight, HemisphereLight, Color, Vector3, Vector4, Object3D,
  RectAreaLightNode,
} from 'three/webgpu';
import { uniformArray, uniform } from 'three/tsl';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import * as L from '../set/layout.js';

RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());

// Colours and strengths. Intensities are candela (spot, point), nits (area)
// and lux (directional, hemisphere); exposure is set in post/grade.js.
export const LIGHTS = {
  lamp: { colour: new Color('#ffdcc0'), cd: 380, angle: 1.31, penumbra: 0.55, real: 3 },
  tube: { colour: new Color('#e4efe6'), nits: 70, w: 1.2, h: 0.15 },
  canopySpot: { colour: new Color('#e4efe6'), cd: 260, angle: 1.2, penumbra: 0.9 },
  warm: { colour: new Color('#ffc890'), cd: 9, reach: 7 },
  pendant: { colour: new Color('#ffb070'), cd: 22, reach: 6 },
  shopTube: { colour: new Color('#fff2e0'), cd: 26, reach: 7 },
  headlight: { colour: new Color('#fff4e0'), cd: 9000, angle: 0.3, penumbra: 0.5 },
  lightning: { colour: new Color('#cfd8ff'), lux: 6 },
  ufo: { colour: new Color('#dfeaff'), cd: 250, reach: 40 },
  beam: { colour: new Color('#e8f2ff'), cd: 2500, angle: 0.16, penumbra: 0.6 },
  sky: { colour: new Color('#3a3842'), ground: new Color('#1a1714'), lux: 0.9 },
  bounce: { colour: new Color('#d8d6cc'), nits: 0.22 },
};

// How strongly each light lights the fog, per candela (weather/fog.js).
export const SCATTER = 0.00068;

export const FAR_LAMPS = 16;

export function createRig({ scene, camera, scatterLights, has }) {
  const group = new Group();
  const shadows = has('shadows');

  const spot = (spec, castShadow = false, size = 1024) => {
    const s = new SpotLight(spec.colour, spec.cd, 0, spec.angle, spec.penumbra, 2);
    s.userData.cd = spec.cd;
    s.castShadow = castShadow && shadows;
    if (s.castShadow) {
      s.shadow.mapSize.set(size, size);
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.02;
      s.shadow.camera.near = 0.3;
      s.shadow.camera.far = 60;
    }
    group.add(s, s.target);
    return s;
  };
  const point = (spec, x, y, z) => {
    const p = new PointLight(spec.colour, spec.cd, spec.reach, 2);
    p.position.set(x, y, z);
    group.add(p);
    return p;
  };

  // Street lamps: three real ones that follow the camera.
  const heads = Array.from({ length: L.LAMPS.count }, (_, k) => new Vector3(L.lampX(k), L.LAMPS.pole - 0.12, L.LAMPS.z + L.LAMPS.arm));
  const lampHead = (k) => heads[k];
  const dist = new Float32Array(L.LAMPS.count);
  const lamps = [];
  for (let i = 0; i < LIGHTS.lamp.real; i++) lamps.push(spot(LIGHTS.lamp, i === 0, 1024));

  // The canopy: an area light per tube, and one wide spot for its shadows.
  const tubes = L.CANOPY.tubes.map(([x, z, turn], i) => {
    const a = new RectAreaLight(LIGHTS.tube.colour, LIGHTS.tube.nits, LIGHTS.tube.w, LIGHTS.tube.h * 2);
    a.position.set(x, L.CANOPY.under - (i === L.CANOPY.crooked ? 0.35 : 0.06), z);
    a.lookAt(x, 0, z);
    a.rotateZ(turn);
    group.add(a);
    return a;
  });
  const canopySpot = spot(LIGHTS.canopySpot, true, 2048);
  canopySpot.position.set(5.5, L.CANOPY.under - 0.2, 6);
  canopySpot.target.position.set(5.5, 0, 6.2);
  if (canopySpot.castShadow) canopySpot.shadow.camera.far = 12;

  // Warm lamps on the shop's walls.
  const doorLamp = point(LIGHTS.warm, L.SHOP.westLamp.x - 0.45, L.SHOP.westLamp.y - 0.15, L.SHOP.westLamp.z);
  const wallLamp = point(LIGHTS.warm, L.SHOP.wallLamp.x, L.SHOP.wallLamp.y - 0.15, L.SHOP.wallLamp.z + 0.45);

  // The shop's own lights, inside.
  const pendants = [point(LIGHTS.pendant, -0.5, 2.3, -2.2), point(LIGHTS.pendant, 3.4, 2.3, -2.4)];
  const shopTube = point(LIGHTS.shopTube, 1.5, 2.9, -4.5);

  // The car's headlights (one light for the pair), moved by props/sedan.js.
  const headlight = spot(LIGHTS.headlight);
  headlight.intensity = 0;

  // Lightning, from the bolt's side.
  const lightning = new DirectionalLight(LIGHTS.lightning.colour, 0);
  group.add(lightning, lightning.target);

  // Under the saucer, and its beam.
  const ufoLight = point(LIGHTS.ufo, L.UFO.x, 60, L.UFO.z);
  ufoLight.intensity = 0;
  const beam = spot(LIGHTS.beam, true, 1024);
  beam.intensity = 0;
  if (beam.castShadow) { beam.shadow.camera.near = 2; beam.shadow.camera.far = 20; }

  const sky = new HemisphereLight(LIGHTS.sky.colour, LIGHTS.sky.ground, LIGHTS.sky.lux);
  group.add(sky);

  // Light thrown back up off the lit forecourt: what shows the canopy's
  // underside and the columns (there is no bounce light otherwise).
  // An area light facing up, so it lights what is above it and not the ground.
  const bounce = new RectAreaLight(LIGHTS.bounce.colour, LIGHTS.bounce.nits, 15, 11);
  bounce.position.set(5.5, 0.3, 6);
  bounce.lookAt(5.5, 5, 6);
  group.add(bounce);

  // The street lamps not lit for real, for the ground's painted pools.
  const far = Array.from({ length: FAR_LAMPS }, () => new Vector4());
  const farLamps = { pos: uniformArray(far, 'vec4'), count: uniform(0, 'int') };

  const order = Array.from({ length: L.LAMPS.count }, (_, k) => k);
  const _cam = new Vector3();
  const _down = new Vector3(0, -1, 0);
  const _aim = new Vector3();
  const lampAim = new Vector3(0, -1, 0.18).normalize();

  return {
    object: group,
    lights: { bounce, lamps, tubes, canopySpot, doorLamp, wallLamp, pendants, shopTube, headlight, lightning, ufoLight, beam, sky },
    farLamps,
    lampHead,
    update(t) {
      camera.getWorldPosition(_cam);
      for (let k = 0; k < heads.length; k++) dist[k] = heads[k].distanceToSquared(_cam);
      order.sort((a, b) => dist[a] - dist[b]);
      // The nearest three are real; the shadow stays with the nearest.
      for (let i = 0; i < lamps.length; i++) {
        const h = lampHead(order[i]);
        lamps[i].position.copy(h);
        lamps[i].target.position.copy(h).addScaledVector(lampAim, 5);
      }
      let n = 0;
      for (let i = lamps.length; i < order.length && n < FAR_LAMPS; i++) {
        const h = lampHead(order[i]);
        far[n++].set(h.x, h.y, h.z, LIGHTS.lamp.cd);
      }
      farLamps.count.value = n;

      // The fog's light list: the lamps nearest first, then the rest of what glows.
      for (let i = 0; i < 11 && i < order.length; i++) {
        _aim.copy(lampAim);
        scatterLights.add(lampHead(order[i]), LIGHTS.lamp.colour, LIGHTS.lamp.cd * SCATTER, _aim, LIGHTS.lamp.angle * 0.7, 0.9);
      }
      scatterLights.add(canopySpot.position, LIGHTS.tube.colour, 60 * SCATTER, _down, 1.3, 0.8);
      scatterLights.add(doorLamp.position, LIGHTS.warm.colour, LIGHTS.warm.cd * SCATTER * 2.5);
      scatterLights.add(wallLamp.position, LIGHTS.warm.colour, LIGHTS.warm.cd * SCATTER * 2.5);
    },
  };
}
