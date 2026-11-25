// Looking under the bonnet: the stats line (frame stats, on the settings
// panel), and helpers for the console.
//
// The stats line ends with what the searches in the background are taking of
// each frame (game/budget.ts) and which of them most: `searching 3.9 ms
// (roads)`. Standing still it should be gone within a couple of minutes of
// the world opening. If it never goes, something is sending for more for
// ever; if it's well over the allowance, a search's steps are too long.
//
//   await world.teleport(120, -40)     jump somewhere, once it has streamed in
//   world.look(yaw, pitch, dist)       point the camera
//   world.stats()                      draw calls, triangles, chunks, plants drawn into shadows
//   world.game.systems                 what runs each frame, in order

import { CONFIG } from '../config.js';

// m round where you're set down that's in hand first (the ground there, and what stands on it)
const SET_DOWN = 200;

export function installDebug(game) {
  const { renderer, pipeline, chunks, grass, player, hud, landforms, budget } = game;
  let show = CONFIG.debug;
  let seconds = 0;
  let frames = 0;
  let searching = 0; // ms the searches have taken since the line was last written...
  const by = {}; // ...and each of them, by name

  hud.setting({ id: 'stats', group: 'PICTURE', label: 'frame stats', get: () => show, set: (on) => (show = on) });

  game.addSystem({
    name: 'debug',
    phase: 'late',
    update({ dt }) {
      seconds += dt;
      frames++;
      searching += budget.spent;
      for (const name in budget.by) by[name] = (by[name] || 0) + budget.by[name];
      if (seconds <= 0.5) return;
      const fps = Math.round(frames / seconds);
      const each = searching / frames;
      let most = '';
      for (const name in by) {
        if (!most || by[name] > by[most]) most = name;
      }
      const jobs = each > 0.05 ? ` · searching ${each.toFixed(1)} ms (${most})` : '';
      for (const name in by) delete by[name];
      seconds = 0;
      frames = 0;
      searching = 0;
      if (!show) return hud.setDebug('');
      const s = chunks.stats();
      const info = renderer.info.render;
      hud.setDebug(
        `${fps} fps · ${pipeline.lowW}×${pipeline.lowH} · ${s.chunks} chunks · ${s.instances} plants · ${grass.tiles.size} grass tiles · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris${jobs}`,
      );
    },
  });

  const frame = () => new Promise((r) => requestAnimationFrame(r));
  Object.assign(game.api, {
    // Resolves once the destination has streamed in.
    async teleport(x, z, yaw = player.yaw, pitch) {
      // (the land there first, where it's fetched: a hike's, the real Earth's)
      while (landforms && !landforms.ready(x - SET_DOWN, z - SET_DOWN, x + SET_DOWN, z + SET_DOWN)) await frame();
      if (Number.isFinite(pitch)) player.camPitch = pitch;
      player.spawn(x, z, yaw, yaw + Math.PI);
      do await frame();
      while (!chunks.isFullyLoaded());
      for (let i = 0; i < 4; i++) {
        grass.update(x, z, Infinity);
        await frame();
      }
      player.spawn(x, z, yaw, yaw + Math.PI);
    },
    look(yaw, pitch, dist) {
      player.camYaw = yaw;
      if (pitch !== undefined) player.camPitch = pitch;
      if (dist !== undefined) player.camDist = player.camDistSmooth = dist;
    },
    stats() {
      const i = renderer.info.render;
      return { calls: i.calls, tris: i.triangles, ...chunks.stats(), grassTiles: grass.tiles.size, low: [pipeline.lowW, pipeline.lowH], shadowPlants: pipeline.casters.count() };
    },
  });
}
