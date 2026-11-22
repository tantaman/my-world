// The abandoned buildings on the map and in the forest. Their architecture
// is shared by everyone on the seed. What you catch in a doorway is local.
import * as THREE from 'three';
import { clearOf } from '../videostore/site.js';
import { boxOf, toLocal, toWorld, onPlan, planDiscs } from '../landmarks/sites.js';
import { VEG_STRIDE } from '../world/flora.js';
import { rayBox } from '../core/geom.js';
import { findBuildings, OutlyingBuildings, overlaps, DISTRICT } from './sites.js';
import { GridNearest, ListNearest, MergeNearest } from '../core/nearest.js';
import { buildInstitution } from './building.js';
import { Visit } from './visit.js';
import { institutionMaterial } from './surfaces.js';
import { hauntingScore } from './sound.js';

const GLYPH = ['...#...', '..###..', '#######', '#.#.#.#', '###.###', '#.#.#.#', '###.###'];
const SHOW = 220,
  HIDE = 290; // metres from the centre
const _local = {};
export const after = ['videostore', 'airports'];
export function installAbandoned(game) {
  const { gen, player, landforms, landmarks, towns, caves, railway, spaceport, videostore, airports, builder, chunks, grass, spaces, scene, camera, sky, solids, map, sound, save, hud } = game;
  const reserved = clearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines, spaceport: spaceport.sites });
  function keepOff(...box) {
    if (videostore.stores(...box).length || reserved(...box)) return true;
    const x = (box[0] + box[2]) / 2,
      z = (box[1] + box[3]) / 2;
    const fields = airports.airports;
    for (const region of fields.regions) {
      const d = Math.hypot(x - region.x, z - region.z);
      if (d < region.r0 - 170 || d > region.r1 + 4200) continue;
      const field = fields.site(region.id);
      if (field && overlaps(box, field.box)) return true;
    }
    return false;
  }
  const home = findBuildings(gen, player.start, keepOff);
  const districts = new OutlyingBuildings(gen, player.start, keepOff);
  const known = new Map(home.map((s) => [s.id, s]));
  function remember(s) {
    if (s) known.set(s.id, s);
    return s;
  }
  // The buildings by the start, and the district's nearest (x, z). keep:
  // counted as come near (sites, the map), as it is round you; not when
  // something else only asks what's in the way there (whether a road is
  // clear far off, say), as with within().
  function localSites(x, z, keep = true) {
    const outer = districts.near(x, z);
    return outer ? [...home, keep ? remember(outer) : outer] : home;
  }
  const byId = (id) => known.get(id) || remember(districts.byId(id));
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
  const discs = new WeakMap();
  builder.obstacles.addSource((x, z, r, out) => {
    if (checking) return;
    localSites(x, z, false).forEach((s) => {
      if (!overlaps(s.box, [x - r - 3, z - r - 3, x + r + 3, z + r + 3]) || !stands(s)) return;
      if (!discs.has(s)) discs.set(s, planDiscs(s, 3));
      for (const p of discs.get(s))
        if (Math.hypot(x - p.x, z - p.z) < r + p.r + 1) {
          out.push({ ...p, what: s.name, wall: p.r, footing: p.r, roof: p.r, dig: p.r, grown: true });
        }
    });
  });
  // Leave room behind a walker for the chase camera at the map arrival.
  const clearings = new WeakMap();
  chunks.on('vegetation', (ch) => {
    const x = ch.cx * chunks.size,
      z = ch.cz * chunks.size;
    for (const s of localSites(x, z)) {
      if (!clearings.has(s)) {
        const area = { ...s, plan: [s.plan[0], [-7, s.d, 7, s.d + 22]] };
        area.box = boxOf(area);
        clearings.set(s, area);
      }
      const clearing = clearings.get(s);
      if (!overlaps(clearing.box, [x - 5, z - 5, x + chunks.size + 5, z + chunks.size + 5]) || !stands(s)) continue;
      for (const [kind, list] of Object.entries(ch.vegLists)) {
        for (let o = 0; o < list.length; o += VEG_STRIDE) {
          const pad = kind === 'log' ? list[o + 4] * 2.4 : 2;
          if (list[o + 4] > 0 && onPlan(clearing, list[o], list[o + 2], pad)) chunks.hideInstance(ch, kind, o / VEG_STRIDE);
        }
      }
    }
  });
  grass.addClearing((...box) => {
    const near = localSites((box[0] + box[2]) / 2, (box[1] + box[3]) / 2).filter((s) => overlaps(box, s.box) && stands(s));
    return near.length ? (x, z) => near.some((s) => onPlan(s, x, z)) : null;
  });

  save.register({
    id: 'abandoned',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ visited: [...visited], inside: visit?.site.id ?? null }),
    validate(raw) {
      return {
        visited: Array.isArray(raw?.visited) ? raw.visited.filter((id) => typeof id === 'string' && (known.has(id) || /^abandoned:district:-?\d{1,6}:-?\d{1,6}$/.test(id))) : [],
        inside: byId(raw?.inside)?.id ?? null,
      };
    },
    restore(state) {
      visited.clear();
      for (const id of state.visited) visited.add(id);
      standing.clear();
      const s = byId(state.inside);
      if (s && onPlan(s, player.arrival.x, player.arrival.z)) player.arrival.y = s.top;
    },
  });
  const places = new WeakMap();
  function asPlace(s) {
    if (!places.has(s))
      places.set(s, {
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
      });
    return places.get(s);
  }
  map.places.addSource({
    // the named ones round the start, then a district at a time outward
    list: 'abandoned buildings',
    nearest: (x, z) =>
      new MergeNearest([
        new ListNearest(x, z, home.filter(stands).map(asPlace)),
        new GridNearest(x, z, {
          size: DISTRICT,
          origin: player.start,
          at(i, j) {
            const s = remember(districts.cell(i, j));
            return s && stands(s) ? [asPlace(s)] : [];
          },
        }),
      ]),
    within: (a, b, c, d) => [...known.values()].filter((s) => s.door.x >= a && s.door.z >= b && s.door.x <= c && s.door.z <= d && stands(s)).map(asPlace),
    get(id) {
      const s = byId(id);
      return s && stands(s) ? asPlace(s) : null;
    },
  });

  const material = institutionMaterial();
  const score = { level: 0, tension: 0, porter: false };
  sound.addLayer(hauntingScore(score));
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
    get sites() {
      return [...known.values()];
    },
    // The buildings whose box overlaps a rectangle of the world: the ones by
    // the start, and those of the districts it touches (each in its own).
    // Asking doesn't count as having come near one: they aren't added to sites.
    within(x0, z0, x1, z1) {
      return [...home.filter((s) => overlaps(s.box, [x0, z0, x1, z1])), ...districts.within(x0, z0, x1, z1)];
    },
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
    for (const s of localSites(x, z)) if (onPlan(s, x, z) && !shown.has(s) && stands(s)) show(s);
  });

  game.addSystem({
    name: 'abandoned',
    phase: 'world',
    update({ dt }) {
      const pos = player.pos;
      let inside = null;
      score.level = 0;
      score.tension = 0;
      const nearby = localSites(game.focus.x, game.focus.z);
      for (const s of new Set([...nearby, ...shown.keys()])) {
        const distance = Math.hypot(game.focus.x - s.x, game.focus.z - s.z);
        let built = shown.get(s);
        if (!built && distance < SHOW && stands(s)) {
          built = show(s);
        } else if (built && (distance > HIDE || !stands(s))) {
          scene.remove(built.object);
          solids.clear(built);
          built.object.traverse((o) => o.geometry?.dispose());
          built.phantom.material.dispose();
          shown.delete(s);
          continue;
        }
        if (built) {
          const approach = Math.hypot(pos.x - s.door.x, pos.z - s.door.z, pos.y - s.top);
          const volume = 0.42 * Math.max(0, 1 - approach / 25);
          if (volume > score.level) {
            score.level = volume;
            score.porter = s.kind === 'post' || s.kind === 'furnace';
          }
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
          if (aftermath) {
            aftermath.built.windowLight.visible = false;
            aftermath.built.phantom.visible = false;
          }
          aftermath = null;
          visit = new Visit(inside, shown.get(inside));
          visited.add(inside.id);
          save.touch();
        }
        const depth = Math.min(1, Math.max(0, (inside.d - p.z) / 5));
        sky.open = Math.min(sky.open, 1 - 0.7 * depth);
        sound.setEnclosed(Math.max(sound.enclosed, 0.85 * depth));
        fill.position.set(pos.x, pos.y + 2.1, pos.z);
        // The tube sags once as the figure withdraws, then slowly recovers.
        const fade = visit.motion?.fade;
        const dip = fade === undefined ? 0 : Math.sin(Math.PI * Math.min(1, (visit.motion.age - fade) / 1.45));
        fill.intensity = (2.4 + depth * 1.9) * (1 - 0.72 * dip);
        visit.update(dt, p, camera, play, tell);
        score.level = 0.57 + 0.42 * depth;
        score.porter = inside.kind === 'post' || inside.kind === 'furnace';
        score.tension = visit.motion ? 1 : depth * 0.58;
      } else if (aftermath) {
        const pending = aftermath.outside(dt, pos, play);
        aftermath.built.windowLight.visible = pending && aftermath.exitDelay < 1.8;
        if (!pending) aftermath = null;
      }
    },
  });
}
