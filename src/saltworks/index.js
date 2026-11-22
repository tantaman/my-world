// Walk through the forest gate to claim a slot in Saltworks.
import { ArenaClient } from './client.js';
import { ENTRY, findGate, gateModel } from './gate.js';
import { SaltworksHud } from './hud.js';
import { NAME } from './layout.js';
import { ArenaView, disposeModel } from './view.js';
import { DECK, UNDER } from '../render/uniforms.js';
import { toLocal } from '../landmarks/sites.js';
import { clearOf } from '../spaceport/site.js';
import { VEG_STRIDE } from '../world/flora.js';
import { defineSfx } from '../audio/sfx.js';

const SENS = 0.0022;
const SHOW = 140;
const GLYPH = ['.......', '.#####.', '.#####.', '.#...#.', '.#.#.#.', '.#...#.', '.#...#.'];

defineSfx('saltworks-pulse', (k) => {
  k.tone('triangle', k.t, 690, 110, 0.15, 0.003, 0.35 * k.size);
  k.noise(k.s.pink, k.t, 0.08, [['bandpass', 1600, 0.8]], 0.26 * k.size, 0.002, 0.06);
});

export const after = ['render', 'world', 'player', 'audio', 'build', 'map', 'landmarks', 'towns', 'caves', 'railway', 'spaceport', 'videostore', 'abandoned', 'airports', 'save', 'ui'];

export function installSaltworks(game) {
  const { scene, camera, pipeline, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, landmarks, towns, caves, railway } = game;
  const offLimits = clearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines });
  const site = findGate(gen, player.start, (x0, z0, x1, z1) => offLimits(x0, z0, x1, z1) || map.places.within(x0, z0, x1, z1).length > 0);
  let entrance = null;
  let view = null;
  let client = null;
  let visit = null;
  let previousTrace = null;
  let ambience = null;
  let visible = true;
  const local = {};
  const seat = {
    place(out) {
      Object.assign(out, visit);
    },
  };

  if (site) {
    const place = { id: site.id, ...site.approach, name: NAME, kind: 'arena', note: 'Walk through the gate to join a team', glyph: GLYPH };
    map.places.addSource({
      destinations: () => [place],
      within: (x0, z0, x1, z1) => place.x >= x0 && place.x <= x1 && place.z >= z0 && place.z <= z1 ? [place] : [],
      get: (id) => id === place.id ? place : null,
    });
    const clear = (x, z, margin = 0) => {
      const p = toLocal(site, x, z, local);
      return Math.abs(p.x) < 3.55 + margin && p.z > -1.5 - margin && p.z < 4.2 + margin;
    };
    const near = (x0, z0, x1, z1) => site.x >= x0 - 9 && site.x <= x1 + 9 && site.z >= z0 - 9 && site.z <= z1 + 9;
    grass.addClearing((x0, z0, x1, z1) => near(x0, z0, x1, z1) ? clear : null);
    chunks.on('vegetation', (chunk) => {
      const x = chunk.cx * chunks.size;
      const z = chunk.cz * chunks.size;
      if (!near(x, z, x + chunks.size, z + chunks.size)) return;
      for (const [kind, list] of Object.entries(chunk.vegLists)) {
        for (let i = 0, n = 0; i < list.length; i += VEG_STRIDE, n++) {
          if (list[i + 4] > 0 && clear(list[i], list[i + 2], 0.9)) chunks.hideInstance(chunk, kind, n);
        }
      }
    });
    const protect = { x: site.x, z: site.z, what: 'the Saltworks gate', dig: 4.5, wall: 4.5, footing: 4.5, roof: 4.5, grown: true };
    builder.obstacles.addSource((x, z, r, out) => {
      if (Math.hypot(x - site.x, z - site.z) < r + 6) out.push(protect);
    });
  }

  function enter() {
    if (!save.online) client = new ArenaClient(null, 'You');
    else client = new ArenaClient((packet) => save.say('saltworks', packet, 'server'));
    visit = { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw };
    player.aboard = seat;
    visible = player.character.root.visible;
    player.character.root.visible = false;
    if (!view) view = new ArenaView(camera.aspect);
    view.state = null;
    previousTrace = 0;
    ambience = Object.fromEntries(['ambience', 'wildlife'].map((bus) => [bus, sound.levels[bus] ?? 1]));
    for (const bus of Object.keys(ambience)) sound.volume(bus, 0);
    document.body.classList.add('in-saltworks');
    hud.cue(null);
  }

  function leave() {
    if (!client) return;
    if (client.online) save.say('saltworks', { action: 'leave' }, 'server');
    client = null;
    if (player.aboard === seat) {
      player.aboard = null;
      player.character.root.visible = visible;
      const { x, z } = site.approach;
      player.spawn(x, z, site.yaw, site.yaw + Math.PI);
    }
    document.body.classList.remove('in-saltworks');
    overlay.show(false, input);
    for (const [bus, level] of Object.entries(ambience)) sound.volume(bus, level);
  }

  const overlay = new SaltworksHud(leave);
  const off = save.on('message', ({ ch, from, body }) => {
    if (!client?.online || ch !== 'saltworks' || from !== 'server') return;
    const epoch = client.epoch;
    client.hear(body, performance.now());
    if (client.epoch !== epoch) previousTrace = null;
  });
  commands.add({ id: 'leave-saltworks', keys: ['Backspace', 'PadDown'], group: 'SALTWORKS', label: 'leave the arena', run: leave });
  commands.describe({ group: 'SALTWORKS', help: 'W A S D · mouse', pad: ['PadLS', 'PadRS'], label: 'move and look' });
  commands.describe({ group: 'SALTWORKS', help: 'click · Q', pad: ['PadRT', 'PadUp'], label: 'fire · recharge the pulse marker' });
  commands.describe({ group: 'SALTWORKS', help: 'hold E', pad: ['PadLT'], label: 'activate or disable the relay' });

  builder.idleWhile(() => !!client);
  game.coverWhen(() => !!client);
  game.addSystem({
    name: 'saltworks-controls', phase: 'input',
    update({ dt, now }) {
      if (!client) return;
      const look = input.consumeLook();
      input.consumeZoom();
      const blocked = input.blocked || map.isOpen;
      const { x, y } = blocked ? { x: 0, y: 0 } : input.moveAxes();
      if (!blocked) {
        const stick = input.lookRate();
        client.look.yaw -= look.x * SENS + stick.x * 3.2 * dt;
        client.look.pitch -= look.y * SENS + stick.y * 2 * dt;
      }
      client.update(dt, now, {
        x, z: y, jump: !blocked && input.jumped(),
        fire: !blocked && (input.holding('use') || input.tapped('use')),
        use: !blocked && (input.down('KeyE') || input.holding('alt')),
        reload: !blocked && input.down('KeyQ', 'PadUp'),
      });
      overlay.show(!blocked, input);
      if (!blocked) overlay.update(client, input);
      const state = client.state;
      if (!state) {
        previousTrace = null;
        return;
      }
      const seen = previousTrace;
      previousTrace = state.traces.at(-1)?.id ?? previousTrace ?? 0;
      if (seen === null) return;
      for (const trace of state.traces) {
        if (trace.id <= seen) continue;
        const pos = client.pose?.pos;
        const d = pos ? Math.hypot(pos.x - trace.start.x, pos.z - trace.start.z) : 25;
        sound.sfx('saltworks-pulse', { size: trace.from === state.me ? 1 : Math.max(0.03, 0.7 - d * 0.017) });
      }
    },
  });
  game.addSystem({
    name: 'saltworks-gate', phase: 'world',
    update() {
      if (!site) return;
      const p = player.pos;
      const close = Math.hypot(p.x - site.x, p.z - site.z) < SHOW;
      if (close && !entrance) {
        entrance = gateModel(site, (x, z) => chunks.heightAt(x, z));
        scene.add(entrance.object);
        solids.set(entrance, entrance.solids);
      }
      if (entrance) entrance.object.visible = close;
      if (!close || client || !player.grounded || player.carrier || player.aboard || input.blocked) return;
      const at = toLocal(site, p.x, p.z, local);
      if (Math.abs(at.x) < ENTRY && at.z <= 0.2 && at.z > -1.5 && Math.abs(p.y - site.y) < 1.65) enter();
    },
    dispose() {
      leave();
      off();
      overlay.dispose();
      view?.dispose();
      if (entrance) {
        scene.remove(entrance.object);
        solids.clear(entrance);
        disposeModel(entrance.object);
      }
    },
  });

  game.addSystem({
    name: 'saltworks-view', phase: 'render',
    update({ dt, now }) {
      if (!client || map.isOpen) return;
      view.update(dt, now, client, camera.aspect);
      const kept = [pipeline.haze, pipeline.fogFar, DECK.uDeckCover.value, UNDER.uUnder.value];
      pipeline.haze = 0;
      pipeline.fogFar = 1e7;
      DECK.uDeckCover.value = UNDER.uUnder.value = 0;
      try {
        pipeline.render(view.scene, view.camera, 0.84, 1, dt);
      } finally {
        [pipeline.haze, pipeline.fogFar, DECK.uDeckCover.value, UNDER.uUnder.value] = kept;
      }
    },
  });

  game.provide('saltworks', {
    site,
    get active() { return !!client; },
    get state() { return client?.state ?? null; },
    leave,
    async go() {
      if (!site || player.aboard || player.carrier) return;
      const { x, z, yaw } = site.approach;
      await game.api.teleport(x, z, yaw);
    },
  });
}
