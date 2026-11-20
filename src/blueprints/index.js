// Blueprints: plans for buildings, staked out on the ground and put up for
// you. A plan is the same pieces you'd build by hand (footings, logs a course
// at a time, notches, roofs) and the foreman walks the hiker through them
// with the same tools and rules. Where the ground or the wood won't let it,
// it stops and says why; put it right and carry on.
//
//   plan.js      what a blueprint is; putting one on the ground; what's next
//   plans.js     the ones that come with the game
//   library.js   those, and the ones you copy from your own buildings
//   foreman.js   the site you staked out, and building it for you
//   ghost.js     what's still to go up, drawn where it will stand
//   tool.js      the blueprint tool, 'plan' on the tool bar
//
// What is built is the world's, saved and shared like anything built by
// hand. Which plan you staked out where is yours (the 'blueprint' domain),
// and your own blueprints are kept in this browser for every world.
//
// From the console:
//   world.blueprints.list()                 the plans to hand
//   world.blueprints.export('Small cabin')  one as JSON, to pass on
//   world.blueprints.import(json)           ...and to take one in
//   world.blueprints.rename(from, to) · .remove(name)   your own

import * as THREE from 'three';
import { KEYS } from '../core/storage.js';
import { PLANS } from './plans.js';
import { Library } from './library.js';
import { Foreman, validSite } from './foreman.js';
import { Ghost } from './ghost.js';
import { blueprintTool } from './tool.js';
import { capture, survey } from './plan.js';

const RESURVEY = 0.5; // s between looks at the ground under a staked-out site

const translucent = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });

export function installBlueprints(game) {
  const { scene, builder, player, hud, commands, save, chunks } = game;
  const { buildings } = builder;
  const ground = (x, z) => chunks.heightAt(x, z);

  const library = new Library({ storage: game.storage, key: KEYS.blueprints, builtIn: PLANS });
  const foreman = new Foreman({ player });
  // the site: pale blueprint blue, footings the ground won't take in red
  const site = new Ghost((o) => scene.add(o), translucent(0x9cc8ff, 0.2), translucent(0xe06a4a, 0.5));
  site.visible = false;

  // A word on the HUD, said after this frame's own (picking a tool flashes its name).
  let say = null;

  const copy = (b) => {
    const i = buildings.list.indexOf(b);
    if (i < 0) return;
    const n = library.all.length - library.builtIn.length + 1;
    const kept = library.add(capture(buildings.serialize()[i], `My building ${n}`));
    if (kept) say = `copied down as "${kept.name}": stake it out anywhere`;
  };

  const tool = builder.register(blueprintTool({ library, foreman, ghost: new Ghost((o) => builder.previews.add(o)), copy }));

  // Picking the tool again while it's in hand moves on to the next plan.
  let inHand = builder.current === tool;
  builder.on('select', (t) => {
    if (t === tool) {
      if (foreman.site) say = `the ${foreman.site.plan.name} is staked out`;
      else {
        if (inHand) library.next();
        const n = library.all.length;
        say = `${library.current.name} (${library.index + 1} of ${n})`;
      }
    }
    inHand = t === tool;
  });

  commands.add({
    id: 'blueprint-build',
    keys: ['KeyB'],
    group: 'BUILD',
    label: 'build the staked-out blueprint for you · pause',
    run() {
      if (!foreman.site) {
        hud.flash(`stake out a blueprint first (${builder.tools.indexOf(tool) + 1}, then click)`);
        return;
      }
      if (builder.current !== tool) builder.select(tool.id, true);
      foreman.toggle();
    },
  });

  foreman.on('done', (name) => (say = `the ${name} is finished`));
  foreman.on('change', () => save.touch());
  save.register({
    id: 'blueprint',
    scope: 'yours',
    collect: () => foreman.serialize(),
    validate: validSite,
    restore: (data) => foreman.load(data),
  });

  // Draw what's left to go up, wherever you are and whatever you hold.
  let looked = 0;
  let level = null;
  game.addSystem({
    name: 'blueprints',
    phase: 'world',
    update({ dt }) {
      if (say) {
        hud.flash(say);
        say = null;
      }
      if (!foreman.site) {
        site.visible = false;
        level = null;
        return;
      }
      const { b } = foreman.building(buildings);
      looked -= dt;
      if (!level || looked <= 0) {
        level = survey(foreman.placed, ground, b ? b.y0 : null);
        looked = RESURVEY;
      }
      const trouble = new Set(level.footings.filter((f) => !f.ok).map((f) => `${f.x},${f.z}`));
      const { x, z, rot, plan } = foreman.site;
      const built = b ? `${b.footings.size}:${b.logs.length}:${b.roofs.length}:${b.y0}` : '-';
      site.draw(`${plan.name}|${x},${z},${rot}|${built}|${level.y0.toFixed(2)}|${[...trouble].join(' ')}`, foreman.placed, { y0: b ? b.y0 : level.y0, ground, built: b, trouble });
      site.visible = true;
    },
  });

  game.provide('blueprints', {
    library,
    foreman,
    list: () => library.names(),
    pick: (name) => library.select(name),
    export: (name = library.current.name) => {
      const p = library.all.find((q) => q.name === name);
      return p ? JSON.stringify(p) : null;
    },
    import: (json) => {
      const kept = library.add(typeof json === 'string' ? JSON.parse(json) : json);
      return kept ? kept.name : null;
    },
    rename: (from, to) => library.rename(from, to),
    remove: (name) => library.remove(name),
    site: () => foreman.serialize(),
  });
}
