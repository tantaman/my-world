// The canopy over the pumps: a concrete slab on two columns, its underside
// in panels of stained concrete (the photo's repeat shows, as it does in the
// original's 09-under-canopy), a fascia with the brand faded on it, twin-tube
// lights (one hanging crooked) wired along the ceiling, and the two islands
// with their columns: pale paint flaking off dark metal in the shapes of a
// real wall's flakes, dark green at the foot, a black Y bracket at the top.
// The pumps and drums on the islands are props/.
import { Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { vec2, vec3, float, texture, uv, positionWorld, smoothstep, fract, abs, floor } from 'three/tsl';
import { CANOPY, ISLANDS, ISLAND } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { pbr } from '../materials/textures.js';
import { fbm2 } from '../materials/noise.js';
import { signTexture } from './signs.js';
import { boxMesh, tubeMesh, sagging, shadowed } from './shapes.js';
import { metals } from '../materials/metals.js';

const TUBE_GLOW = 9;        // emissive strength of a lit tube (blooms above 1)
const PANEL = 2.0;          // metres between the ceiling's joints
const JOINT = 0.012;        // half the width of a joint, as a fraction of a panel
const CAMO_CELL = 0.035;    // metres: the step in the edges of the ceiling's pale blotches
const CAMO_SIZE = 0.5;      // metres: the size of the blotches
const CAMO_LIGHT = 1.75;    // how much paler a blotch is than the concrete round it
const COLUMN_FOOT = 1.3;    // metres up the column the dark green reaches
const PLINTH = 0.07;        // the black steel foot of a column, metres

export function createCanopy() {
  const group = new Group();
  const C = CANOPY;
  const box = (x0, y0, z0, x1, y1, z1, m, r = 0) => {
    const mesh = boxMesh(x0, y0, z0, x1, y1, z1, m, r);
    group.add(mesh);
    return mesh;
  };

  // The underside: dark olive concrete in panels with dark joints, pale
  // blotches with the stepped edges of a texture seen too close (the
  // original's ceiling has exactly that look), the damp mottling of the
  // photo, and long darker runs where water has crept along the panels.
  const under = weathered({ colour: '#727367', scale: 3.0, vary: 0.25, streaks: 0, dirt: 0, rough: 0.9, wet: 0, bump: 0.3,
    photo: pbr('worn_mossy_plasterwall', { res: '2k' }), photoScale: 2.6, photoSat: 0.2, photoContrast: 1.1, photoBump: 0.5 });
  const xz = positionWorld.xz;
  const jx = abs(fract(xz.x.div(PANEL)).sub(0.5));
  const jz = abs(fract(xz.y.div(PANEL)).sub(0.5));
  const joint = smoothstep(0.5 - JOINT, 0.5 - JOINT * 0.3, jx).max(smoothstep(0.5 - JOINT, 0.5 - JOINT * 0.3, jz));
  const cell = floor(xz.div(CAMO_CELL)).mul(CAMO_CELL);
  const camo = smoothstep(0.02, 0.1, fbm2(cell, CAMO_SIZE, 4).add(fbm2(xz, 3.0, 2).mul(0.25)));
  const run = smoothstep(0.1, 0.6, fbm2(xz.mul(vec2(0.1, 1.6)), 1.0, 3)).mul(0.45);
  under.colorNode = under.colorNode.mul(camo.mul(CAMO_LIGHT - 1).add(1))
    .mul(float(1).sub(joint.mul(0.75))).mul(float(1).sub(run));

  const top = weathered({ colour: '#4a4842', scale: 2, rough: 0.85, wet: 0.6,
    photo: pbr('dirty_concrete', { res: '2k' }), photoScale: 3, photoContrast: 1.3 });
  const fasciaTex = signTexture('fascia', 1024, 64);
  const fasciaLook = { scale: 1.2, streaks: 0.7, dirt: 0, rough: 0.7, wet: 0.2, rust: 0.12,
    photo: pbr('dirty_concrete', { res: '2k' }), photoScale: 2.2, photoContrast: 1.5, photoSat: 0.3 };
  const fascia = weathered({ colour: '#ffffff', map: texture(fasciaTex, uv()), ...fasciaLook });
  const fasciaPlain = weathered({ colour: '#4a4a44', ...fasciaLook });
  // The slab: underside material below, the rest above.
  const slab = shadowed(new Mesh(new BoxGeometry(C.x1 - C.x0, C.thick, C.z1 - C.z0), fasciaPlain));
  slab.position.set((C.x0 + C.x1) / 2, C.under + C.thick / 2, (C.z0 + C.z1) / 2);
  const ceiling = new Mesh(new PlaneGeometry(C.x1 - C.x0, C.z1 - C.z0), under);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((C.x0 + C.x1) / 2, C.under - 0.002, (C.z0 + C.z1) / 2);
  ceiling.receiveShadow = true;
  const roof = new Mesh(new PlaneGeometry(C.x1 - C.x0, C.z1 - C.z0), top);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set((C.x0 + C.x1) / 2, C.under + C.thick + 0.002, (C.z0 + C.z1) / 2);
  group.add(slab, ceiling, roof);
  // Fascia boards on the west and the front, with the lettering, and a lip
  // along their top edge that throws a line of shadow.
  const west = new Mesh(new PlaneGeometry(C.z1 - C.z0, C.thick + 0.1), fascia);
  west.rotation.y = -Math.PI / 2;
  west.position.set(C.x0 - 0.004, C.under + C.thick / 2, (C.z0 + C.z1) / 2);
  const front = new Mesh(new PlaneGeometry(C.x1 - C.x0, C.thick + 0.1), fascia);
  front.position.set((C.x0 + C.x1) / 2, C.under + C.thick / 2, C.z1 + 0.004);
  group.add(west, front);
  const lipY = C.under + C.thick + 0.05;
  box(C.x0 - 0.05, lipY - 0.07, C.z1 - 0.02, C.x1 + 0.05, lipY + 0.02, C.z1 + 0.07, fasciaPlain, 0.02);
  box(C.x0 - 0.07, lipY - 0.07, C.z0, C.x0 + 0.02, lipY + 0.02, C.z1 + 0.07, fasciaPlain, 0.02);
  box(C.x1 - 0.02, lipY - 0.07, C.z0, C.x1 + 0.07, lipY + 0.02, C.z1 + 0.07, fasciaPlain, 0.02);
  // A drip edge under the fascia: a thin downstand inside the slab's edge.
  box(C.x0, C.under - 0.05, C.z1 - 0.08, C.x1, C.under, C.z1, fasciaPlain);
  box(C.x0, C.under - 0.05, C.z0, C.x0 + 0.08, C.under, C.z1, fasciaPlain);

  // The tubes: a housing with end caps and two glowing tubes each, and the
  // cable each hangs from, run along the ceiling to the canopy's edge.
  const housing = weathered({ colour: '#9a9a92', rust: 0.3, rough: 0.5, metal: 0.3, bump: 0,
    photo: pbr('rusty_metal_02'), photoScale: 0.6, photoSat: 0.6 });
  const cable = metals().cable;
  const tubeMat = new MeshStandardNodeMaterial({ color: new Color(0.8, 0.85, 0.8), roughness: 0.3 });
  tubeMat.emissiveNode = vec3(0.92, 1.0, 0.94).mul(TUBE_GLOW);
  for (const [i, [x, z, turn]] of C.tubes.entries()) {
    const fixture = new Group();
    const crooked = i === C.crooked;
    fixture.add(shadowed(new Mesh(new BoxGeometry(1.3, 0.05, 0.16), housing)));
    for (const s of [-1, 1]) {
      const cap = shadowed(new Mesh(new BoxGeometry(0.04, 0.07, 0.17), housing));
      cap.position.set(s * 0.63, -0.04, 0);
      fixture.add(cap);
    }
    for (const dz of [-0.04, 0.04]) {
      const t = new Mesh(new CylinderGeometry(0.016, 0.016, 1.2, 8), tubeMat);
      t.rotation.z = Math.PI / 2;
      t.position.set(0, -0.05, dz);
      fixture.add(t);
    }
    fixture.position.set(x, C.under - (crooked ? 0.32 : 0.03), z);
    fixture.rotation.y = turn;
    if (crooked) {
      fixture.rotation.x = 0.5;
      fixture.rotation.z = 0.25;
      // The chain or cable it hangs by, slack.
      group.add(tubeMesh(sagging([x - 0.5, C.under, z - 0.2], [x, C.under - 0.25, z], 0.05), 0.006, cable));
    }
    group.add(fixture);
    // The cable feeding it, clipped to the ceiling, out to the nearest edge.
    const toFront = C.z1 - z < z - C.z0;
    const edgeZ = toFront ? C.z1 - 0.15 : C.z0 + 0.3;
    const y = C.under - 0.015;
    group.add(tubeMesh([[x + 0.66, y, z], [x + 0.8, y, z + (toFront ? 0.3 : -0.3)], [x + 0.85, y, edgeZ]], 0.008, cable, { segments: 16, sides: 4 }));
  }

  // Islands and columns.
  const kerb = weathered({ colour: '#85827a', scale: 0.8, streaks: 0, dirt: 0.8, dirtHeight: 0.2, rough: 0.8, wet: 0.4,
    photo: pbr('dirty_concrete', { res: '2k' }), photoScale: 1.6, photoContrast: 1.4, photoSat: 0.3 });
  const column = weathered({ colour: '#c9ccb6', under: '#2b2721', scale: 0.7, peel: 0.13, rust: 0.12, streaks: 0.55, dirt: 0.3,
    band: { colour: '#1f4034', height: COLUMN_FOOT }, rough: 0.6, wet: 0.1, bump: 1.5,
    photo: pbr('worn_plaster_wall'), photoScale: 1.1, photoSat: 0.15, photoContrast: 1.2, photoPeel: 1, photoBump: 0.5 });
  const steel = metals().black;
  for (const is of ISLANDS) {
    box(is.x - ISLAND.len / 2, 0, is.z - ISLAND.wid / 2, is.x + ISLAND.len / 2, ISLAND.h, is.z + ISLAND.wid / 2, kerb, 0.05);
    const c = ISLAND.column / 2;
    box(is.x - c, ISLAND.h + PLINTH, is.z - c, is.x + c, C.under, is.z + c, column, 0.015);
    box(is.x - c - 0.02, ISLAND.h, is.z - c - 0.02, is.x + c + 0.02, ISLAND.h + PLINTH, is.z + c + 0.02, steel, 0.01);
    // The Y bracket: two flat steel arms from a collar near the column's
    // top, spread across the canopy's depth, up into the slab.
    box(is.x - c - 0.015, C.under - 0.5, is.z - c - 0.015, is.x + c + 0.015, C.under - 0.36, is.z + c + 0.015, steel);
    for (const s of [-1, 1]) {
      const arm = shadowed(new Mesh(new BoxGeometry(0.1, 0.62, 0.07), steel));
      arm.position.set(is.x, C.under - 0.24, is.z + s * 0.33);
      arm.rotation.x = s * 0.72;
      group.add(arm);
    }
  }
  return { object: group, update() {} };
}
