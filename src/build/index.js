// Building: felling trees, moving ground, raising cabins — the tools you do
// it with, and remembering what was done.
//
// To add a tool, write it in tools/ (the contract is at the top of
// builder.js) and register it below. A feature of its own can do the same
// from its install function: game.builder.register(tool).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { growRect } from '../core/geom.js';
import { createVegetationMaterial, createVegetationDepthMaterial } from '../world/materials.js';
import { createBuildingMaterial } from './surfaces.js';
import { TREE_KINDS } from '../world/flora.js';
import { Builder } from './builder.js';
import { TerrainEdits, terrainSave } from './terrainEdits.js';
import { Forestry, forestSave, SPECIES, treeName } from './forestry.js';
import { Buildings, buildingsSave } from './buildings.js';
import { Inventory } from './inventory.js';
import { GradeStake } from './stake.js';
import * as pictures from './pictures.js';
import { Previews } from './previews.js';
import { Chips } from './chips.js';
import { Obstacles } from './obstacles.js';
import { LIFTABLE } from './constants.js';
import { hands } from './tools/hands.js';
import { axe } from './tools/axe.js';
import { shovel } from './tools/shovel.js';
import { footing } from './tools/footing.js';
import { wallTool } from './tools/wall.js';
import { roof } from './tools/roof.js';

// The tools, in order. Those that share a kit share a slot on the tool bar
// and its number key (see Kits in builder.js).
const TOOLS = [hands, axe, shovel, footing, wallTool('log', { label: 'log wall', short: 'log' }), wallTool('timber', { label: 'timber', short: 'hewn' }), roof];

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio'];
export function installBuild(game) {
  const { scene, camera, gen, chunks, grass, solids, player, input, hud, sound, commands, save } = game;

  const wood = createBuildingMaterial(); // what each piece is made of, drawn (surfaces.js)
  const materials = { wood, still: createVegetationMaterial({ sway: false }), stillShadow: createVegetationDepthMaterial({ sway: false }) };

  // ── What has been changed about the world ─────────────────────────────────
  // Edits are laid over whatever the chunk workers grow, as it arrives.
  const terrain = new TerrainEdits(gen, chunks);
  chunks.on('terrain', (ch, buffers) => terrain.patchFresh(ch, buffers));
  chunks.heightOffset = (x, z) => terrain.deltaAt(x, z);

  const forest = new Forestry({ scene, chunks, models: chunks.models, solids, materials });
  chunks.on('vegetation', (ch) => forest.hideRemoved(ch));

  const buildings = new Buildings({ scene, solids, material: wood });
  // the camera stays inside the room you're standing in
  player.cameraBlockers.push((origin, dir, max) => {
    const hit = buildings.raycast(origin, dir, max);
    return hit ? hit.t : Infinity;
  });

  // ── What work has to go round ─────────────────────────────────────────────
  const obstacles = new Obstacles();
  obstacles.addSource((x, z, R, out) => {
    chunks.forEachPlant(x, z, R + 1, TREE_KINDS, (ch, kind, k, px, py, pz, s) => {
      const r = SPECIES[kind].r * s;
      out.push({ x: px, z: pz, what: treeName(kind, chunks.gen.countryAt(px, pz)).a, dig: r + 0.9, wall: r, footing: 0.9, clear: 'fell', grown: true });
    });
    chunks.forEachPlant(x, z, R + 1, ['rock'], (ch, kind, k, px, py, pz, s) => {
      if (s > LIFTABLE) out.push({ x: px, z: pz, what: 'a boulder', dig: s * 1.05, grown: true });
    });
  }, { grown: true });
  obstacles.addSource((x, z, R, out) => {
    for (const s of forest.stumps.values()) {
      if (Math.hypot(s.x - x, s.z - z) < R + 1) out.push({ x: s.x, z: s.z, what: 'a stump', dig: s.r + 0.7, wall: s.r, low: true, footing: s.r + 0.5, clear: 'grub' });
    }
  });
  obstacles.addSource((x, z, R, out) => {
    for (const b of buildings.list) {
      for (const f of b.footings.values()) if (Math.hypot(f.x - x, f.z - z) < R + 1) out.push({ x: f.x, z: f.z, what: 'a footing', dig: 0.62 });
    }
  });

  // ── The bench and its tools ───────────────────────────────────────────────
  const builder = new Builder({
    scene,
    camera,
    chunks,
    player,
    input,
    hud,
    sound,
    grass,
    terrain,
    forest,
    buildings,
    obstacles,
    stake: new GradeStake(scene),
    previews: new Previews(scene, chunks),
    chips: new Chips(scene, chunks),
    inventory: new Inventory({ creative: CONFIG.creative }),
  });
  game.provide('builder', builder);

  builder.on('tools', () => hud.buildTools(builder.kits, { pick: (i) => builder.pick(i), choose: (id) => builder.select(id) }));
  builder.on('select', (tool) => {
    hud.selectTool(builder.slotOf(tool.id) - 1, tool);
    hud.showStake(!!tool.stake);
  });
  for (const tool of TOOLS) builder.register(tool);

  // A tree coming down: the crash, and leaves and bark flying where the crown lands.
  forest.on('crash', (f, speed) => {
    sound.sfx('crash', { strength: Math.min(1, 0.4 + speed * 0.3) });
    const d = forest.axisOf(f);
    const L = SPECIES[f.kind].h * f.s * 0.6;
    const at = new THREE.Vector3(f.x + d.x * L, 0, f.z + d.z * L);
    at.y = chunks.heightAt(at.x, at.z) + 0.6;
    builder.chips.burst(at, 40, 0x3a5a22, 4, 1.8);
    builder.chips.burst(at, 16, 0x6b5a40, 3, 1.2);
  });

  // ── Keys ──────────────────────────────────────────────────────────────────
  // Kits take the number keys in the order they were made, including any a
  // later feature adds: 1 to 9, and 0 for the tenth, as on the keyboard.
  // Pressed again, a key moves on through its kit, and the bar shows what is
  // in it.
  for (let i = 0; i < 10; i++) {
    const n = (i + 1) % 10;
    commands.add({
      id: `tool-${i + 1}`,
      keys: [`Digit${n}`, `Numpad${n}`],
      run() {
        builder.pick(i);
        hud.showKit(i);
      },
    });
  }
  // On a pad, the shoulder buttons go along the tool bar a tool at a time,
  // through each kit in turn (its fan opens to show where you are), and round
  // from the ends.
  const along = (by) => {
    const all = builder.kits.flatMap((k) => k.tools);
    if (!all.length) return;
    const tool = all[(all.indexOf(builder.current) + by + all.length) % all.length];
    builder.select(tool.id);
    hud.showKit(builder.slotOf(tool.id) - 1);
  };
  commands.add({ id: 'tool-before', keys: ['PadLB'], run: () => along(-1) });
  commands.add({ id: 'tool-after', keys: ['PadRB'], run: () => along(1) });
  commands.describe({ group: 'BUILD', help: () => `1 – ${builder.kits.length}`, pad: ['PadLB', 'PadRB'], label: 'pick a tool · again: the next in its kit' });
  commands.describe({ group: 'BUILD', help: 'click', pad: ['PadRT'], label: 'use the tool (hold to keep going)' });
  commands.describe({ group: 'BUILD', help: 'right-click', pad: ['PadLT'], label: 'second action · take down' });
  commands.add({ id: 'stake', keys: ['KeyG', 'PadRight'], group: 'BUILD', label: 'set / pull up a grade stake', icon: pictures.STAKE, run: () => builder.toggleStake() });
  hud.button('act-stake', () => builder.toggleStake());

  // ── Saving ────────────────────────────────────────────────────────────────
  // How each of these is spelled in a save is next to the class that owns it.
  save.register({
    ...terrainSave,
    collect: () => terrain.serialize(),
    restore: (data) => terrain.load(data),
    // Someone else moved ground. It is nudged vertex by vertex, because
    // re-meshing the terrain would be far more work than the edit is.
    adoptOps(ops) {
      const steps = [];
      let bounds = null;
      for (const op of ops) {
        const [, x, z] = op.k.split(':');
        const ix = Number(x);
        const iz = Number(z);
        steps.push(terrain.adopt(ix, iz, op.v ? op.v[0] : null, op.v ? op.v[1] : 0));
        bounds = growRect(bounds, ix, iz);
      }
      terrain.applyLive(steps);
      // the turf changes where the ground does
      if (bounds) grass.invalidate(bounds[0] - 2, bounds[1] - 2, bounds[2] + 2, bounds[3] + 2);
    },
  });
  // The forest and the buildings are simply put up again when someone else
  // changes them — there are only ever a handful of felled trees and cabins,
  // and rebuilding them is cheaper than working out which course moved.
  save.register({ ...forestSave, collect: () => forest.serialize(), restore: (data) => forest.load(data), adopt: (data) => forest.adopt(data) });
  save.register({ ...buildingsSave, collect: () => buildings.serialize(), restore: (data) => buildings.load(data), adopt: (data) => buildings.adopt(data) });
  // What you carry and where your stake is are yours, not the world's.
  save.register({
    id: 'inv',
    scope: 'yours',
    collect: () => builder.stock.amounts,
    validate: (raw) => (raw && typeof raw === 'object' ? raw : {}),
    restore: (data) => builder.stock.load(data),
  });
  save.register({
    id: 'datum',
    scope: 'yours',
    collect: () => builder.stake.datum,
    validate: (raw) => (raw && typeof raw === 'object' ? raw : null),
    restore: (data) => builder.stake.load(data),
  });
  builder.on('change', () => save.touch());

  game.addSystem({ name: 'build', phase: 'update', update: ({ dt }) => builder.update(dt) });
}
