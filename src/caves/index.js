// Caves: openings in the hillsides you can walk into, with passages running
// back under the hill, rooms hung with stalactites, and, in some, glowworms
// or a grotto of crystals at the far end. Everything about them lives in this
// folder; this plugs them into the game.
//
//   sites.js   where the caves are, and the shape of their passages (from the seed)
//   shape.js   their rock, as a field
//   mesh.js    its skin, coloured
//   space.js   the floor, roof and walls you walk by
//   build.js   all of that for one cave, a little at a time
//   caves.js   the caves near you: found, built and let go of as you go
//   look.js    the rock's material, dripstones, crystals, glowworms, boulders
//   lamp.js    the headlamp
//   sound.js   footsteps on rock, drips, the hush
//
// A cave changes nothing the seed grows: the land is the same with it as
// without, so no save moves. Its mouth is the one place it meets the land,
// and there the hillside is cut open for it (world/cuts.js). Nor is one grown
// on, or near enough to change, a real place brought in from a photo (see
// src/hikes/): what is there is what is really there.

import { Caves } from './caves.js';
import { CAVE } from './sites.js';
import { caveKit, ROCK } from './look.js';
import { Headlamp } from './lamp.js';
import { caveSounds } from './sound.js';
import { setCuts } from '../world/cuts.js';
import { VEG_KINDS } from '../world/chunkGen.js';
import { segDist } from '../core/geom.js';
import { GridNearest } from '../core/nearest.js';

// A cave's badge on the map: a dark mouth under an arch of rock.
const GLYPH = ['..###..', '.#####.', '###.###', '##...##', '##...##', '#.....#', '#######'];

const DARK = [0.4, 0.55]; // the lamp comes on below this much daylight, and goes off above that
const ADJUST = { brighter: 2.2, darker: 1.3 }; // how fast the eye gets used to it (per second)
const CLEAR = 4; // m round a mouth's cutting kept clear of trees and undergrowth

// The cutting at a cave's mouth, and a little in front: a segment and how
// far either side of it.
function mouthZone(cave, pad) {
  const m = cave.mouth;
  const reach = m.portal + 3;
  return { ax: m.x - m.ux * 3, az: m.z - m.uz * 3, bx: m.x + m.ux * reach, bz: m.z + m.uz * reach, r: m.w + pad };
}
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };

// What a cave holds, as the map says it.
function noteFor(cave) {
  if (cave.crystals) return 'a grotto of crystals at the far end, and glowworms on the way';
  if (cave.glow) return 'glowworms on the roofs of its rooms, deep inside: put your lamp out';
  return `passages and ${cave.rooms.length === 1 ? 'a room' : cave.rooms.length ? `${cave.rooms.length} rooms` : 'nothing but passages'} under the hill`;
}

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map'];
export function installCaves(game) {
  const { scene, camera, gen, landforms, chunks, spaces, solids, sky, player, sound, hud, commands, builder, map, materials, save } = game;

  const keepOff = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const caves = new Caves({ scene, gen, spaces, solids, kit: caveKit(chunks.models, materials.vegetation), keepOff });
  game.provide('caves', caves);
  // someone set down in a cave (a reload, a teleport) finds it already there
  spaces.onDemand((x, z) => caves.ensure(x, z));

  // ── The mouth ─────────────────────────────────────────────────────────────
  // No trees or undergrowth in the cutting or round its boulders.
  chunks.on('vegetation', (ch) => {
    const s = chunks.size;
    for (const cave of caves.inBox(ch.x0 - 12, ch.z0 - 12, ch.x0 + s + 12, ch.z0 + s + 12)) {
      const z = mouthZone(cave, CLEAR);
      const cx = (z.ax + z.bx) / 2;
      const cz = (z.az + z.bz) / 2;
      const R = Math.hypot(z.bx - z.ax, z.bz - z.az) / 2 + z.r + 1;
      chunks.forEachPlant(cx, cz, R, VEG_KINDS, (pc, kind, k, px, py, pz, sc) => {
        if (pc !== ch) return;
        segDist(px, pz, z.ax, z.az, z.bx, z.bz, _seg);
        if (_seg.d < z.r + (kind === 'rock' ? sc : 0)) chunks.hideInstance(ch, kind, k);
      });
    }
  });
  // No digging into it, nor building over it, nor over the passage until
  // it has its full roof of earth.
  builder.obstacles.addSource((x, z, R, out) => {
    for (const cave of caves.inBox(x - R - 30, z - R - 30, x + R + 30, z + R + 30)) {
      const m = cave.mouth;
      const way = cave.nodes[1];
      const len = Math.hypot(way.x - m.x, way.z - m.z) + 1;
      for (let t = -1; t <= len; t += 1.5) {
        const px = m.x + m.ux * t;
        const pz = m.z + m.uz * t;
        if (Math.hypot(px - x, pz - z) < R + m.w + 3) out.push({ x: px, z: pz, what: 'the mouth of a cave', dig: m.w + 1.5, wall: m.w + 1, footing: m.w + 1.5, roof: m.w + 1, grown: true });
      }
    }
  });

  // ── The lamp ──────────────────────────────────────────────────────────────
  const lamp = new Headlamp(scene, player.character);
  game.provide('headlamp', lamp);
  let dark = false; // is it dark enough for the lamp, where you are?
  let byHand = null; // what you set it to with K, until it next gets darker or lighter
  let told = false;
  commands.add({
    id: 'headlamp',
    keys: ['KeyK', 'PadLeft'],
    group: 'WANDER',
    label: 'headlamp on / off',
    run() {
      byHand = !lamp.on;
      hud.flash(byHand ? 'headlamp on' : 'headlamp off');
    },
  });

  // ── Sound ─────────────────────────────────────────────────────────────────
  sound.addLayer(caveSounds(caves));

  // ── The map ───────────────────────────────────────────────────────────────
  // Every cave's mouth is a place on it, to look up and track; paler once
  // you've been in. Which you've been in is yours, kept with your marks.
  const visited = new Set();
  save.register({
    id: 'caves',
    scope: 'yours',
    local: 'marks',
    collect: () => [...visited],
    validate: (raw) => (Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []),
    restore(list) {
      visited.clear();
      for (const id of list) visited.add(id);
    },
  });
  const asPlace = (c) => ({ id: c.id, x: c.mouth.x, z: c.mouth.z, name: c.name, kind: 'cave', note: noteFor(c), glyph: GLYPH, visited: visited.has(c.id) });
  map.places.addSource({
    // only what has been looked over already: the map fills in as more is
    within: (x0, z0, x1, z1) => caves.known(x0, z0, x1, z1).map(asPlace),
    get(id) {
      const m = /^cave:(-?\d+):(-?\d+)$/.exec(id);
      const c = m && caves.site(Number(m[1]), Number(m[2]));
      return c ? asPlace(c) : null;
    },
    // (a mouth is well inside its own square)
    list: 'caves',
    nearest: (x, z) =>
      new GridNearest(x, z, {
        size: CAVE.cell,
        at(i, j) {
          const c = caves.site(i, j);
          return c ? [asPlace(c)] : [];
        },
      }),
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  let open = 1;
  let was = null;
  let cut = -1;
  game.addSystem({
    name: 'caves',
    phase: 'world',
    update({ dt }) {
      caves.update(dt, player.pos);
      if (caves.mouthsChanged !== cut) {
        cut = caves.mouthsChanged;
        setCuts(caves.mouths);
      }
      const eye = camera.position;

      // How much daylight gets to your eye, and the eye getting used to it.
      let light = 1;
      for (const b of caves.built.values()) {
        const sp = b.result.space;
        if (sp.air(eye.x, eye.y, eye.z, 0)) light = Math.min(light, sp.light(eye.x, eye.z));
      }
      open += (light - open) * (1 - Math.exp(-dt * (light > open ? ADJUST.brighter : ADJUST.darker)));
      sky.open = Math.max(0.02, open);
      ROCK.uSkyFill.value = 1 / sky.open;
      sound.setEnclosed(1 - open);

      // The lamp: on in the dark, unless you say otherwise.
      const nowDark = dark ? open < DARK[1] : open < DARK[0];
      if (nowDark !== dark) {
        dark = nowDark;
        byHand = null;
        if (dark && !told) {
          told = true;
          hud.flash('on goes your headlamp · K to switch it off');
        }
      }
      lamp.update(dt, byHand ?? dark, camera);

      // The cave's name as you go in (the tracker says so itself if this is
      // where you were heading), and that you've been.
      const sp = player.space;
      if (sp && sp.cave && sp !== was && !was) {
        if (!game.marks || game.marks.tracked !== sp.cave.id) hud.flash(sp.cave.name);
        if (!visited.has(sp.cave.id)) {
          visited.add(sp.cave.id);
          save.touch();
        }
      }
      was = sp;
    },
  });
}
