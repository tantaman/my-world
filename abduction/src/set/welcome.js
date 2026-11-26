// The welcome sign by the road: an arrow of rusty sheet on two posts,
// "Welcome to Signal Ridge", "KEEP AN EYE ON THE SKY", a little saucer.
import { Group, Mesh, BoxGeometry, PlaneGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, uv, float, step, vec3 } from 'three/tsl';
import { SIGN } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { canvasTexture, DRAW } from './signs.js';

export function createSign() {
  const g = new Group();
  const tex = canvasTexture(1024, 384, DRAW.welcome);
  const t = texture(tex, uv());
  const face = weathered({ colour: '#ffffff', map: t, rust: 0.35, streaks: 0.5, dirt: 0.3, rough: 0.6, wet: 0.3, scale: 0.7,
    emissive: t.rgb.mul(vec3(0.16, 0.12, 0.09)) });
  // The arrow's outline is the texture's alpha: black outside the shape.
  face.alphaTest = 0.5;
  face.opacityNode = step(0.05, t.r.add(t.g));
  face.side = 2;
  const board = new Mesh(new PlaneGeometry(SIGN.w, SIGN.h), face);
  board.position.y = SIGN.y + SIGN.h / 2;
  board.castShadow = true;
  const back = board.clone();
  back.material = weathered({ colour: '#3a2a20', rust: 0.7, rough: 0.8, wet: 0.3, scale: 0.6 });
  back.material.alphaTest = 0.5;
  back.material.opacityNode = face.opacityNode;
  back.rotation.y = Math.PI;
  back.position.z = -0.02;
  const wood = weathered({ colour: '#3a3026', rough: 0.9, wet: 0.4, scale: 0.3, streaks: 0.6 });
  for (const x of [-SIGN.w * 0.25, SIGN.w * 0.35]) {
    const post = new Mesh(new BoxGeometry(0.12, SIGN.y + SIGN.h + 0.1, 0.12), wood);
    post.position.set(x, (SIGN.y + SIGN.h + 0.1) / 2, -0.08);
    post.castShadow = true;
    g.add(post);
  }
  g.add(board, back);
  g.position.set(SIGN.x, 0, SIGN.z);
  g.rotation.y = SIGN.yaw;
  return { object: g, update() {} };
}
