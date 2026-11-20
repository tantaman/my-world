// The keys that change the look, and the hour.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames }) {
  await step('look settings', async () => {
    const before = await page.evaluate(() => ({ soft: world.pipeline.softness, on: world.pipeline.enabled, hours: world.sky.hours }));
    await key('Equal');
    await key('KeyP');
    const after = await page.evaluate(() => ({ soft: world.pipeline.softness, on: world.pipeline.enabled }));
    assert.ok(after.soft > before.soft, '= softens the pixels');
    assert.equal(after.on, !before.on, 'P turns the pixel art off');
    await key('KeyP');
    await key('Minus');
    await page.keyboard.down('Period');
    await frames(30);
    await page.keyboard.up('Period');
    const hours = await page.evaluate(() => world.sky.hours);
    assert.ok(hours > before.hours, '. moves the day on');
    return { ok: true };
  });
}
