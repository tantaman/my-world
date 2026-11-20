// The game comes up: a tool bar, a help panel, and a forest streamed in round
// where you arrive.

import assert from 'node:assert/strict';

export default async function ({ page, step, shot }) {
  await step('boot', async () => {
    const f = await page.evaluate(() => ({
      tools: [...document.querySelectorAll('#hotbar .slot')].map((b) => b.querySelector('.long').textContent),
      helpRows: document.querySelectorAll('#help .row').length,
      inventory: document.getElementById('inv').textContent,
      coords: document.getElementById('coords').textContent,
      chunks: world.stats().chunks,
      plants: world.stats().instances,
      spawn: [Math.round(world.player.pos.x), Math.round(world.player.pos.z)],
    }));
    assert.ok(f.tools.length >= 6, 'the tool bar is there');
    assert.ok(f.chunks > 0 && f.plants > 0, 'the forest streamed in');
    await shot('boot');
    return f;
  });
}
