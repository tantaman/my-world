// The abandoned buildings on the map and in the forest. Their architecture
// is shared by everyone on the seed. What you catch in a doorway is local.
import * as THREE from 'three';
import { clearOf } from '../videostore/site.js';
import { toLocal, toWorld, onPlan, planDiscs } from '../landmarks/sites.js';
import { VEG_STRIDE } from '../world/flora.js';
import { rayBox } from '../core/geom.js';
import { findBuildings, overlaps } from './sites.js';
import { buildInstitution } from './building.js';
import { Visit } from './visit.js';
import './sound.js';

const GLYPH = ['...#...', '..###..', '#######', '#.#.#.#', '###.###', '#.#.#.#', '###.###'];
const SHOW = 220,
  HIDE = 290; // metres from the centre
const _local = {};
export const after = ['videostore'];
export function installAbandoned(game) {
  const { gen, player, landforms, landmarks, towns, caves, railway, spaceport, videostore, builder, chunks, grass, spaces, scene, camera, sky, solids, map, sound, save, hud } = game;
  const reserved = clearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines, spaceport: spaceport.site });
  const sites = findBuildings(gen, player.start, (...box) => (videostore.site && overlaps(box, videostore.site.box)) || reserved(...box));
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset?.(x, z) || 0);
  const standing = new Map(),
    shown = new Map(),
    visited = new Set();
  let checking = false;
  function stands(s) {
    if (!standing.has(s.id)) {
      checking = true;
      try {
        const near = builder.obstacles.near(s.x, s.z, Math.hypot(s.w, s.d + 11) + 3);
        standing.set(s.id, !near.some((o) => !o.grown && onPlan(s, o.x, o.z, 1)));
      } finally {
        checking = false;
      }
    }
    return standing.get(s.id);
  }
  const discs = sites.map((s) => planDiscs(s, 3));
  builder.obstacles.addSource((x, z, r, out) => {
    if (checking) return;
    sites.forEach((s, i) => {
      if (!overlaps(s.box, [x - r - 3, z - r - 3, x + r + 3, z + r + 3]) || !stands(s)) return;
      for (const p of discs[i])
        if (Math.hypot(x - p.x, z - p.z) < r + p.r + 1) {
          out.push({ ...p, what: s.name, wall: p.r, footing: p.r, roof: p.r, dig: p.r, grown: true });
        }
    });
  });
  chunks.on('vegetation', (ch) => {
    const x = ch.cx * chunks.size,
      z = ch.cz * chunks.size;
    for (const s of sites) {
      if (!overlaps(s.box, [x - 5, z - 5, x + chunks.size + 5, z + chunks.size + 5]) || !stands(s)) continue;
      for (const [kind, list] of Object.entries(ch.vegLists)) {
        for (let o = 0; o < list.length; o += VEG_STRIDE) {
          const pad = kind === 'log' ? list[o + 4] * 2.4 : 2;
          if (list[o + 4] > 0 && onPlan(s, list[o], list[o + 2], pad)) chunks.hideInstance(ch, kind, o / VEG_STRIDE);
        }
      }
    }
  });
  grass.addClearing((...box) => {
    const near = sites.filter((s) => overlaps(box, s.box) && stands(s));
    return near.length ? (x, z) => near.some((s) => onPlan(s, x, z)) : null;
  });

  save.register({
    id: 'abandoned',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ visited: [...visited], inside: visit?.site.id ?? null }),
    validate(raw) {
      return {
        visited: Array.isArray(raw?.visited) ? raw.visited.filter((id) => sites.some((s) => s.id === id)) : [],
        inside: sites.find((s) => s.id === raw?.inside)?.id ?? null,
      };
    },
    restore(state) {
      visited.clear();
      for (const id of state.visited) visited.add(id);
      standing.clear();
      const s = sites.find((site) => site.id === state.inside);
      if (s && onPlan(s, player.arrival.x, player.arrival.z)) player.arrival.y = s.top;
    },
  });
  const places = sites.map((s) => ({
    id: s.id,
    ...s.door,
    name: s.name,
    kind: 'abandoned building',
    note: s.note,
    glyph: GLYPH,
    shape: [
      [
        [-s.w, -s.d],
        [s.w, -s.d],
        [s.w, s.d],
        [-s.w, s.d],
      ].map(([x, z]) => {
        const p = toWorld(s, x, z);
        return [p.x, p.z];
      }),
    ],
    get visited() {
      return visited.has(s.id);
    },
  }));
  const available = () => places.filter((p, i) => stands(sites[i]));
  map.places.addSource({
    destinations: available,
    within: (a, b, c, d) => places.filter((p, i) => p.x >= a && p.z >= b && p.x <= c && p.z <= d && stands(sites[i])),
    get: (id) => places.find((p, i) => p.id === id && stands(sites[i])) || null,
  });

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 });
  // Vary the masonry on two scales: broad damp rising from the skirting,
  // and the finer speckle of bare aggregate. Positions are building-local.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vBuilding;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBuilding=position;');
    shader.fragmentShader =
      `varying vec3 vBuilding;
      float grit(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        vec4 n=dot(i,vec3(1,57,113))+vec4(0,57,113,170);
        vec4 a=mix(fract(sin(n)*43758.5),fract(sin(n+1.)*43758.5),f.x);
        return mix(mix(a.x,a.y,f.y),mix(a.z,a.w,f.y),f.z);
      }\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float stain=grit(vBuilding*vec3(.67,.35,.67));
        diffuseColor.rgb *= .60+.39*stain+.15*grit(vBuilding*5.);
        diffuseColor.rgb *= 1.-.33*(1.-smoothstep(.2,1.8,vBuilding.y))*smoothstep(.37,.65,stain);`,
      );
  };
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fill = new THREE.PointLight(0xc4cfba, 0, 11, 1.35);
  scene.add(fill);
  let visit = null,
    aftermath = null;
  const play = (kind, x, y, z) => sound.call(kind, x, y, z);
  const tell = (text) => hud.flash(text, 4400);
  player.on('footstep', () => visit?.footstep(player.pos.x, player.pos.z));
  player.cameraBlockers.push((origin, dir, max) => {
    let best = Infinity;
    for (const [s, built] of shown) {
      if (Math.hypot(origin.x - s.x, origin.z - s.z) > Math.hypot(s.w, s.d) + max + 2) continue;
      for (const box of built.blockers) best = Math.min(best, rayBox(origin, dir, box));
    }
    return best;
  });
  builder.idleWhile(() => !!visit);
  game.provide('abandoned', {
    sites,
    get inside() {
      return visit?.site.id || null;
    },
  });

  function show(s) {
    const built = buildInstitution(s, ground, material, lit);
    shown.set(s, built);
    scene.add(built.object);
    solids.set(built, built.solids);
    return built;
  }
  // Have the floor in place before spawn() chooses a height on reload.
  spaces.onDemand((x, z) => {
    for (const s of sites) if (onPlan(s, x, z) && !shown.has(s) && stands(s)) show(s);
  });

  game.addSystem({
    name: 'abandoned',
    phase: 'world',
    update({ dt }) {
      const pos = player.pos;
      let inside = null;
      for (const s of sites) {
        const distance = Math.hypot(game.focus.x - s.x, game.focus.z - s.z);
        let built = shown.get(s);
        if (!built && distance < SHOW && stands(s)) {
          built = show(s);
        } else if (built && (distance > HIDE || !stands(s))) {
          scene.remove(built.object);
          solids.clear(built);
          built.object.traverse((o) => o.geometry?.dispose());
          shown.delete(s);
          continue;
        }
        if (!built || pos.y < s.top - 0.5 || pos.y >= s.top + s.height) continue;
        const p = toLocal(s, pos.x, pos.z, _local);
        if (Math.abs(p.x) < s.w && Math.abs(p.z) < s.d) inside = s;
      }
      if (visit && inside !== visit.site) {
        visit.leave(toLocal(visit.site, pos.x, pos.z, _local), pos.y);
        aftermath = visit.exitDelay ? visit : null;
        visit = null;
        save.touch();
        fill.intensity = 0;
      }
      if (inside) {
        const p = toLocal(inside, pos.x, pos.z, _local);
        if (!visit) {
          if (aftermath) aftermath.built.windowLight.visible = false;
          aftermath = null;
          visit = new Visit(inside, shown.get(inside));
          visited.add(inside.id);
          save.touch();
        }
        const depth = Math.min(1, Math.max(0, (inside.d - p.z) / 5));
        sky.open = Math.min(sky.open, 1 - 0.7 * depth);
        sound.setEnclosed(Math.max(sound.enclosed, 0.85 * depth));
        fill.position.set(pos.x, pos.y + 2.1, pos.z);
        fill.intensity = 2.8 + depth * 2.5;
        visit.update(dt, p, camera, play, tell);
      } else if (aftermath) {
        const pending = aftermath.outside(dt, pos, play);
        aftermath.built.windowLight.visible = pending && aftermath.exitDelay < 1.8;
        if (!pending) aftermath = null;
      }
    },
  });
}
