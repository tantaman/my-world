// Looking under the bonnet: the stats line (V), and helpers for the console.
//
//   await world.teleport(120, -40)     jump somewhere, once it has streamed in
//   world.look(yaw, pitch, dist)       point the camera
//   world.stats()                      draw calls, triangles, chunks
//   world.game.systems                 what runs each frame, in order

import { CONFIG } from '../config.js';

export function installDebug(game) {
  const { renderer, pipeline, chunks, grass, player, hud, commands } = game;
  let show = CONFIG.debug;
  let seconds = 0;
  let frames = 0;

  commands.add({ id: 'stats', keys: ['KeyV'], group: 'LOOK', label: 'stats', run: () => void (show = !show) });

  game.addSystem({
    name: 'debug',
    phase: 'late',
    update({ dt }) {
      seconds += dt;
      frames++;
      if (seconds <= 0.5) return;
      const fps = Math.round(frames / seconds);
      seconds = 0;
      frames = 0;
      if (!show) return hud.setDebug('');
      const s = chunks.stats();
      const info = renderer.info.render;
      hud.setDebug(
        `${fps} fps · ${pipeline.lowW}×${pipeline.lowH} · ${s.chunks} chunks · ${s.instances} plants · ${grass.tiles.size} grass tiles · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`,
      );
    },
  });

  const frame = () => new Promise((r) => requestAnimationFrame(r));
  Object.assign(game.api, {
    // Resolves once the destination has streamed in.
    async teleport(x, z, yaw = player.yaw) {
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
      return { calls: i.calls, tris: i.triangles, ...chunks.stats(), grassTiles: grass.tiles.size, low: [pipeline.lowW, pipeline.lowH] };
    },
  });
}
