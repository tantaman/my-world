// The panels: M for the map, L for the save panel, H for help. Each opens,
// and closes again.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('map and save panels', async () => {
    const hidden = (id) => page.evaluate((i) => document.getElementById(i).getAttribute('aria-hidden'), id);
    await key('KeyM');
    await frames(30);
    assert.equal(await hidden('map'), 'false', 'M opens the map');
    const drawn = await page.evaluate(() => {
      const c = document.getElementById('map-canvas');
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4000) if (px[i] > 0) n++;
      return n;
    });
    assert.ok(drawn > 10, 'the map is drawn');
    await shot('map');
    await key('Escape');
    assert.equal(await hidden('map'), 'true', 'Esc closes it');
    await key('KeyL');
    assert.equal(await hidden('share'), 'false', 'L opens the save panel');
    await key('Escape');
    assert.equal(await hidden('share'), 'true', 'and Esc closes it');
    await key('KeyH');
    const help = await page.evaluate(() => document.getElementById('help').classList.contains('open'));
    assert.ok(help, 'H opens help');
    await key('KeyH');
    return { drawn: drawn > 10 };
  });
}
