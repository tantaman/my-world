// Where the game is put together.
//
// Everything is a feature (see src/game/game.js). To add one, write its
// install function in a folder of its own and add it to FEATURES below, after
// whatever it needs. Nothing else in this file should have to change.

import { CONFIG } from './config.js';
import { storage, KEYS } from './core/storage.js';
import { Game } from './game/game.js';
import { Settings } from './game/settings.js';
import { WorldSave } from './save/worldSave.js';
import { SignIn } from './save/signIn.js';
import { landOf, NEWEST_LAND } from './world/lands.js';
import { installRender } from './render/index.js';
import { installHud } from './ui/index.js';
import { installWorld } from './world/index.js';
import { installPlayer } from './player/index.js';
import { installAudio } from './audio/index.js';
import { installBuild } from './build/index.js';
import { installFires } from './fires/index.js';
import { installBlueprints } from './blueprints/index.js';
import { installMap } from './map/index.js';
import { installLandmarks } from './landmarks/index.js';
import { installSave } from './save/index.js';
import { installVoice } from './voice/index.js';
import { installWildlife } from './wildlife/index.js';
import { installSplashes } from './splashes/index.js';
import { installMounts } from './mounts/index.js';
import { installDebug } from './game/debug.js';

// In order: each can use what the ones before it provide.
const FEATURES = [installRender, installHud, installWorld, installPlayer, installAudio, installBuild, installFires, installBlueprints, installMap, installLandmarks, installSave, installVoice, installWildlife, installSplashes, installMounts, installDebug];

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
for (const feature of FEATURES) game.use(feature);

// Everything that saves has registered by now; hand back what was kept. This
// happens before the first chunk streams in, so your changes to the world are
// applied as it loads.
save.restore();

// Handy from the dev console: world.teleport(120, -40), world.wildlife.spawn('fox')
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
player.arrive();
loader.done();

// Anything worth knowing about how this world opened.
if (opened && opened.recovered) hud.flash('picked up where you left off');
else if (opened && opened.offline) hud.flash("opened this browser's copy · the save server is out of reach");
else if (save.detail) hud.flash(save.detail, SAY_FOR);

game.start();
