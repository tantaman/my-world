// Hands: pick up small stones. Boulders stay where they are.

import { REACH, LIFTABLE, stonesIn } from '../constants.js';

export const hands = {
  id: 'hands',
  label: 'hands',
  short: 'hand',

  target(b) {
    const g = b.ground;
    if (!g) return null;
    let rock = null;
    b.chunks.forEachPlant(g.p.x, g.p.z, 1.3, ['rock'], (ch, kind, k, x, y, z, s) => {
      const d = Math.hypot(x - g.p.x, z - g.p.z) - s * 0.6;
      if (!rock || d < rock.d) rock = { ch, kind, k, x, y, z, s, d };
    });
    if (!rock || rock.d > 0.8) return { prompt: '' };
    if (b.dist(rock.x, rock.z) > REACH.hands + rock.s) return { prompt: 'a stone: <i>come closer</i>' };
    if (rock.s > LIFTABLE) return { prompt: 'a boulder: <i>far too heavy to lift</i>', bad: true };
    const n = stonesIn(rock.s);
    return { type: 'rock', ok: true, rock, x: rock.x, z: rock.z, prompt: `<b>click</b> pick up ${n === 1 ? 'a stone' : `${n} stones`}` };
  },

  work(b, t, io) {
    if (io.useTap && t && t.type === 'rock') pickUp(b, t.rock);
    return false;
  },
};

function pickUp(b, rock) {
  b.face(rock.x, rock.z);
  b.swing('bend', 0.7, 0.55, () => {
    b.forest.removePlant(rock.ch, 'rock', rock.k);
    const n = stonesIn(rock.s);
    b.gain('stone', n);
    b.sound.sfx('stone');
    b.flash(`+${n} stone${n > 1 ? 's' : ''}`);
  });
}
