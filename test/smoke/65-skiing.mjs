// Skiing: walk down a steep snowy slope and find your skis on, ski on down,
// brake, turn, jump, hear it, swap them for a snowboard, fall into a boulder,
// and take them off again.
//
// Leaves: you on foot, on the mountain.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  // Somewhere steep with snow on it and more below, near the start, and
  // nothing in the way for a good way down.
  const spots = await page.evaluate(() => {
    const { gen, player } = world;
    const h = (x, z) => gen.height(x, z);
    const fall = (x, z) => {
      const gx = (h(x + 1, z) - h(x - 1, z)) / 2;
      const gz = (h(x, z + 1) - h(x, z - 1)) / 2;
      const g = Math.hypot(gx, gz);
      return { g, x: -gx / g, z: -gz / g };
    };
    const snowy = (x, z) => gen.snow(x, z, h(x, z)) > 0.9;
    const s0 = player.start;
    const found = [];
    for (let r = 60; r < 2000 && found.length < 20; r += 15) {
      const n = Math.ceil((Math.PI * 2 * r) / 15);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = s0.x + Math.cos(a) * r;
        const z = s0.z + Math.sin(a) * r;
        if (!snowy(x, z)) continue;
        const f = fall(x, z);
        if (f.g < 0.45 || f.g > 0.8) continue;
        // and it goes on down, snowy and steep, for a good way
        let ok = true;
        for (let d = 8; d <= 48 && ok; d += 8) {
          const px = x + f.x * d;
          const pz = z + f.z * d;
          ok = snowy(px, pz) && fall(px, pz).g > 0.3 && fall(px, pz).g < 0.9;
        }
        if (ok && !found.some((p) => Math.hypot(p.x - x, p.z - z) < 40)) found.push({ x: x - f.x * 2, z: z - f.z * 2, yaw: Math.atan2(f.x, f.z) });
      }
    }
    return found;
  });
  assert.ok(spots.length, 'there is steep snow within reach of the start');
  let spot = null;
  for (const s of spots) {
    const clear = await page.evaluate(async (s) => {
      await world.teleport(s.x, s.z, s.yaw);
      let hit = false;
      for (let d = 0; d < 45 && !hit; d += 1) {
        world.chunks.forEachCollider(s.x + Math.sin(s.yaw) * d, s.z + Math.cos(s.yaw) * d, (cx, cz, cr) => {
          const ex = cx - s.x;
          const ez = cz - s.z;
          const along = ex * Math.sin(s.yaw) + ez * Math.cos(s.yaw);
          const across = Math.abs(ex * Math.cos(s.yaw) - ez * Math.sin(s.yaw));
          if (along > 0 && across < cr + 1.5) hit = true;
        });
      }
      return !hit;
    }, s);
    if (clear) {
      spot = s;
      break;
    }
  }
  assert.ok(spot, 'and a clear run down it');

  await step('walk down steep snow and the skis go on', async () => {
    await page.evaluate(async (s) => {
      await world.teleport(s.x, s.z, s.yaw);
      world.look(s.yaw + Math.PI, 0.35, 6);
      await T.frames(5);
    }, spot);
    assert.equal(await page.evaluate(() => world.skiing.active), false, 'standing still, on foot');
    await page.keyboard.down('KeyW');
    const on = await page.evaluate(() => T.until(() => world.skiing.active, 15000));
    await page.keyboard.up('KeyW');
    assert.ok(on, 'heading down it, the skis go on');
    await frames(2);
    const s = await page.evaluate(() => ({ kind: world.skiing.kind, stance: !!world.player.character.stood, idle: world.builder.idle, said: document.getElementById('toast').textContent }));
    // what happens on the way down, for the report
    await page.evaluate(() => {
      window._ski = [];
      for (const e of ['takeoff', 'land', 'crash', 'up']) world.skiing.skier.on(e, (...a) => window._ski.push([e, ...a.map((v) => (v && v.air ? v.name || 'air' : v))]));
    });
    assert.equal(s.kind, 'skis');
    assert.ok(s.stance, 'standing on them');
    assert.ok(s.idle, 'tools put away');
    assert.match(s.said, /skis on/);
    return s;
  });

  await step('ski down, brake, turn and jump', async () => {
    const down = await page.evaluate(async () => {
      let most = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 4000) {
        await T.frames(1);
        most = Math.max(most, world.skiing.state().speed);
      }
      return { most, ...world.skiing.state(), readout: document.getElementById('ski').textContent, prompt: T.prompt(), happened: window._ski };
    });
    await shot('skiing');
    assert.ok(down.most > 6, `picking up speed (${down.most} m/s)`);
    assert.ok(down.run.distance > 15, `and going a good way (${down.run.distance} m)`);
    assert.match(down.readout, /km\/h/, 'the speed is shown');
    assert.match(down.prompt, /turn.*tuck.*brake.*jump|spin.*flip.*grab|down in the snow/, 'what the keys do, on the snow or in the air');
    // back to the top of the clear run, going steadily, for each of the rest
    const restart = () =>
      page.evaluate(async (s) => {
        if (!world.skiing.active) world.skiing.on('skis');
        world.skiing.skier.start(s.x, s.z, Math.sin(s.yaw) * 6, Math.cos(s.yaw) * 6, s.yaw);
        await T.frames(3);
      }, spot);
    const onSnow = () => page.evaluate(() => T.until(() => world.skiing.skier.grounded && !world.skiing.skier.flying && world.skiing.skier.down < 0, 15000));
    const wait = (ms) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);
    // braking
    await restart();
    assert.match(await page.evaluate(() => T.prompt()), /turn.*tuck.*brake.*jump/);
    await page.keyboard.down('KeyS');
    const slowed = await page.evaluate(() => T.until(() => world.skiing.skier.speed < 3, 10000));
    await page.keyboard.up('KeyS');
    assert.ok(slowed, 'S slows you down');
    // turning
    await restart();
    const before = await page.evaluate(() => world.skiing.skier.heading);
    await page.keyboard.down('KeyD');
    await wait(500);
    await page.keyboard.up('KeyD');
    const after = await page.evaluate(() => world.skiing.skier.heading);
    const turned = Math.atan2(Math.sin(after - before), Math.cos(after - before));
    const now = await page.evaluate(() => ({ ...world.skiing.state(), happened: window._ski }));
    assert.ok(turned < -0.15, `D turns you right (${turned.toFixed(2)} rad; ${JSON.stringify(now)})`);
    // a jump
    await restart();
    await page.evaluate(() => {
      window._air = [];
      world.skiing.skier.on('takeoff', (popped) => window._air.push(['takeoff', popped]));
      world.skiing.skier.on('land', (l) => window._air.push(['land', l.air.time]));
      world.skiing.skier.on('crash', (why) => window._air.push(['crash', why]));
    });
    assert.ok(await onSnow());
    await key('Space');
    const flew = await page.evaluate(() => T.until(() => window._air.some((e) => e[0] !== 'takeoff'), 10000).then(() => window._air));
    assert.deepEqual(flew[0], ['takeoff', true], 'space jumps');
    assert.ok(flew.length > 1, `and back down (${JSON.stringify(flew)})`);
    return { down, turned, flew };
  });

  await step('what it sounds like', async () => {
    // the play-through is muted: sound on, a moment of skiing, and the one-offs
    const heard = await page.evaluate(async () => {
      const s = world.sound;
      s.setEnabled(true);
      const up = await T.until(() => s.running, 5000);
      if (!up) return { running: false };
      for (const kind of ['binding', 'pop', 'powder', 'wipeout', 'knock']) s.sfx(kind, { size: 0.6 });
      await T.frames(60);
      const out = { running: true, buses: [...s.buses.keys()].sort(), layer: s.layers.some((l) => l.name === 'skiing') };
      s.setEnabled(false);
      return out;
    });
    if (!heard.running) console.log('    (no audio here: skipped)');
    else {
      assert.ok(heard.layer, 'the snow and the wind, as you go');
      assert.ok(heard.buses.includes('skiing'), `on a bus of their own (${heard.buses.join(', ')})`);
    }
    return heard;
  });

  await step('swap the skis for a snowboard', async () => {
    await key('Backquote');
    const s = await page.evaluate(() => ({ kind: world.skiing.kind, active: world.skiing.active, board: !!world.player.character.stood.board }));
    assert.deepEqual(s, { kind: 'board', active: true, board: true });
    await frames(40);
    await shot('snowboard');
    return s;
  });

  await step('into a boulder at speed, and over you go', async () => {
    // a boulder near here, and a run at it from a few metres off
    const at = await page.evaluate(async () => {
      const { chunks, skiing, player } = world;
      let rock = null;
      for (let r = 4; r < 200 && !rock; r += 4) {
        for (let a = 0; a < Math.PI * 2 && !rock; a += 0.3) {
          const x = player.pos.x + Math.cos(a) * r;
          const z = player.pos.z + Math.sin(a) * r;
          chunks.forEachCollider(x, z, (cx, cz, cr) => {
            // one standing in the snow, not on the rocks
            const snowy = [0, 1, 2, 3].every((k) => skiing.snowAt(cx + Math.cos(k * 1.57) * (cr + 2), cz + Math.sin(k * 1.57) * (cr + 2)) > 0.7);
            if (!rock && cr >= 0.6 && snowy) rock = { x: cx, z: cz, r: cr };
          });
        }
      }
      if (!rock) return null;
      // from straight uphill of it, so the slope keeps you on line
      const h = (x, z) => chunks.heightAt(x, z);
      let fx = -(h(rock.x + 1, rock.z) - h(rock.x - 1, rock.z));
      let fz = -(h(rock.x, rock.z + 1) - h(rock.x, rock.z - 1));
      const l = Math.hypot(fx, fz) || 1;
      fx /= l;
      fz /= l;
      const back = rock.r + 2.5;
      skiing.skier.start(rock.x - fx * back, rock.z - fz * back, fx * 10, fz * 10, Math.atan2(fx, fz));
      return rock;
    });
    if (!at) return { skipped: 'no boulder near' };
    const fell = await page.evaluate(() => T.until(() => world.skiing.skier.down >= 0, 5000).then(() => window._air.filter((e) => e[0] === 'crash').at(-1) || window._air));
    assert.equal(fell[0], 'crash');
    assert.match(fell[1], /boulder/);
    assert.match(await page.evaluate(() => document.getElementById('toast').textContent), /boulder/);
    const up = await page.evaluate(() => T.until(() => world.skiing.skier.down < 0, 15000));
    assert.ok(up, 'and up again');
    return { fell };
  });

  await step('take them off', async () => {
    await key('KeyI');
    const s = await page.evaluate(() => ({ active: world.skiing.active, stance: world.player.character.stood, aboard: world.player.aboard }));
    assert.deepEqual(s, { active: false, stance: null, aboard: null });
    // back on skis for next time
    await key('Backquote');
    assert.equal(await page.evaluate(() => world.skiing.kind), 'skis');
    // and walking about again, without them coming back on straight away
    await frames(30);
    assert.equal(await page.evaluate(() => world.skiing.active), false);
    return s;
  });
}
