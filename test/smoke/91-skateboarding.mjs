// Skateboarding: onto a paved road, F (the act key), and you're on your
// board; W pushes you along it, S brakes, space ollies and W in the air
// kickflips; pointed off the road onto the grass, the wheels dig in and you
// step off; F steps off. Then a jetpack on your back, and W is the jets.
//
// Needs: nothing of what came before. Leaves: you on foot, on or beside the
// paved road nearest the start, the jetpack off your back again.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  let paved = null; // the road skated on
  let along = 0.5; // ...and how far along it (of its length)
  await step('onto a paved road, and onto your skateboard', async () => {
    // back to the start: the part before may have left you somewhere roads
    // keep away from (a real place brought in from a photo)
    await page.evaluate(async () => {
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
    });
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 120000 });
    // a paved road: the roads within a few kilometres surveyed now, nearest
    // first, rather than left to the game's own pace (the near ones may all
    // run to ghost towns, and be gravel). A little each frame, as the game
    // does it: a survey that has to wait for something else to be found
    // can't be run to its end there and then.
    paved = await page.evaluate(async () => {
      const R = world.roads.roads;
      const p = world.player.pos;
      R.prefetch(p.x, p.z, 4000);
      const t0 = performance.now();
      while (performance.now() - t0 < 300000) {
        R.pump(40);
        const found = world.roads.list(5000).find((r) => r.surface === 'paved');
        if (found) return found.id;
        await new Promise((ok) => requestAnimationFrame(ok));
      }
      return null;
    });
    assert.ok(paved, 'a paved road near enough');
    // onto it somewhere along it that's on the ground (its middle may be a
    // bridge, and set down there you'd be set down on the bank beside it)
    let here = null;
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const r = await page.evaluate(([id, f]) => {
        const road = world.roads.list(6000).find((x) => x.id === id);
        return road && world.roads.go(id, road.length * f);
      }, [paved, f]);
      assert.ok(r, 'onto it');
      await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 120000 });
      // the road there stood up, and you on it
      await page.evaluate(() => T.until(() => world.player.grounded && world.player.underfoot, 20000));
      await frames(20);
      here = await page.evaluate(() => {
        const p = world.player.pos;
        const u = world.roads.under(p.x, p.z);
        return { foot: world.player.underfoot && world.player.underfoot.surface, at: world.act.here() && world.act.here().word, p: [p.x, p.y, p.z].map(Math.round), top: u && +u.top.toFixed(2) };
      });
      if (here.foot === 'tarmac') {
        along = f;
        break;
      }
    }
    assert.equal(here.foot, 'tarmac', `on its tarmac (${paved}: ${JSON.stringify(here)})`);
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
    return { road: paved, along, ...here };
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
    await page.evaluate(([id, f]) => world.roads.go(id, world.roads.list(6000).find((x) => x.id === id).length * f), [paved, along]);
    await page.evaluate(() => T.until(() => world.player.grounded && world.player.underfoot, 20000));
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

  await step('a jetpack on your back, and the jets take the board to a silly speed', async () => {
    assert.equal(await page.evaluate(() => world.jetpack.give()), true, 'a jetpack strapped on where you stand');
    await frames(5);
    await key('KeyF');
    assert.ok(await page.evaluate(() => world.skateboarding.active), 'back on your board');
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /W jets/, `the push key is the jets now (${prompt})`);
    // pointed along the road, and down it where it runs down: a carve would do
    // this, and it keeps the tarmac under the wheels while the jets wind up
    const aim = await page.evaluate(() => {
      const sk = world.skateboarding.skater;
      const u = world.roads.under(sk.x, sk.z);
      if (!u) return null;
      const yaw = Math.atan2(u.dx, u.dz);
      const ahead = (s) => world.roads.under(sk.x + Math.sin(yaw) * s * 12, sk.z + Math.cos(yaw) * s * 12);
      const down = (ahead(1)?.top ?? Infinity) <= (ahead(-1)?.top ?? Infinity) ? 1 : -1;
      sk.start(sk.x, sk.z, down > 0 ? yaw : yaw + Math.PI, 0, sk.y);
      return { down };
    });
    assert.ok(aim, 'the board pointed along the road');
    // hold the push, tucked down out of the wind: a kick of the foot, and then
    // the jets catch and shove you along until the road runs out from under you
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    const lit = await page.evaluate(() => T.until(() => world.jetpack.state().pushing, 6000));
    const full = await page.evaluate(() => T.until(() => world.skateboarding.skater.jets > 0.9, 4000));
    // on until it is going properly, or the road runs out from under you
    const fast = await page.evaluate(() => T.until(() => world.skateboarding.session.top > 12 || !world.skateboarding.active, 20000));
    const going = await page.evaluate(() => ({ top: Math.round(world.skateboarding.session.top * 3.6), kmh: world.skateboarding.state().kmh, on: world.skateboarding.active, flying: world.jetpack.state().flying, burn: world.jetpack.state().thrust, swivel: world.jetpack.state().swivel }));
    await shot('jet-skating');
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    assert.ok(lit, 'holding the push, the jets catch');
    assert.ok(full, 'and go full blast, pushing the board along');
    assert.equal(going.flying, false, 'they fly you nowhere: the wheels stay down');
    // stood across the board, the jetpack a quarter turn round on your back
    // points them back along it
    assert.ok(Math.abs(Math.abs(going.swivel) - Math.PI / 2) < 0.35, `the jetpack swung round to point them back along the board (${going.swivel} rad)`);
    // (a foot tops out at 25 km/h, whatever you do with it: PUSH.top, skater.js)
    assert.ok(fast && going.top > 28, `and shove you far past what a foot can (${JSON.stringify(going)})`);
    // let go, and they are out; then the board and the jetpack away again
    await frames(30);
    const after = await page.evaluate(() => ({ pushing: world.jetpack.state().pushing, jets: world.skateboarding.active ? world.skateboarding.skater.jets : 0 }));
    assert.deepEqual(after, { pushing: false, jets: 0 }, 'let go, and the jets are out');
    await page.evaluate(() => world.skateboarding.active && world.skateboarding.off());
    assert.equal(await page.evaluate(() => world.jetpack.give(false)), false, 'and the jetpack off your back again');
    return { top: going.top, downhill: aim.down > 0, burn: going.burn };
  });
}
