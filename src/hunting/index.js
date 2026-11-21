// Hunting: a rifle to shoot game with, dressing a kill for its meat,
// roasting the meat on a spit over a campfire, and eating it. Everything
// about it lives in this folder; this plugs it into the game.
//
//   rifle.js      the rifle on the tool bar: shoot, scope, dress, roast
//   shot.js       what a shot along the crosshair hits first
//   quarry.js     what is game, and how much meat each gives
//   carcasses.js  kills lying where they fell, until they're dressed
//   roasting.js   spits over the fires, and how the meat on them cooks
//   models.js     the rifle, the spit and its cuts, a roast to eat
//   scope.js      the dark round view through the scope
//   sound.js      the shot and its echo, the bolt, loading; the sizzle; chewing
//
// What you carry of it (raw meat, roast meat) is in the builder's inventory,
// saved with the rest of what you carry. Spits are yours too ('spits'). The
// kills themselves, like the animals, aren't saved.
//
// From the console:
//   world.hunting.carcasses.list    what you've shot and not yet dressed
//   world.hunting.spits.serialize() what's roasting, and how done
//   world.hunting.targets.list      what else a shot can hit, by whoever put it there

import { Carcasses } from './carcasses.js';
import { Spits, validateSpits } from './roasting.js';
import { rifleTool } from './rifle.js';
import { Targets } from './shot.js';
import { isGame } from './quarry.js';
import { ScopeView } from './scope.js';
import { makeRoast } from './models.js';
import { sizzle } from './sound.js';

const EAT = 2.6; // seconds a meal takes
const MUNCH_EVERY = 0.75; // seconds between mouthfuls
const RELISH = ['that was good', 'smoky, and good', 'you feel better for that', 'not bad at all'];

// The features this uses, so it is installed after them (game/features.js).
// And after blueprints for its place on the tool bar: the rifle comes after
// the plan tool.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'fires', 'wildlife', 'blueprints'];
export function installHunting(game) {
  const { scene, camera, chunks, player, input, hud, commands, save, sound, builder, fires, wildlife } = game;

  // ── What you carry ────────────────────────────────────────────────────────
  // On the HUD's line only while you have some.
  builder.stock.define({ id: 'meat', label: 'raw meat', optional: true });
  builder.stock.define({ id: 'roast', label: 'roast meat', optional: true });

  // ── Kills, and spits ──────────────────────────────────────────────────────
  const carcasses = new Carcasses({ scene, ground: (x, z) => chunks.heightAt(x, z) });
  const spits = new Spits({ scene, fires });
  // Anything besides the animals a shot can hit, from whichever feature put
  // it in the world (see Targets in shot.js).
  const targets = new Targets();
  const hunting = { carcasses, spits, targets };
  game.provide('hunting', hunting);

  // ── The rifle ─────────────────────────────────────────────────────────────
  const scope = new ScopeView(document.getElementById('hud') || document.body);
  const eatHint = () => (input.isTouch ? 'tap eat' : 'U to eat');
  const rifle = builder.register(rifleTool({ wildlife, fires, carcasses, spits, scope, which: (a) => isGame(a.kind), eatHint, targets }));
  hunting.rifle = rifle;
  // its key is wherever its slot is on the tool bar (0 for the tenth)
  const rifleKey = () => {
    const n = builder.slotOf(rifle.id);
    return n <= 10 ? String(n % 10) : 'tool bar';
  };
  commands.describe({ group: 'HUNT', help: rifleKey, label: 'the rifle: click to shoot, hold right-click to look through the scope' });
  commands.describe({ group: 'HUNT', help: 'hold click', label: 'beside a kill: dress it for its meat' });
  commands.describe({ group: 'HUNT', help: 'click', label: 'beside a campfire: roast meat on a spit · right-click: take it off' });

  // ── Eating ────────────────────────────────────────────────────────────────
  player.character.addRaised('food', makeRoast());
  let eating = 0; // seconds of the meal left
  let munch = 0;
  function eat() {
    if (eating > 0) return;
    if (!builder.have('roast', 1)) {
      hud.flash(builder.inv.meat > 0 ? 'nothing roasted to eat · roast your meat on a spit over a campfire' : `nothing to eat · hunt with the rifle (${rifleKey()}), then roast what you get over a campfire`, 2600);
      return;
    }
    builder.spend('roast', 1);
    eating = EAT;
    munch = 0.35;
    player.character.raise('food');
  }
  commands.add({ id: 'eat', keys: ['KeyU'], group: 'HUNT', label: "eat something you've roasted", run: eat });

  // On a touch screen, a button for it, while there's something to eat.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'act-eat';
  btn.hidden = true;
  btn.textContent = 'eat';
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    eat();
  });
  document.getElementById('touch-act')?.prepend(btn);

  // ── Saving ────────────────────────────────────────────────────────────────
  save.register({
    id: 'spits',
    scope: 'yours',
    collect: () => spits.serialize(),
    validate: validateSpits,
    restore: (data) => spits.load(data),
  });
  spits.on('change', () => save.touch());

  sound.addLayer(sizzle(spits));

  // After the fires (world), so a spit roasts over the fire as it is now.
  game.addSystem({
    name: 'hunting',
    phase: 'world',
    update({ dt }) {
      carcasses.update(dt);
      spits.update(dt, camera.position);
      if (eating > 0) {
        eating -= dt;
        munch -= dt;
        if (munch <= 0 && eating > 0.3) {
          sound.sfx('munch');
          munch = MUNCH_EVERY;
        }
        if (eating <= 0) {
          if (player.character.raised === 'food') player.character.raise(null);
          const left = builder.creative ? '' : ` · ${builder.inv.roast} left`;
          hud.flash(`${RELISH[Math.floor(Math.random() * RELISH.length)]}${left}`);
        }
      }
      const show = input.isTouch && (builder.creative || builder.inv.roast > 0);
      if (btn.hidden === show) btn.hidden = !show;
    },
  });
}
