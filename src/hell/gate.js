// The gate, in the forest: a doorway of dark stone standing at the foot of a
// hillside, the nine lines cut over it, and behind it a passage running down
// into the hill to a round chamber and a door.
//
// The passage and the chamber are rock, and made the way a cave's rock is
// (src/caves/build.js: the same field, skin, floor and walls, the same
// daylight falling away from the mouth), from the layout site.js gives. What
// is added here is what was built: the gateway and its tablet, and the frame
// of the door at the far end.
//
// Like a cave it is made as you come near (a few milliseconds a frame) and
// let go of when you're well away, and while it stands the hillside is cut
// open for its way in (world/cuts.js).

import * as THREE from 'three';
import { buildCave, step, finish } from '../caves/build.js';
import { caveObject, disposeCave } from '../caves/look.js';
import { setCuts } from '../world/cuts.js';
import { Sculpt, vary } from './sculpt.js';
import { createHellStone } from './look.js';
import { INSCRIPTION } from './words.js';
import { GATE } from './site.js';

const NEAR = 190; // m: made when you're this close
const AWAY = 320; // m: and let go of this far off
const BUDGET = 4; // ms a frame spent making it
const EMBER = 1.5; // how bright the light out of the far door is

const STONE = [0.075, 0.07, 0.068];
const DARK = [0.03, 0.028, 0.028];
// The gateway: piers either side of the way in, a lintel, and the tablet
// over it (m).
const PIER = { w: 1.6, d: 1.5, out: 0.9 }; // how wide, how deep, and how far in from the lip it stands
const TABLET = { w: 5.4, h: 3.2, d: 0.6 }; // the stone the words are cut in, between the piers carried up either side of it
// The door at the end: its opening, and how far from the middle of the
// chamber it stands.
export const DOORWAY = { w: 1.7, h: 2.5, at: 2.9, reach: 1.25 };

// The frame of a door in rock, with nothing behind it but the dark: its
// threshold at the origin, facing -z (you walk +z into it).
export function doorFrame(material) {
  const s = new Sculpt();
  const { w, h } = DOORWAY;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) s.box(side * (w / 2 + 0.3), 0.33 + i * 0.66, 0.7, 0.62, 0.64, 1.9, vary(STONE, (i * 0.37 + (side + 1) * 0.21) % 1));
  }
  // an arch of five stones over it
  for (let i = 0; i < 5; i++) {
    const a = ((i + 0.5) / 5) * Math.PI;
    s.box(-Math.cos(a) * (w / 2 + 0.28), h + 0.12 + Math.sin(a) * 0.5, 0.7, 0.62, 0.62, 1.9, vary(STONE, (i * 0.29) % 1), { rz: Math.PI / 2 - a });
  }
  s.box(0, -0.06, 0.2, w + 1.3, 0.16, 1.2, vary(STONE, 0.2));
  const group = new THREE.Group();
  const frame = new THREE.Mesh(s.build(), material);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);
  // the dark in it
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, h + 0.9), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  dark.position.set(0, (h + 0.9) / 2, 1.05);
  dark.rotation.y = Math.PI;
  group.add(dark);
  return group;
}

// The nine lines, cut in stone: a colour map (dark letters in grey stone)
// and a faint glow in the cuts, so they can be read at night.
function tablet(doc) {
  const W = 1024;
  const Hh = 594;
  const paint = (glow) => {
    const canvas = doc.createElement('canvas');
    canvas.width = W;
    canvas.height = Hh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = glow ? '#000' : '#6b6661';
    ctx.fillRect(0, 0, W, Hh);
    if (!glow) {
      // the stone's own mottle, so it isn't a flat card
      for (let i = 0; i < 3200; i++) {
        const v = 84 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgba(${v},${v - 4},${v - 7},0.3)`;
        ctx.fillRect(Math.random() * W, Math.random() * Hh, 2 + Math.random() * 8, 1 + Math.random() * 3);
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    INSCRIPTION.forEach((line, i) => {
      const last = i === INSCRIPTION.length - 1;
      ctx.font = `bold ${last ? 46 : 37}px Georgia, 'Times New Roman', serif`;
      const y = 52 + i * 58 + (last ? 20 : 0);
      const text = line.toUpperCase();
      if (!glow) {
        // a lit lower edge to each cut, then the cut itself
        ctx.fillStyle = 'rgba(190,184,174,0.6)';
        ctx.fillText(text, W / 2 + 1.5, y + 2, W - 50);
        ctx.fillStyle = '#0b0a09';
      } else ctx.fillStyle = last ? '#b04018' : '#4a1c0c';
      ctx.fillText(text, W / 2, y, W - 50);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  };
  return new THREE.MeshStandardMaterial({ map: paint(false), emissiveMap: paint(true), emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.95 });
}

export class Gate {
  // site: findGate()'s · kit: what caves are drawn with (src/caves/look.js)
  // terrain(x, z): the height of the land
  constructor({ scene, gen, spaces, kit, site, terrain }) {
    this.scene = scene;
    this.gen = gen;
    this.spaces = spaces;
    this.kit = kit;
    this.site = site;
    this.terrain = terrain;
    this.job = null;
    this.built = null; // { result, group } while it stands
    this.stone = createHellStone();
    this._tablet = null;
    const { door, ux, uz } = site;
    // where the door at the far end is, and which way you face going through it
    this.doorAt = { x: door.x + ux * DOORWAY.at, z: door.z + uz * DOORWAY.at, y: door.floor, yaw: Math.atan2(ux, uz) };
    // the dull light out of that door: in the scene from the start, and only
    // turned up while the gate stands (a light that came and went would have
    // every material in the forest made again)
    this.ember = new THREE.PointLight(0xff3a10, 0, 9, 1.6);
    this.ember.position.set(this.doorAt.x + ux * 0.4, door.floor + 1.5, this.doorAt.z + uz * 0.4);
    scene.add(this.ember);
  }

  get space() {
    return this.built ? this.built.result.space : null;
  }

  // Make it as `at` comes near, and let it go when they're well away.
  update(at) {
    const d = Math.hypot(at.x - this.site.x, at.z - this.site.z);
    if (this.built) {
      if (d > AWAY) this.letGo();
      return;
    }
    if (d > NEAR) {
      this.job = null;
      return;
    }
    if (!this.job) this.job = buildCave(this.gen, this.site.passage);
    const result = step(this.job, BUDGET);
    if (result) this._show(result);
  }

  // Make it now, if (x, z) is in it: for someone set down there.
  ensure(x, z) {
    if (this.built) return;
    const [x0, z0, x1, z1] = this.site.passage.bounds;
    if (x < x0 || z < z0 || x > x1 || z > z1) return;
    this._show(finish(this.job || buildCave(this.gen, this.site.passage)));
  }

  _show(result) {
    this.job = null;
    // no boulders where the gateway stands
    const { x, z, ux, uz } = this.site;
    result.rocks = result.rocks.filter((r) => (r.x - x) * ux + (r.z - z) * uz > PIER.out + PIER.d + r.s);
    const group = caveObject(this.kit, result);
    group.add(this._stonework(result.mesh.origin));
    this.scene.add(group);
    this.built = { result, group };
    this.spaces.add(result.space);
    setCuts(result.cuts, 'hell');
    this.ember.intensity = EMBER;
  }

  letGo() {
    if (!this.built) return;
    const { result, group } = this.built;
    this.built = null;
    this.scene.remove(group);
    disposeCave(group);
    this.spaces.remove(result.space);
    setCuts([], 'hell');
    this.ember.intensity = 0;
  }

  // What was built: the gateway at the mouth, the door at the far end.
  // Measured from the cave's own spot, like the rest of it.
  _stonework([ox, oy, oz]) {
    const { x, z, floor, ux, uz, w, h, door } = this.site;
    const all = new THREE.Group();
    const yaw = Math.atan2(ux, uz);

    // the gateway, facing down the hill
    const gate = new THREE.Group();
    gate.position.set(x - ox, floor - oy, z - oz);
    gate.rotation.y = yaw;
    const s = new Sculpt();
    const at = PIER.out;
    const sill = -GATE.fall * at;
    const top = sill + h + 0.15;
    for (const side of [-1, 1]) {
      const px = side * (w + PIER.w / 2 - 0.1);
      // each pier in courses, down into the ground and up to the lintel
      const ground = this.terrain(x + ux * at + uz * px, z + uz * at - ux * px) - floor;
      const foot = Math.min(sill, ground) - 1.2;
      const courses = Math.ceil((top - foot) / 0.62);
      for (let i = 0; i < courses; i++) {
        const y0 = foot + ((top - foot) * i) / courses;
        const t = (i * 0.41 + (side + 1) * 0.17) % 1;
        s.box(px + (t - 0.5) * 0.05, y0 + (top - foot) / courses / 2, at, PIER.w + (i === 0 ? 0.2 : 0), (top - foot) / courses - 0.03, PIER.d + (i === 0 ? 0.2 : 0), vary(STONE, t));
      }
    }
    // the lintel across them; the piers carried on up either side of the
    // tablet that stands on it; and a coping, stepped, over all
    const span = 2 * w + 2 * PIER.w - 0.2;
    s.box(0, top + 0.4, at, span + 0.5, 0.8, PIER.d + 0.2, vary(STONE, 0.3));
    const ty = top + 0.8;
    s.box(0, ty + TABLET.h / 2, at + 0.12, TABLET.w, TABLET.h, TABLET.d, vary(STONE, 0.62));
    const strip = (span - TABLET.w) / 2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) s.box(side * (TABLET.w / 2 + strip / 2), ty + (TABLET.h * (i + 0.5)) / 5, at, strip + 0.02, TABLET.h / 5 - 0.03, PIER.d, vary(STONE, (i * 0.31 + (side + 1) * 0.23) % 1));
    }
    s.box(0, ty + TABLET.h + 0.24, at, span + 0.9, 0.48, PIER.d + 0.5, vary(STONE, 0.2));
    s.box(0, ty + TABLET.h + 0.7, at, span * 0.72, 0.44, PIER.d + 0.2, vary(STONE, 0.7));
    s.box(0, ty + TABLET.h + 1.1, at, span * 0.4, 0.4, PIER.d, vary(STONE, 0.45));
    const stone = new THREE.Mesh(s.build(), this.stone);
    stone.castShadow = true;
    stone.receiveShadow = true;
    gate.add(stone);
    if (typeof document !== 'undefined') {
      this._tablet ||= tablet(document);
      const words = new THREE.Mesh(new THREE.PlaneGeometry(TABLET.w - 0.3, TABLET.h - 0.24), this._tablet);
      words.position.set(0, ty + TABLET.h / 2, at + 0.12 - TABLET.d / 2 - 0.012);
      words.rotation.y = Math.PI;
      gate.add(words);
    }
    all.add(gate);

    // the door at the far side of the chamber, and a dull light out of it
    const frame = doorFrame(this.stone);
    frame.position.set(door.x + ux * DOORWAY.at - ox, door.floor - oy, door.z + uz * DOORWAY.at - oz);
    frame.rotation.y = yaw;
    all.add(frame);
    return all;
  }
}
