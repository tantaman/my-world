// Where the game is put together.
//
// Everything is a feature (see src/game/game.ts), and features are found, not
// listed: every folder beside this file whose index.js (or index.ts) exports an install
// function is one, and it says there what it has to come after (see
// src/game/features.js). Nothing in this file should have to change to add one.

import { CONFIG } from './config.js';
import { storage, KEYS } from './core/storage.js';
import { Game } from './game/game.ts';
import { featuresIn, inOrder } from './game/features.js';
import { Settings } from './game/settings.js';
import { installDebug } from './game/debug.js';
import { WorldSave } from './save/worldSave.js';
import { SignIn } from './save/signIn.js';
import { landOf, NEWEST_LAND } from './world/lands.js';

// In order: each can use what the ones before it provide.
const FEATURES = inOrder(featuresIn(import.meta.glob('./*/index.{js,ts}', { eager: true })));

const loader = {
  bar: document.getElementById('load-bar'),
  label: document.getElementById('load-label'),
  say(text, fraction) {
    this.label.textContent = text;
    if (fraction !== undefined) this.bar.style.width = `${Math.round(fraction * 100)}%`;
  },
  done() {
    this.bar.style.width = '100%';
    document.getElementById('loader').classList.add('gone');
  },
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
// ms a word about how the world opened stays up: long enough to read a sentence
const SAY_FOR = 6000;
// ms at most that the opening waits for code a feature needs before you're
// set down (game.beforeArrival): past that you arrive without it
const ARRIVAL_WAIT = 8000;
// ms at most that it waits for what's to be done before the world is shown
// (game.beforeShown: the shaders compiled): past that it's shown anyway
const SHOW_WAIT = 15000;
// frames drawn behind the loader before it goes: whatever the first picture
// still had to compile is compiled in them, not in front of you
const FIRST_FRAMES = 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Which world? ─────────────────────────────────────────────────────────────
// ?w=<id> opens a world kept on the save server. Its seed and its land live
// inside the save, so this has to be settled before the forest is grown from
// them. The server lets in only people it knows, so a browser it doesn't know
// is asked for a name and a password first. If the world can't be opened we
// fall through to an ordinary local world, and the save says why. A world
// that is only local is grown on the newest land unless ?land says otherwise.
const save = new WorldSave({ storage, who: new SignIn() });
if (CONFIG.worldId) loader.say('opening your world…');
const opened = await save.open(CONFIG.worldId);
const chosen = !opened && CONFIG.land > 0;
if (opened) Object.assign(CONFIG, { seed: opened.seed, land: opened.land });
else CONFIG.land = landOf(CONFIG.land, NEWEST_LAND);
save.begin({ seed: CONFIG.seed, land: CONFIG.land, fresh: CONFIG.reset, clear: CONFIG.clearBuild, chosen });

// ── The game ─────────────────────────────────────────────────────────────────
const game = new Game({ config: CONFIG, storage });
game.provide('save', save);
game.provide('settings', new Settings(storage, KEYS.settings, { fresh: CONFIG.reset }));
for (const feature of FEATURES) await game.use(feature.install).settled();
game.use(installDebug); // the game's own, last: the stats line, and the console's helpers

// Everything that saves has registered by now; hand back what was kept. This
// happens before the first chunk streams in, so your changes to the world are
// applied as it loads.
save.restore();

// Handy from the dev console: world.teleport(120, -40), world.wildlife.spawn('fox'),
// and world.features for what was installed, in order.
game.api.features = FEATURES.map((feature) => feature.name);
window.world = game.api;

// ── Opening ──────────────────────────────────────────────────────────────────
// Stream the forest in with a progress bar so the page never freezes.
const { chunks, grass, player, hud } = game;
const at = player.arrival;
await nextFrame();
do {
  chunks.update(at.x, at.z, 45);
  const p = chunks.progress();
  loader.say(p < 1 ? 'growing the forest…' : 'laying down the grass…', p * 0.9);
  await nextFrame();
} while (!chunks.isFullyLoaded());
for (let i = 0; i < 6; i++) {
  grass.update(at.x, at.z, 40);
  await nextFrame();
}
// (and what's fetched only when it's wanted, where it's wanted at once:
// a feature whose save left you standing on something it builds says so)
await Promise.race([Promise.all(game.arrivals), wait(ARRIVAL_WAIT)]);
player.arrive();

// The first pictures are drawn behind the loader, so that the world is
// shown moving, not frozen while the graphics card gets ready for it.
loader.say('getting the picture ready…', 0.95);
await Promise.race([game.readyToShow(), wait(SHOW_WAIT)]);
game.start();
for (let i = 0; i < FIRST_FRAMES; i++) await nextFrame();
loader.done();

// Anything worth knowing about how this world opened.
if (opened && opened.recovered) hud.flash('picked up where you left off');
else if (opened && opened.offline) hud.flash("opened this browser's copy · the save server is out of reach");
else if (save.detail) hud.flash(save.detail, SAY_FOR);
