// The cow: 60 to 80 pixels tall and in fog whenever it is on screen, so a
// body, legs, head, ears and tail are enough, with black patches from
// thresholded noise (PLAN.md 5.10). It flicks its tail and turns its head;
// in the beam (ufo/lift.js moves it) it turns slowly and its legs hang.
import { Group, Mesh, SphereGeometry, CylinderGeometry, BoxGeometry, ConeGeometry, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { positionLocal, smoothstep, mix, vec3, float, mx_noise_float, uniform } from 'three/tsl';
import { COW } from '../set/layout.js';
import { noise1 } from '../noise1.js';

export function createCow() {
  const g = new Group();   // placed by ufo/lift.js
  const body = new Group();
  g.add(body);
  const hide = new MeshStandardNodeMaterial({ roughness: 0.8 });
  const n = mx_noise_float(positionLocal.mul(vec3(1.6, 1.8, 1.6)).add(vec3(3.1, 0, 0)));
  const black = smoothstep(0.05, 0.12, n);
  hide.colorNode = mix(vec3(0.62, 0.6, 0.56), vec3(0.025, 0.022, 0.02), black);
  const dark = new MeshStandardNodeMaterial({ color: new Color(0.03, 0.025, 0.02), roughness: 0.8 });
  const pink = new MeshStandardNodeMaterial({ color: new Color(0.45, 0.3, 0.28), roughness: 0.7 });
  const part = (geo, m, x, y, z) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  };
  // Facing +X. Torso: a long rounded body.
  const torso = part(new SphereGeometry(0.5, 16, 12), hide, 0, 1.08, 0);
  torso.scale.set(1.45, 0.82, 0.78);
  // Legs, kept so they can hang.
  const legs = [];
  for (const [x, z] of [[0.52, 0.2], [0.52, -0.2], [-0.52, 0.2], [-0.52, -0.2]]) {
    const pivot = new Group();
    pivot.position.set(x, 0.82, z);
    const leg = new Mesh(new CylinderGeometry(0.075, 0.06, 0.8, 8), hide);
    leg.position.y = -0.4;
    leg.castShadow = true;
    const hoof = new Mesh(new CylinderGeometry(0.07, 0.075, 0.07, 8), dark);
    hoof.position.y = -0.79;
    pivot.add(leg, hoof);
    body.add(pivot);
    legs.push(pivot);
  }
  // Udder.
  part(new SphereGeometry(0.12, 10, 8), pink, -0.35, 0.72, 0);
  // Neck and head, which turns.
  const neck = new Group();
  neck.position.set(0.66, 1.2, 0);
  body.add(neck);
  const headMat = hide;
  const head = new Mesh(new BoxGeometry(0.46, 0.26, 0.24), headMat);
  head.position.set(0.3, -0.06, 0);
  head.rotation.z = -0.45;
  const muzzle = new Mesh(new BoxGeometry(0.16, 0.16, 0.22), pink);
  muzzle.position.set(0.5, -0.17, 0);
  const ears = [-1, 1].map((s) => {
    const e = new Mesh(new BoxGeometry(0.06, 0.03, 0.16), headMat);
    e.position.set(0.18, 0.05, s * 0.17);
    return e;
  });
  const horns = [-1, 1].map((s) => {
    const h = new Mesh(new ConeGeometry(0.025, 0.12, 6), new MeshStandardNodeMaterial({ color: new Color(0.6, 0.55, 0.45), roughness: 0.5 }));
    h.position.set(0.15, 0.13, s * 0.09);
    return h;
  });
  neck.add(head, muzzle, ...ears, ...horns);
  neck.traverse((o) => { o.castShadow = true; });
  // Tail, which flicks.
  const tail = new Group();
  tail.position.set(-0.72, 1.22, 0);
  const tailMesh = new Mesh(new CylinderGeometry(0.018, 0.012, 0.75, 5), hide);
  tailMesh.position.y = -0.37;
  const tuft = new Mesh(new SphereGeometry(0.05, 6, 5), dark);
  tuft.position.y = -0.76;
  tail.add(tailMesh, tuft);
  body.add(tail);

  // Its height in metres comes out at about COW.shoulder at the back.
  return {
    object: g,
    // hang: 0 standing .. 1 legs hanging in the beam
    pose(t, hang) {
      tail.rotation.x = 0.25 * Math.sin(t * 2.1) * (0.5 + 0.5 * noise1(t * 0.7, 4));
      tail.rotation.z = 0.15 + 0.1 * noise1(t * 1.3, 5);
      neck.rotation.y = 0.5 * noise1(t * 0.25, 6) + hang * 0.3 * Math.sin(t * 1.4);
      neck.rotation.z = -0.15 + 0.1 * noise1(t * 0.4, 7) + hang * 0.3;
      for (const [i, leg] of legs.entries()) {
        leg.rotation.z = hang * (0.25 + 0.15 * Math.sin(t * 2 + i));
        leg.rotation.x = hang * 0.15 * Math.sin(t * 1.7 + i * 1.3);
      }
    },
  };
}
