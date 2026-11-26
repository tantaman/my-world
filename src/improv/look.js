// (fetched the first time you come near the club: core/lazy.ts)
//
// The DC Improv stood up: its front on Connecticut Avenue, and downstairs
// the lobby, the Main Showroom and the Lounge, their audiences, and whoever
// is on their stages.
//
//   const club = new Club({ site, seed })
//   club.front, club.below   groups to put in the scene: the street front at
//                            the street's height; downstairs at the club's
//                            floor (shown only while you're down there)
//   club.pump()              -> true while there's more to build (the
//                            performers wanted, the people in the seats)
//   club.solids              the tables, for the world's Solids
//   club.lit(house, stage)   how bright the house lights and the stage
//                            lights are (0..1)
//   club.fill(room, share, seed)       how full a room is, for a show
//   club.perform(room, on, dt, { speaking, laugh, people })
//                            who's on a room's stage, at which marks
//                            ({ id: mark }), who's talking, and how hard
//                            the room is laughing (0..1)
//   club.cast(ids, people)   performers to get ready before they're wanted
//   club.paint({ board, posters })   the week's shows on the board in the
//                            lobby, and on the posters out front
//
// Everything is built round the club's own origin and that's what's put in
// the world (render/origin.js): nothing big goes to the graphics card.

import * as THREE from 'three';
import { buildClub } from './room.js';
import { MARKS, STAGES, TABLES, SEATS, toWorld } from './club.js';
import { Audience, Performer, Templates } from './crowd.js';
import { animalMaterial } from '../render/rig.js';
import * as boards from './boards.js';

const LIT = { house: [0.08, 0.5], stage: [0.12, 0.9] }; // share of its own colour each gives off: [lights down, up]

// The inside lights itself (it's lit by its own lamps, whatever the sun is
// doing), a share of its own colour, as bright as its lights are turned up.
function litFromWithin(mat, uniform, key) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = uniform;
    shader.fragmentShader = `uniform float uLit;\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * uLit;')}`;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export class Club {
  constructor({ site, seed = 1 }) {
    this.site = site;
    this.house = { value: LIT.house[1] };
    this.stageLit = { value: LIT.stage[1] };
    const M = (this.materials = {
      street: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      house: litFromWithin(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), this.house, 'improv-house'),
      stage: litFromWithin(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }), this.stageLit, 'improv-stage'),
    });
    const { kits, pictures } = buildClub();
    this.front = new THREE.Group();
    this.front.name = 'improv: the street front';
    this.front.position.set(site.x, site.y, site.z);
    this.front.rotation.y = site.yaw;
    this.below = new THREE.Group();
    this.below.name = 'improv: downstairs';
    this.below.position.set(site.x, site.floor, site.z);
    this.below.rotation.y = site.yaw;
    this.below.visible = false;
    const mesh = (kit, mat, group) => {
      if (kit.empty) return;
      const m = new THREE.Mesh(kit.build(), mat);
      m.castShadow = mat !== M.glow;
      m.receiveShadow = true;
      group.add(m);
    };
    mesh(kits.street, M.street, this.front);
    mesh(kits.streetGlow, M.glow, this.front);
    mesh(kits.house, M.house, this.below);
    mesh(kits.stage, M.stage, this.below);
    mesh(kits.glow, M.glow, this.below);

    // the pictures: neon, the board, the posters, the headshots
    this.textures = [];
    this.posters = {};
    this.board = null;
    this.headshots = [];
    for (const p of pictures) {
      const street = !!p.street;
      const tex = this.picture(p);
      if (!tex) continue;
      const glow = ['name', 'blade', 'logo', 'lounge', 'troupe'].includes(p.kind);
      const mat = glow ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: street ? 0.25 : 0.5, roughness: 0.5, side: THREE.DoubleSide });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), mat);
      q.position.set(p.x, p.y, p.z);
      q.rotation.y = Math.atan2(p.nx, p.nz);
      if (glow) q.renderOrder = 2;
      (street ? this.front : this.below).add(q);
      this.textures.push(tex);
    }

    // the people: an audience for each room, sat down a few at a time
    this.templates = new Templates(seed);
    this.audiences = {
      main: new Audience(SEATS.filter((s) => s.room === 'main'), { material: animalMaterial, templates: this.templates, seed: seed * 3 + 1, group: this.below }),
      lounge: new Audience(SEATS.filter((s) => s.room === 'lounge'), { material: animalMaterial, templates: this.templates, seed: seed * 3 + 2, group: this.below }),
    };
    this.performers = new Map(); // id -> Performer
    this.wanted = []; // performers to make, [id, person]

    // the tables, to bump into (in the world)
    this.solids = TABLES.map((t) => {
      const p = toWorld(site, t.x, t.z);
      return { ax: p.x, az: p.z, bx: p.x, bz: p.z, r: t.r + 0.06, bottom: site.floor - 0.2, topA: site.floor + 0.76, topB: site.floor + 0.76 };
    });
  }

  // A picture's texture, painted (null where there's nothing to paint on).
  picture(p) {
    switch (p.kind) {
      case 'name':
        return boards.neon('DC IMPROV', { color: '#ff2a3a', size: 150, w: 1024, h: 256 });
      case 'blade':
        return rotated(boards.neon('IMPROV', { color: '#ff3040', size: 170, w: 1024, h: 300 }));
      case 'logo':
        return boards.neon('DC Improv', { color: '#ff2030', size: 190, w: 1024, h: 256, font: 'italic 900' });
      case 'lounge':
        return boards.neon('THE LOUNGE', { color: '#40c8ff', size: 120, w: 1024, h: 256 });
      case 'troupe':
        return boards.neon('Point of Order', { color: '#ffd040', size: 130, w: 1024, h: 256 });
      case 'board':
        return (this.board = boards.board('THIS WEEK AT THE DC IMPROV', []));
      case 'poster':
        return (this.posters[p.room] = boards.poster('DC IMPROV', '', []));
      case 'headshot': {
        const t = boards.poster('', '', []);
        if (t) this.headshots.push(t);
        return t;
      }
      default:
        return null;
    }
  }

  // The week's shows on the board; tonight's on the posters out front.
  /**
   * @typedef {{ head: string, big: string, lines: string[] }} Poster
   * @param {{ board: Array<{ day: string, time: string, what: string, who: string, now: boolean }>,
   *   posters: Record<string, Poster>, headshots?: Poster[] }} what
   */
  paint({ board, posters, headshots = [] }) {
    if (this.board) boards.board('THIS WEEK AT THE DC IMPROV', board, this.board);
    for (const [room, p] of Object.entries(posters)) if (this.posters[room]) boards.poster(p.head, p.big, p.lines, room === 'lounge' ? '#ffc040' : '#e83040', this.posters[room]);
    this.headshots.forEach((t, k) => {
      const h = headshots[k];
      if (h) boards.poster(h.head, h.big, h.lines, '#e8b040', t);
    });
  }

  get ready() {
    return this.templates.ready;
  }

  // Any performer that's wanted, then the audiences sat down: a person at a
  // time (each takes a few milliseconds).
  pump() {
    if (this.wanted.length) {
      const [id, person] = this.wanted.shift();
      this.make(id, person);
      return true;
    }
    return this.templates.pump();
  }

  make(id, person) {
    let p = this.performers.get(id);
    if (p) return p;
    p = new Performer(person, hashOf(id));
    this.below.add(p.mesh);
    this.performers.set(id, p);
    return p;
  }

  cast(ids, people) {
    for (const id of ids) if (!this.performers.has(id) && !this.wanted.some((w) => w[0] === id)) this.wanted.push([id, people(id)]);
  }

  lit(house, stage) {
    this.house.value = LIT.house[0] + (LIT.house[1] - LIT.house[0]) * house;
    this.stageLit.value = LIT.stage[0] + (LIT.stage[1] - LIT.stage[0]) * stage;
  }

  fill(room, share, seed) {
    this.audiences[room].fill(share, seed);
  }

  // Who's on the room's stage and where, who's talking, how hard the room laughs.
  perform(room, on, dt, { speaking = null, laugh = 0, people }) {
    const marks = MARKS[room];
    const h = STAGES[room].h;
    this.audiences[room].update(dt, laugh);
    const backs = new Map();
    let b = 0;
    for (const [id, mark] of Object.entries(on)) if (mark === 'back') backs.set(id, marks.back[b++ % marks.back.length]);
    // everyone who is, or was, on this stage
    for (const [id, p] of this.performers) {
      const mark = on[id];
      if (mark && p.room !== room) {
        p.room = room;
        p.wings = marks.wings;
        p.on = false;
      }
      if (p.room !== room) continue;
      let to = null;
      if (mark === 'back') to = { ...backs.get(id), yaw: marks.mic.yaw };
      else if (mark) to = marks[mark];
      // in a scene, the two face each other, cheating out to the room
      if (mark === 'left' || mark === 'right') {
        const other = Object.entries(on).find(([o, m]) => o !== id && (m === 'left' || m === 'right'));
        if (other) {
          const om = marks[other[1]];
          const face = Math.atan2(om.x - to.x, om.z - to.z);
          to = { ...to, yaw: mix(face, marks.mic.yaw, 0.45) };
        }
      }
      p.update(dt, to, { speaking: speaking === id, mic: mark === 'mic', stageY: h });
    }
    // anyone on who isn't made yet
    for (const id of Object.keys(on)) if (!this.performers.has(id)) this.cast([id], people);
  }

  // Everyone off every stage at once (the shows are over, or you've gone).
  clear() {
    for (const p of this.performers.values()) {
      p.on = false;
      p.mesh.visible = false;
    }
  }

  dispose() {
    for (const a of Object.values(this.audiences)) a.dispose();
    this.templates.dispose();
    for (const p of this.performers.values()) p.dispose();
    for (const g of [this.front, this.below]) {
      g.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) o.geometry.dispose();
      });
    }
    for (const t of this.textures) t.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

// The blade sign's letters run up it: the picture turned on its side.
function rotated(tex) {
  if (!tex) return null;
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  return tex;
}

// Halfway (t of the way) from angle a to angle b, the short way round.
function mix(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

const hashOf = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export { MARKS, STAGES };
