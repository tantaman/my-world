// The roads: onto the nearest one, and it's stood up round you, you stand on
// it (on its tarmac or gravel, or a bridge's boards), and no tree grows on it.
//
// Needs: nothing of what came before. Leaves: you on a road between two towns.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('stand on a road', async () => {
    const r = await page.evaluate(() => world.roads.go());
    assert.ok(r, 'there’s a road near enough');
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 120000 });
    await page.waitForFunction(() => world.roads.shown.size > 0, null, { timeout: 60000 });
    await frames(20);
    const on = await page.evaluate(() => {
      const p = world.player.pos;
      const u = world.roads.under(p.x, p.z);
      return { under: !!u, top: u && +u.top.toFixed(2), y: +p.y.toFixed(2), foot: world.player.underfoot && world.player.underfoot.surface, trees: T.trees(p.x, p.z, 4).length, roads: world.roads.list(1500).length };
    });
    assert.ok(on.under && Math.abs(on.top - on.y) < 0.3, `on the road (${JSON.stringify(on)})`);
    assert.ok(['tarmac', 'gravel', 'boards'].includes(on.foot), `its surface underfoot (${on.foot})`);
    assert.equal(on.trees, 0, 'no tree on the road');
    await shot('road');
    return { road: r.id, ...on };
  });
}
