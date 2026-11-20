// Talking, in a world that lives in one browser: the keys say why not, and
// the microphone is left alone. (Two people talking is test/together.mjs.)

import assert from 'node:assert/strict';

export default async function ({ page, step, key }) {
  await step('talking needs company', async () => {
    // This world lives in one browser: the keys say so, and nothing is asked
    // of the microphone. (Two people talking is test/together.mjs.)
    await key('KeyC');
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);
    assert.match(toast, /shared world/, 'C says why not');
    const said = await page.evaluate(async () => {
      const v = world.voice;
      await T.frames(30);
      return { mode: v.talk.mode, asked: !!v.mic.track || !!v.mic.asking, radio: !!world.player.character.raisable.radio };
    });
    assert.deepEqual(said, { mode: '', asked: false, radio: true }, 'quiet, no microphone, and a radio on the strap all the same');
    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row')].map((r) => r.textContent));
    await key('KeyH');
    assert.ok(help.some((r) => /hold C.*near/.test(r)) && help.some((r) => /hold X.*radio/.test(r)), 'and the help panel lists both');
    return said;
  });
}
