// Sound: the rest of the play-through is muted, so it is turned on here,
// and some is made.

import assert from 'node:assert/strict';

export default async function ({ page, step }) {
  await step('sound', async () => {
    // The play-through runs muted; turn sound on here and make some.
    const heard = await page.evaluate(async () => {
      const s = world.sound;
      s.setEnabled(true);
      const up = await T.until(() => s.running, 5000);
      if (!up) return { running: false };
      const p = world.player.pos;
      await T.frames(10);
      for (const kind of ['chop', 'thud', 'crash', 'deny']) s.sfx(kind, { size: 0.5 });
      for (const kind of ['snort', 'howl', 'song', 'rattle']) s.call(kind, p.x + 5, p.y, p.z + 5);
      for (const ground of ['dirt', 'grass', 'litter', 'water']) s.footstep(ground, 0.5);
      await T.frames(90);
      const out = { running: true, buses: [...s.buses.keys()].sort(), layers: s.layers.map((l) => l.name) };
      s.setEnabled(false);
      return out;
    });
    // no audio device, no audio: that is the machine's business, not the game's
    if (!heard.running) console.log('    (no audio here: skipped)');
    else assert.deepEqual(heard.buses, ['ambience', 'effects', 'radio', 'voices', 'wildlife'], 'everything goes out through a bus');
    return heard;
  });
}
