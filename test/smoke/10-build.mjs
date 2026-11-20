// Building by hand. First what you gather: fell a tree, limb and buck it, hew
// timbers, pick up a stone, dig, fill and set a grade stake. Then, starting
// again with materials to spare (creative), a small cabin: footings, a first
// course laid with the crosshair, notches, walls, a roof.
//
// Leaves: made.cabin = { site, corners, middle }, the cabin standing with
// its roof taken down again, in a world opened with &creative.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, state, shot, open, made }) {
  const tree = await step('fell a tree', async () => {
    const t = await page.evaluate(async () => {
      const p = world.player.pos;
      const tree = T.trees(p.x, p.z, 60).find((t) => t.s > 0.7 && T.trees(t.x, t.z, 3).length === 1);
      const back = 1.5 + tree.s * 0.4;
      const ux = (p.x - tree.x) / tree.d;
      const uz = (p.z - tree.z) / tree.d;
      await T.standAndAim(tree.x + ux * back, tree.z + uz * back, tree.x, tree.y + 1, tree.z);
      return tree;
    });
    await key('Digit2');
    assert.equal(await page.evaluate(() => T.tool()), 2, 'the axe is in hand');
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /chop the/, `aiming at the tree (prompt: "${prompt}")`);
    const fell = await page.evaluate(() => T.hold('use', () => world.builder.forest.felled.size > 0 && !world.builder.forest.falling, 90000));
    assert.ok(fell, 'the tree came down');
    await shot('felled');
    const s = await state();
    assert.equal(s.stumps.length, 1);
    assert.equal(s.removed.length, 1);
    return { kind: t.kind, at: [t.x, t.z], prompt, ...s };
  });

  await step('limb and buck it', async () => {
    const ok = await page.evaluate(async () => {
      const F = world.builder.forest;
      const f = [...F.felled.values()][0];
      const d = F.axisOf(f);
      const along = Math.min(3, F.reach(f) * 0.3);
      const gx = f.x + d.x * along;
      const gz = f.z + d.z * along;
      // stand beside the trunk, not on it
      await T.standAndAim(gx - d.z * 1.7, gz + d.x * 1.7, gx, world.chunks.heightAt(gx, gz), gz);
      return T.hold('use', () => F.felled.size === 0, 120000);
    });
    assert.ok(ok, 'the trunk is all bucked');
    const s = await state();
    assert.ok(s.inv.log > 0, 'logs in hand');
    return { inv: s.inv, felled: s.felled };
  });

  await step('hew timbers', async () => {
    const before = (await state()).inv;
    const ok = await page.evaluate(() => T.hold('alt', () => world.builder.inv.timber >= 1.5, 30000));
    assert.ok(ok, 'timber hewn');
    await frames(60); // let the swing in hand finish
    const inv = (await state()).inv;
    assert.ok(Math.abs(inv.log + inv.timber - before.log - before.timber) < 1e-6, 'a metre of log makes a metre of timber');
    return { wood: inv.log + inv.timber };
  });

  await step('pick up a stone', async () => {
    await key('Digit1');
    const rock = await page.evaluate(async () => {
      const p = world.player.pos;
      const rock = T.plants(p.x, p.z, 80, ['rock']).find((r) => r.s <= 0.75 && T.trees(r.x, r.z, 1.5).length === 0);
      await T.aimGround(rock.x, rock.z, 2.2, p);
      return rock;
    });
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /pick up/, `aiming at the stone (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await page.evaluate(() => T.until(() => world.builder.inv.stone > 0, 10000)), 'a stone in hand');
    const s = await state();
    return { at: [rock.x, rock.z], stone: s.inv.stone, removed: s.removed };
  });

  await step('dig, fill and stake', async () => {
    await key('Digit3');
    await page.evaluate(async () => {
      const p = world.player.pos;
      // open ground a few steps off
      let spot = null;
      for (let r = 6; r < 40 && !spot; r += 3) {
        for (let a = 0; a < 6.28 && !spot; a += 0.5) {
          const x = p.x + Math.sin(a) * r;
          const z = p.z + Math.cos(a) * r;
          if (T.plants(x, z, 5, ['pine', 'broad', 'birch', 'rock']).length === 0) spot = { x, z };
        }
      }
      await T.aimGround(spot.x, spot.z, 3);
    });
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /dig/, `aiming at the ground (prompt: "${prompt}")`);
    assert.ok(await page.evaluate(() => T.hold('use', () => world.builder.inv.soil > 0.2, 20000)), 'soil dug');
    const dug = await state();
    assert.ok(dug.moved > 0, 'the ground moved');
    assert.ok(await page.evaluate((had) => T.hold('alt', () => world.builder.inv.soil < had - 0.05, 20000), dug.inv.soil), 'soil filled back');
    await key('KeyG');
    const s = await state();
    assert.ok(s.datum, 'a grade stake is set');
    await shot('dug');
    return { movedSome: s.moved > 0, staked: !!s.datum, prompt };
  });

  const gathered = await state();
  await page.evaluate(() => T.frames(120)); // the local copy is written a moment after a change
  await step('gathering is remembered', async () => {
    await open();
    const s = await state();
    assert.deepEqual({ ...s, moved: 0, datum: 0 }, { ...gathered, moved: 0, datum: 0 });
    assert.equal(s.moved, gathered.moved);
    assert.deepEqual(s.datum, gathered.datum);
    return { same: true, tree: tree.kind };
  });

  await open('&reset&clearbuild&creative');

  const site = await step('find a level site', async () => {
    const s = await page.evaluate(() => {
      const p = world.player.pos;
      const H = (x, z) => world.chunks.heightAt(x, z);
      const wet = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
      const x0 = Math.round(p.x);
      const z0 = Math.round(p.z);
      for (let r = 2; r < 70; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = x0 + dx;
            const z = z0 + dz;
            const hs = [H(x, z), H(x + 4, z), H(x, z + 3), H(x + 4, z + 3)];
            if (Math.max(...hs) - Math.min(...hs) > 0.08) continue;
            if (T.plants(x + 2, z + 1.5, 6, ['pine', 'broad', 'birch', 'rock']).length) continue;
            if (world.chunks.waterAt(x + 2, z + 1.5, wet) && wet.depth > -0.5) continue;
            return { x, z };
          }
        }
      }
      return null;
    });
    assert.ok(s, 'somewhere level to build');
    return s;
  });
  const corners = [[0, 0], [4, 0], [0, 3], [4, 3]].map(([dx, dz]) => [site.x + dx, site.z + dz]);
  const middle = { x: site.x + 2, z: site.z + 1.5 };

  await step('set four footings', async () => {
    await key('Digit4');
    const prompts = [];
    for (const [x, z] of corners) {
      await page.evaluate(([gx, gz, m]) => T.aimGround(gx, gz, 2.6, m), [x, z, middle]);
      prompts.push(await page.evaluate(() => T.prompt()));
      const n = await page.evaluate(() => (world.builder.buildings.list[0] ? world.builder.buildings.list[0].footings.size : 0));
      const ok = await page.evaluate((had) => T.hold('use', () => (world.builder.buildings.list[0] ? world.builder.buildings.list[0].footings.size : 0) > had, 15000), n);
      assert.ok(ok, `a footing at ${x},${z} (prompt: "${prompts.at(-1)}")`);
    }
    const s = await state();
    assert.equal(s.buildings.length, 1);
    assert.equal(s.buildings[0].footings.length, 4);
    return { prompts: prompts.map((p) => p.replace(/\d+ cm/, 'N cm')), footings: s.buildings[0].footings.map(([x, z]) => [x, z]) };
  });

  // Lay a log between two nodes with the wall tool, by hand.
  const lay = async (a, b) => {
    const count = () => page.evaluate(() => world.builder.buildings.list[0].logs.length);
    const had = await count();
    await page.evaluate(([gx, gz, m]) => T.aimGround(gx, gz, 2.6, m), [a[0], a[1], middle]);
    await page.evaluate(() => T.tap('use'));
    await page.evaluate(([gx, gz, m]) => T.aimGround(gx, gz, 2.6, m), [b[0], b[1], middle]);
    const prompt = await page.evaluate(() => T.prompt());
    await page.evaluate(() => T.tap('use'));
    await page.evaluate(() => T.tap('alt')); // done with this wall
    assert.equal(await count(), had + 1, `a log from ${a} to ${b} (prompt: "${prompt}")`);
    return prompt;
  };

  await step('lay the first course', async () => {
    await key('Digit5');
    const prompts = [];
    prompts.push(await lay(corners[0], corners[1]));
    prompts.push(await lay(corners[2], corners[3]));
    prompts.push(await lay(corners[0], corners[2]));
    prompts.push(await lay(corners[1], corners[3]));
    const s = await state();
    await shot('first-course');
    return { prompts, logs: s.buildings[0].logs };
  });

  await step('cut the notches', async () => {
    await key('Digit2');
    const loose = () => page.evaluate(() => world.builder.buildings.list[0].logs.filter((L) => !L.seated).length);
    assert.equal(await loose(), 2, 'the two crossing logs ride high');
    const prompts = [];
    for (const [x, z] of corners) {
      await page.evaluate(([gx, gz, m]) => T.standAndAim(m.x, m.z, gx, world.builder.buildings.list[0].y0 + 0.3, gz), [x, z, middle]);
      prompts.push(await page.evaluate(() => T.prompt()));
      const cut = () => world.builder.buildings.list[0].logs.reduce((n, L) => n + L.notches.length, 0);
      const had = await page.evaluate(cut);
      const ok = await page.evaluate(([fn, n]) => T.hold('use', () => new Function(`return (${fn})()`)() > n, 15000), [cut.toString(), had]);
      assert.ok(ok, `a notch at ${x},${z} (prompt: "${prompts.at(-1)}")`);
    }
    assert.equal(await loose(), 0, 'everything is notched in');
    return { prompts, logs: (await state()).buildings[0].logs };
  });

  await step('raise the walls and roof it', async () => {
    // The rest of the walls go up through the same rules the tools use; laying
    // twenty more logs by crosshair would only test the crosshair again.
    await page.evaluate(([c]) => {
      const B = world.builder.buildings;
      const b = B.list[0];
      const walls = [['x', c[0][1], c[0][0], c[1][0]], ['x', c[2][1], c[2][0], c[3][0]], ['z', c[0][0], c[0][1], c[2][1]], ['z', c[1][0], c[1][1], c[3][1]]];
      for (let course = 1; course < 6; course++) {
        for (const [axis, line, s0, s1] of walls) {
          const L = B.addLog(b, 'log', axis, line, s0, s1);
          for (const n of [...L.below]) B.notch(b, L, n);
        }
      }
    }, [corners]);
    await key('Digit7');
    await page.evaluate((m) => T.aimGround(m.x, m.z, 1.2), middle);
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /raise the roof/, `aiming into the room (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('use'));
    const s = await state();
    assert.equal(s.buildings[0].roofs.length, 1, 'the roof is on');
    await page.evaluate((m) => T.standAndAim(m.x - 9, m.z - 7, m.x, world.builder.buildings.list[0].y0 + 1.5, m.z), middle);
    await frames(20);
    await shot('cabin');
    return { prompt, logs: s.buildings[0].logs.length, roofs: s.buildings[0].roofs };
  });

  await step('walls keep you out', async () => {
    return page.evaluate(async (m) => {
      // walk at the wall from outside: you should end up stopped against it
      await world.teleport(m.x, m.z - 5, 0);
      world.look(Math.PI, 0.4, 4);
      const down = (type) => dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
      down('keydown');
      await T.frames(150);
      down('keyup');
      await T.frames(10);
      const z = world.player.pos.z;
      return { stoppedOutside: z < m.z - 1.5 && z > m.z - 5 };
    }, middle).then((f) => {
      assert.ok(f.stoppedOutside, 'the wall stopped you');
      return f;
    });
  });

  const built = await state();
  await page.evaluate(() => T.frames(120));
  await step('the cabin is remembered', async () => {
    await open('&creative');
    const s = await state();
    assert.deepEqual(s.buildings, built.buildings);
    return { same: true };
  });

  await step('take the roof down', async () => {
    await key('Digit7');
    await page.evaluate((m) => T.standAndAim(m.x - 9, m.z - 7, m.x - 0.8, world.builder.buildings.list[0].y0 + 2.6, m.z - 1), middle);
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /take the roof down/, `aiming at the roof (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('alt'));
    const s = await state();
    assert.equal(s.buildings[0].roofs.length, 0);
    return { prompt };
  });

  made.cabin = { site, corners, middle };
}
