// The canopy over the pumps: a concrete slab on two columns, its underside
// in panels, a fascia with the brand faded on it, twin-tube lights (one
// hanging crooked), and the two islands with their columns (white paint
// peeling off, green at the foot, a Y bracket at the top). The pumps and
// drums on the islands are props/.
import { Group, Mesh, BoxGeometry, CylinderGeometry, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { vec3, float, texture, uv, positionWorld, smoothstep, fract, abs, min, mix } from 'three/tsl';
import { CANOPY, ISLANDS, ISLAND } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { signTexture } from './signs.js';

const TUBE_GLOW = 9;     // emissive strength of a lit tube (blooms above 1)

export function createCanopy() {
  const group = new Group();
  const C = CANOPY;
  const box = (x0, y0, z0, x1, y1, z1, m) => {
    const mesh = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // The underside in 2 m panels with dark joints and water stains.
  const under = weathered({ colour: '#5e5a52', scale: 1.1, vary: 0.85, streaks: 0, dirt: 0, rough: 0.9, wet: 0, bump: 0.6 });
  const joint = smoothstep(0.47, 0.5, abs(fract(positionWorld.x.div(2)).sub(0.5))).max(smoothstep(0.47, 0.5, abs(fract(positionWorld.z.div(2)).sub(0.5))));
  under.colorNode = under.colorNode.mul(float(1).sub(joint.mul(0.5)));
  const top = weathered({ colour: '#4a4842', scale: 2, rough: 0.85, wet: 0.6 });
  const fasciaTex = signTexture('fascia', 1024, 64);
  const fascia = weathered({ colour: '#ffffff', scale: 1.2, streaks: 0.7, dirt: 0, rough: 0.7, wet: 0.2, rust: 0.15,
    map: texture(fasciaTex, uv()) });
  const fasciaPlain = weathered({ colour: '#4a4a44', scale: 1.2, streaks: 0.7, dirt: 0, rough: 0.7, wet: 0.2, rust: 0.15 });
  // The slab: underside material below, the rest above.
  const slab = new Mesh(new BoxGeometry(C.x1 - C.x0, C.thick, C.z1 - C.z0), [fasciaPlain, fasciaPlain, top, under, fasciaPlain, fasciaPlain]);
  slab.position.set((C.x0 + C.x1) / 2, C.under + C.thick / 2, (C.z0 + C.z1) / 2);
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);
  // Fascia boards on the west and the front, with the lettering.
  const west = new Mesh(new BoxGeometry(0.06, C.thick + 0.1, C.z1 - C.z0), [fascia, fascia, fasciaPlain, fasciaPlain, fasciaPlain, fasciaPlain]);
  west.position.set(C.x0 - 0.03, C.under + C.thick / 2, (C.z0 + C.z1) / 2);
  const front = new Mesh(new BoxGeometry(C.x1 - C.x0, C.thick + 0.1, 0.06), [fasciaPlain, fasciaPlain, fasciaPlain, fasciaPlain, fascia, fascia]);
  front.position.set((C.x0 + C.x1) / 2, C.under + C.thick / 2, C.z1 + 0.03);
  group.add(west, front);

  // The tubes: a housing and two glowing tubes each.
  const housing = weathered({ colour: '#9a9a92', rust: 0.3, rough: 0.5, metal: 0.3, bump: 0 });
  const tubeMat = new MeshStandardNodeMaterial({ color: new Color(0.8, 0.85, 0.8), roughness: 0.3 });
  tubeMat.emissiveNode = vec3(0.92, 1.0, 0.94).mul(TUBE_GLOW);
  for (const [i, [x, z, turn]] of C.tubes.entries()) {
    const fixture = new Group();
    const crooked = i === C.crooked;
    fixture.add(new Mesh(new BoxGeometry(1.3, 0.05, 0.16), housing));
    for (const dz of [-0.04, 0.04]) {
      const t = new Mesh(new CylinderGeometry(0.03, 0.03, 1.2, 8), tubeMat);
      t.rotation.z = Math.PI / 2;
      t.position.set(0, -0.05, dz);
      fixture.add(t);
    }
    fixture.position.set(x, C.under - (crooked ? 0.32 : 0.03), z);
    fixture.rotation.y = turn;
    if (crooked) {
      fixture.rotation.x = 0.5;
      fixture.rotation.z = 0.25;
    }
    group.add(fixture);
  }

  // Islands and columns.
  const kerb = weathered({ colour: '#8a857a', scale: 0.8, streaks: 0, dirt: 0.8, dirtHeight: 0.2, rough: 0.8, wet: 0.4 });
  const column = weathered({ colour: '#d8d2c2', under: '#4d4a40', scale: 0.7, peel: 0.32, rust: 0.12, streaks: 0.5, dirt: 0.4,
    band: { colour: '#1f3326', height: 0.9 }, rough: 0.6, wet: 0.15, bump: 1.5 });
  const bracket = weathered({ colour: '#222420', rust: 0.4, rough: 0.6, metal: 0.4 });
  for (const is of ISLANDS) {
    box(is.x - ISLAND.len / 2, 0, is.z - ISLAND.wid / 2, is.x + ISLAND.len / 2, ISLAND.h, is.z + ISLAND.wid / 2, kerb);
    const c = ISLAND.column / 2;
    box(is.x - c, ISLAND.h, is.z - c, is.x + c, C.under, is.z + c, column);
    // The Y bracket: two struts from the column's top out to the slab.
    for (const s of [-1, 1]) {
      const strut = new Mesh(new BoxGeometry(0.08, 1.0, 0.12), bracket);
      strut.position.set(is.x + s * 0.32, C.under - 0.38, is.z);
      strut.rotation.z = -s * 0.75;
      strut.castShadow = true;
      group.add(strut);
    }
  }
  return { object: group, update() {} };
}
