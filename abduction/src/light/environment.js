// The night sky as light: our own sky dome (weather/sky.js) drawn once into a
// small cube and set as the scene's environment. It is what gives the
// original its floor of light (its darkest wet concrete is about 23 of 255,
// not black), a faint cool fill on everything the lamps miss, and the sky to
// reflect in every wet or metal surface that is not the flat ground (the
// ground has its own mirror). A lightning strike brightens it.
import { Scene, Mesh, CubeCamera, CubeRenderTarget, HalfFloatType, LinearMipmapLinearFilter } from 'three/webgpu';

export const ENVIRONMENT = {
  size: 128,          // pixels a cube face
  strength: 0.75,     // scene.environmentIntensity at rest
  flash: 0.3,         // added at the peak of a strike (more greys the whole ground; the original's stays dark)
};

export function createEnvironment({ renderer, scene, sky }) {
  const target = new CubeRenderTarget(ENVIRONMENT.size, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
  const cubeCamera = new CubeCamera(1, 4000, target);
  const own = new Scene();
  // The same dome and material, centred on the cube camera.
  const dome = new Mesh(sky.object.geometry, sky.object.material);
  dome.frustumCulled = false;
  own.add(dome, cubeCamera);
  scene.environment = target.texture;
  scene.environmentIntensity = ENVIRONMENT.strength;
  let drawn = false;

  return {
    // Draws the cube the first time it is needed (after the sky's photograph has loaded).
    update(flash) {
      if (!drawn) { cubeCamera.update(renderer, own); drawn = true; }
      scene.environmentIntensity = ENVIRONMENT.strength + ENVIRONMENT.flash * flash;
    },
  };
}
