// Skateboarding: onto a paved road, F (the act key), and you're on your
// board; W pushes you along it, S brakes, space ollies and W in the air
// kickflips; pointed off the road onto the grass, the wheels dig in and you
// step off; F steps off.
//
// Needs: nothing of what came before. Leaves: you on foot, beside a paved road.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  let paved = null; // the road skated on
  await step('onto a paved road, and onto your skateboard', async () => {
    // the nearest paved road: the roads within a few kilometres surveyed
    // now, rather than waited for a little at a time (the near ones may all
    // run to ghost towns, and be gravel)
    paved = await page.evaluate(async () => {
      const R = world.roads.roads;
      const p = world.player.pos;
      const far = 4000;
      let best = null;
      for (const [ci, cj, dir] of R._candidates(p.x - far, p.z - far, p.x + far, p.z + far)) {
        const road = R.link(ci, cj, dir);
        await new Promise((ok) => setTimeout(ok, 0));
        if (!road || road.surface !== 'paved' || !world.roads.stands(road)) continue;
        const d = Math.hypot(road.x[road.n >> 1] - p.x, road.z[road.n >> 1] - p.z);
        if (!best || d < best.d) best = { id: road.id, d };
      }
      return best && best.id;
    });
    assert.ok(paved, 'a paved road near enough');
    const r = await page.evaluate((id) => world.roads.go(id), paved);
    assert.ok(r, 'onto it');
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 120000 });
    await page.waitForFunction(() => world.roads.shown.size > 0, null, { timeout: 60000 });
    await frames(20);
    const here = await page.evaluate(() => ({ foot: world.player.underfoot && world.player.underfoot.surface, at: world.act.here() && world.act.here().word }));
    assert.equal(here.foot, 'tarmac', 'on its tarmac');
    assert.equal(here.at, 'skate', 'F would put you on your board');
    await key('KeyF');
    const on = await page.evaluate(() => ({ active: world.skateboarding.active, board: !!(world.player.character.stood && world.player.character.stood.board), idle: world.builder.idle, said: document.getElementById('toast').textContent, at: world.act.here().word }));
    assert.ok(on.active, 'on it');
    assert.ok(on.board, 'standing on the board');
    assert.ok(on.idle, 'tools put away');
    assert.match(on.said, /onto your skateboard/);
    assert.equal(on.at, 'step off', 'and F would step off it');
    // what happens as you go, for the report
    await page.evaluate(() => {
      window._skate = [];
      for (const e of ['push', 'takeoff', 'land', 'crash', 'up', 'off']) world.skateboarding.skater.on(e, (...a) => window._skate.push([e, ...a.map((v) => (v && v.air ? v.name : v))]));
    });
    return { road: r && r.id, ...here };
  });

  await step('push along it, ollie and kickflip, and brake', async () => {
    // (up the road, if that's the way you face, slower than down it)
    await page.keyboard.down('KeyW');
    await frames(60);
    await page.evaluate(() => T.until(() => world.skateboarding.skater.speed > 2.5, 6000));
    await page.keyboard.up('KeyW');
    const going = await page.evaluate(() => ({ ...world.skateboarding.state(), readout: document.getElementById('skate').textContent, prompt: T.prompt(), happened: window._skate }));
    await shot('skating');
    assert.ok(going.active, `still on it (${JSON.stringify(going.happened)})`);
    assert.ok(going.speed > 2, `pushing gets you going (${JSON.stringify(going)})`);
    assert.match(going.readout, /km\/h/, 'the speed is shown');
    assert.match(going.prompt, /push.*carve.*brake.*ollie/, `what the keys do (${going.prompt})`);
    // an ollie, and W in the air: a kickflip
    await frames(5);
    await key('Space');
    assert.ok(await page.evaluate(() => T.until(() => !world.skateboarding.skater.grounded, 3000)), 'space pops you off the ground');
    await page.keyboard.down('KeyW');
    await frames(3);
    await page.keyboard.up('KeyW');
    await shot('kickflip');
    assert.ok(await page.evaluate(() => T.until(() => world.skateboarding.skater.grounded, 5000)), 'and down again');
    await frames(5);
    const happened = await page.evaluate(() => window._skate);
    const landed = happened.filter((e) => e[0] === 'land' || e[0] === 'crash').map((e) => e[1]);
    assert.ok(landed.some((n) => /kickflip|edge|wheels up/.test(n)), `the board flipped (${JSON.stringify(landed)})`);
    // S: to a stop
    await page.evaluate(() => T.until(() => world.skateboarding.skater.down < 0, 8000));
    await page.keyboard.down('KeyS');
    const stopped = await page.evaluate(() => T.until(() => world.skateboarding.skater.speed < 0.2, 10000));
    await page.keyboard.up('KeyS');
    assert.ok(stopped, 'S brakes you to a stop');
    return { top: going.kmh, landed, pushes: happened.filter((e) => e[0] === 'push').length };
  });

  await step('roll off onto the grass and the wheels dig in', async () => {
    // pointed across the road, toward whichever side the land is no higher than it
    const side = await page.evaluate(() => {
      const sk = world.skateboarding.skater;
      const u = world.roads.under(sk.x, sk.z);
      if (!u) return null;
      for (const s of [1, -1]) {
        const yaw = Math.atan2(u.dx, u.dz) + (s * Math.PI) / 2;
        const out = 7;
        const lx = sk.x + Math.sin(yaw) * out;
        const lz = sk.z + Math.cos(yaw) * out;
        if (world.chunks.heightAt(lx, lz) <= u.top + 0.05 && !world.roads.under(lx, lz)) return { yaw };
      }
      return null;
    });
    if (!side) return { skipped: 'no low ground beside this stretch of road' };
    await page.evaluate((s) => {
      const sk = world.skateboarding.skater;
      sk.start(sk.x, sk.z, s.yaw, 2, sk.y);
    }, side);
    assert.ok(await page.evaluate(() => T.until(() => !world.skateboarding.active, 10000)), 'off it');
    const said = await page.evaluate(() => document.getElementById('toast').textContent);
    assert.match(said, /board under your arm/, `and it goes under your arm (${said})`);
    assert.equal(await page.evaluate(() => !!world.player.character.stood), false, 'on foot again');
    return { said };
  });

  await step('F onto it and off again', async () => {
    assert.ok(paved, 'the paved road from before');
    await page.evaluate((id) => world.roads.go(id), paved);
    await frames(20);
    assert.equal(await page.evaluate(() => world.act.here() && world.act.here().word), 'skate', 'back on its tarmac, F would put you on your board');
    await key('KeyF');
    assert.ok(await page.evaluate(() => world.skateboarding.active), 'on');
    await key('KeyF');
    const off = await page.evaluate(() => ({ active: world.skateboarding.active, aboard: !!world.player.aboard, said: document.getElementById('toast').textContent }));
    assert.ok(!off.active && !off.aboard, 'off');
    assert.match(off.said, /board under your arm/);
    return off;
  });
}
