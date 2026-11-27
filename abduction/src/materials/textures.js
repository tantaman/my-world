// Photo-scanned surfaces (CC0, from Poly Haven), for what code alone draws
// too clean: concrete, render, peeling paint, rust, asphalt, wood, bark.
//
//   const t = pbr('concrete_wall_008');            // 1k
//   const t = pbr('rusty_metal_02', { res: '2k' }); // when it fills the frame
//   t.map, t.normal, t.arm                          // Textures, wrapping
//
// `arm` is Poly Haven's packed map: ambient occlusion in red, roughness in
// green, metalness in blue (three's own convention for aoMap, roughnessMap
// and metalnessMap). `map` is sRGB, the others linear.
//
// The files are not committed (they are someone else's, if freely given):
// `node abduction/tools/assets.mjs` finds every pbr('id') call under src/
// and fetches what is missing into public/tex/<id>/<res>/. A texture that has
// not been fetched loads as a flat grey, and says so in the console.
//
// Every texture asked for is counted, and texturesReady() resolves once all
// of them have loaded (or failed), so a still is never taken half-dressed.
import { TextureLoader, SRGBColorSpace, NoColorSpace, RepeatWrapping, ClampToEdgeWrapping, LinearMipmapLinearFilter } from 'three/webgpu';

const loader = new TextureLoader();
const cache = new Map();
const pending = [];

// Anisotropic filtering, for floors and ceilings seen at a grazing angle.
const ANISOTROPY = 8;

function load(url, srgb) {
  const t = loader.load(url, undefined, undefined, () => console.warn(`texture missing: ${url} (node abduction/tools/assets.mjs)`));
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = ANISOTROPY;
  t.minFilter = LinearMipmapLinearFilter;
  pending.push(new Promise((done) => {
    const check = () => (t.image && (t.image.width || t.image.naturalWidth) ? done() : setTimeout(check, 30));
    check();
    setTimeout(done, 15000);
  }));
  return t;
}

export function pbr(id, { res = '1k' } = {}) {
  const key = `${id}/${res}`;
  if (!cache.has(key)) {
    const base = `./tex/${id}/${res}/`;
    cache.set(key, {
      map: load(`${base}diff.jpg`, true),
      normal: load(`${base}nor_gl.jpg`, false),
      arm: load(`${base}arm.jpg`, false),
    });
  }
  return cache.get(key);
}

// A sky: the upper half of a CC0 HDRI's tonemapped panorama, zenith at the
// top row and the horizon at the bottom, wrapping round (tools/assets.mjs).
export function skyPanorama(id) {
  const key = `sky/${id}`;
  if (!cache.has(key)) {
    const t = load(`./tex/sky/${id}.jpg`, true);
    t.wrapT = ClampToEdgeWrapping;
    t.anisotropy = 1;
    cache.set(key, t);
  }
  return cache.get(key);
}

// Resolves when every texture asked for so far has loaded (or given up).
export function texturesReady() {
  return Promise.all(pending);
}
