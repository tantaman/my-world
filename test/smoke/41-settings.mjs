// The settings panel (O): how the picture looks, the sound, and the hour,
// changed the way a visitor would, with its switches and sliders.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('settings', async () => {
    const open = () => page.evaluate(() => document.getElementById('settings').getAttribute('aria-hidden') === 'false');
    const before = await page.evaluate(() => ({ soft: world.pipeline.softness, on: world.pipeline.enabled, hours: world.sky.hours }));
    await key('KeyO');
    assert.ok(await open(), 'O opens the settings');
    const groups = await page.evaluate(() => [...document.querySelectorAll('#settings h3')].map((h) => h.textContent));
    for (const g of ['PICTURE', 'TIME', 'SOUND']) assert.ok(groups.includes(g), `with the ${g.toLowerCase()} on it (${groups.join(', ')})`);
    await shot('settings');

    // A slider is dragged, a switch clicked.
    const slide = (id, v) =>
      page.evaluate(
        ([i, value]) => {
          const el = document.querySelector(`#settings [data-setting="${i}"]`);
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return el.closest('.settings-row').querySelector('output').textContent;
        },
        [id, v],
      );
    await slide('pixel-softness', before.soft + 0.2);
    await page.click('#settings [data-setting="pixel-art"]');
    const hourShown = await slide('time-of-day', (before.hours + 3) % 24);
    const after = await page.evaluate(() => ({ soft: world.pipeline.softness, on: world.pipeline.enabled, hours: world.sky.hours }));
    assert.ok(after.soft > before.soft, 'the softness slider softens the pixels');
    assert.equal(after.on, !before.on, 'the pixel art switch turns it off');
    assert.ok(Math.abs(after.hours - ((before.hours + 3) % 24)) < 0.1, 'the time of day slider moves the day on');
    assert.match(hourShown, /^\d\d:\d\d$/, 'and says the hour');

    // Put back as they were, and closed with the key that opened it.
    await page.click('#settings [data-setting="pixel-art"]');
    await slide('pixel-softness', before.soft);
    await key('KeyO');
    assert.ok(!(await open()), 'O closes it again');
    await key('KeyO');
    await key('Escape');
    assert.ok(!(await open()), 'and so does Esc');
    await frames(10);
    assert.ok(!(await open()), 'without its key opening it again');
    return { groups, hourShown };
  });
}
