// The railway: Y opens the stations beside the map; pick one and you're on
// its platform; a train comes in, F (the act key) gets you on, it carries you
// to the next station, and F there gets you off onto its platform.
//
// Needs: nothing in particular (a line within reach of wherever you are).
// Leaves: you on a station's platform, the train you came on pulling out.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('take the train', async () => {
    await key('KeyY');
    assert.ok(await page.evaluate(() => world.map.isOpen && world.map.tab === 'rail'), 'Y opens the map on its stations');
    await page.waitForFunction(() => document.querySelectorAll('#rail-panel button[data-station]').length > 0, null, { timeout: 60000 });
    const id = await page.evaluate(() => document.querySelector('#rail-panel button[data-station]').dataset.station);
    await page.click(`#rail-panel button[data-station="${id}"]`);
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 60000 });
    await frames(20);
    const there = await page.evaluate((id) => {
      const st = world.railway.lines.byId(id);
      const p = world.player.pos;
      return { name: st.name, on: world.player.underfoot && world.player.underfoot.surface, d: +Math.hypot(p.x - st.x, p.z - st.z).toFixed(1), map: world.map.isOpen };
    }, id);
    assert.ok(there.on === 'boards' && there.d < 6 && !there.map, `you are on the platform at ${there.name} (${JSON.stringify(there)})`);
    // a train comes in (the clock is moved on, so the play-through doesn't wait)
    await page.evaluate((id) => world.railway.soon(id, 4), id);
    await page.waitForFunction((id) => world.railway.list(80).some((s) => s.id === id && s.due === 0), id, { timeout: 120000 });
    await frames(5);
    assert.match(await page.evaluate(() => T.prompt()), /get on/, 'beside it, F would get you on');
    await key('KeyF');
    const on = await page.evaluate(() => world.railway.aboard);
    assert.ok(on, 'F and you are aboard');
    await shot('aboard');
    // it pulls out with you on it
    await page.waitForFunction(() => {
      const a = world.railway.aboard;
      const e = a && world.railway.trains.get(`${a.line}#${a.train}`);
      return e && e.w.v > 3;
    }, null, { timeout: 120000 });
    const away = await page.evaluate((id) => {
      const st = world.railway.lines.byId(id);
      return Math.hypot(world.player.pos.x - st.x, world.player.pos.z - st.z);
    }, id);
    assert.ok(away > 10, `it carries you off (${away.toFixed(0)} m)`);
    // ...to the next station, where F gets you off onto its platform
    const next = await page.evaluate(() => {
      const a = world.railway.aboard;
      const e = world.railway.trains.get(`${a.line}#${a.train}`);
      world.railway.wait(Math.max(0, e.w.due - 3));
      return e.line.stations[e.w.next].id;
    });
    await page.waitForFunction(() => {
      const a = world.railway.aboard;
      const e = a && world.railway.trains.get(`${a.line}#${a.train}`);
      return e && e.w.at >= 0;
    }, null, { timeout: 120000 });
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 60000 });
    await frames(10);
    await key('KeyF');
    await frames(10);
    const off = await page.evaluate((next) => {
      const st = world.railway.lines.byId(next);
      const p = world.player.pos;
      return { aboard: world.railway.aboard, name: st.name, on: world.player.underfoot && world.player.underfoot.surface, d: +Math.hypot(p.x - st.x, p.z - st.z).toFixed(1) };
    }, next);
    assert.ok(!off.aboard && off.on === 'boards' && off.d < 20, `off at ${off.name}, on its platform (${JSON.stringify(off)})`);
    return { from: there.name, to: off.name };
  });
}
