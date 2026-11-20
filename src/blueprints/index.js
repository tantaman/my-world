// Blueprints: plans for buildings, staked out on the ground and put up for
// you. A plan is the same pieces you'd build by hand (a cleared and levelled
// site, footings, logs a course at a time, notches, roofs) and the foreman walks
// the hiker through them with the same tools and rules, gathering what you
// haven't got. Where it can't go on, it stops and says why; put it right and
// carry on.
//
//   plan.js      what a blueprint is; putting one on the ground; what's next
//   grade.js     levelling a site first, when it needs it
//   gather.js    what a plan still needs, and where to get it
//   clear.js     what has to come off the site before it's built on
//   plans.js     the ones that come with the game
//   library.js   those, and the ones you copy from your own buildings
//   foreman.js   the site you staked out; clearing, levelling, gathering for and building it
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
import { levelling, siteGround } from './grade.js';
import { clearable } from './clear.js';
import { PIER } from '../build/constants.js';

const RESURVEY = 0.5; // s between looks at the ground under a staked-out site

const translucent = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });

// The features this uses, so it is installed after them (game/features.js);
// and fires, so that the plan tool comes after the campfire on the tool bar.
export const after = ['render', 'ui', 'world', 'player', 'build', 'fires'];
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

  // Picking the tool again while it's in hand (its number key, again) moves
  // on to the next plan.
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
        hud.flash(`stake out a blueprint first (${builder.slotOf(tool.id)}, then click)`);
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

  // Draw what's left to go up, wherever you are and whatever you hold: at
  // the level the footings will come to, over the grade it will be levelled
  // to if it still needs levelling, with red footings where it can't be.
  let looked = 0;
  let view = null;
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
        view = null;
        return;
      }
      const { b } = foreman.building(buildings);
      looked -= dt;
      if (!view || looked <= 0) {
        view = siteView(builder, foreman, b);
        looked = RESURVEY;
      }
      const { x, z, rot, plan } = foreman.site;
      const built = b ? `${b.footings.size}:${b.logs.length}:${b.roofs.length}:${b.y0}` : '-';
      const pad = view.pad === null ? '-' : view.pad.toFixed(2);
      site.draw(`${plan.name}|${x},${z},${rot}|${built}|${view.y0.toFixed(2)}|${pad}|${[...view.trouble].join(' ')}`, foreman.placed, { y0: b ? b.y0 : view.y0, ground, built: b, trouble: view.trouble, pad: view.pad });
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

// How the staked-out site stands, for drawing it. b: its building, if any.
// -> { y0: the footings' level, pad: the grade still to level to, or null,
//      trouble: 'x,z' of footings that can't reach y0 }
function siteView(builder, foreman, b) {
  const placed = foreman.placed;
  const built = new Set(b ? [...b.footings.values()].map((f) => `${f.x},${f.z}`) : []);
  // trees and stumps on the site will be gone before any levelling
  const ground = siteGround(builder, placed.rect, { ignore: (o) => clearable(o, placed.rect) });
  const lv = levelling(placed, ground, { y0: b ? b.y0 : null, level: foreman.site.level, built, earn: !builder.creative });
  const levelled = lv.level !== null && !b;
  const s = survey(placed, (x, z) => builder.chunks.heightAt(x, z), b ? b.y0 : levelled ? lv.level + PIER.first : null);
  const left = (f) => !f.ok && !built.has(`${f.x},${f.z}`);
  // off-level footings are only trouble if it can't be levelled
  const trouble = new Set(lv.need && !lv.trouble ? [] : s.footings.filter(left).map((f) => `${f.x},${f.z}`));
  return { y0: s.y0, pad: levelled && (lv.need || foreman.levelling) ? lv.level : null, trouble };
}
