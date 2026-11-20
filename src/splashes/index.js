// Water thrown up as you go through it (see splashes.js): at each step you
// take in it, off your shins as you run, when you land in it or jump out of
// it, and off your arms as you swim.

import { Splashes } from './splashes.js';
import { waterSample } from '../core/geom.js';

// How many drops a step throws: walking, and the more a run adds.
const STEP_DROPS = [7, 16];
// Drops a second off your shins, per m/s you run through water over RUN_SPRAY.
const SPRAY = 22;
const RUN_SPRAY = 2.6; // m/s
const _w = waterSample();

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world', 'player'];
export function installSplashes(game) {
  const { scene, player, chunks } = game;
  const splashes = new Splashes(scene);
  game.provide('splashes', splashes);

  // The water at the player's feet: its surface, and how much a splash
  // there throws up (most in shallow water, where a foot comes down through
  // the surface; less once your legs are under it).
  const here = () => {
    if (player.wade < 0.03 || !chunks.waterAt(player.pos.x, player.pos.z, _w)) return null;
    const d = player.wade;
    return { level: _w.level, much: Math.min(1, d / 0.12) * (1 - 0.55 * Math.min(1, Math.max(0, (d - 0.5) / 0.6))) };
  };
  let side = 1;
  // where a foot (or a hand, swimming) breaks the surface: beside you, a
  // little ahead the way you're going
  const at = (across, ahead) => {
    const s = Math.hypot(player.vel.x, player.vel.z);
    const fx = s > 0.2 ? player.vel.x / s : Math.sin(player.yaw);
    const fz = s > 0.2 ? player.vel.z / s : Math.cos(player.yaw);
    return { x: player.pos.x + fx * ahead - fz * across, z: player.pos.z + fz * ahead + fx * across };
  };

  player.on('footstep', (run) => {
    const w = here();
    if (!w) return;
    side = -side;
    if (player.swimming) {
      if (player.under > 0.4) return; // (under it, nothing breaks the surface)
      // a stroke: water running off the arm as it comes over
      for (const s of [-1, 1]) {
        const p = at(0.4 * s, 0.25);
        splashes.burst(p.x, w.level + 0.05, p.z, w.level, 5, { up: 1.4, spread: 0.6, vx: player.vel.x * 0.5, vz: player.vel.z * 0.5, from: 0.25 });
      }
      return;
    }
    const p = at(0.12 * side, 0.18);
    const n = Math.round((STEP_DROPS[0] + STEP_DROPS[1] * run) * w.much);
    splashes.burst(p.x, w.level + 0.02, p.z, w.level, n, { up: 1.6 + 1.6 * run, spread: 0.6 + 0.7 * run, vx: player.vel.x * 0.45, vz: player.vel.z * 0.45 });
  });
  player.on('land', (strength) => {
    const w = here();
    if (!w) return;
    splashes.burst(player.pos.x, w.level + 0.02, player.pos.z, w.level, Math.round(40 * w.much * (0.5 + strength)), { up: 2.4 + 2 * strength, spread: 1.6, from: 0.3 });
  });
  player.on('jump', () => {
    const w = here();
    if (!w) return;
    splashes.burst(player.pos.x, w.level + 0.02, player.pos.z, w.level, Math.round(18 * w.much), { up: 2.2, spread: 0.9, vx: player.vel.x * 0.5, vz: player.vel.z * 0.5, from: 0.2 });
  });

  let owed = 0;
  game.addSystem({
    name: 'splashes',
    phase: 'world',
    update({ dt }) {
      // running through it, a spray off your shins all the time
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const w = speed > RUN_SPRAY && !player.swimming ? here() : null;
      if (w) {
        owed += (speed - RUN_SPRAY) * SPRAY * w.much * dt;
        const n = Math.floor(owed);
        owed -= n;
        if (n) {
          const p = at(0.1 * side, 0.3);
          splashes.burst(p.x, w.level + 0.05, p.z, w.level, n, { up: 1.8, spread: 0.8, vx: player.vel.x * 0.6, vz: player.vel.z * 0.6, from: 0.2 });
        }
      } else owed = 0;
      splashes.update(dt);
    },
  });
}
