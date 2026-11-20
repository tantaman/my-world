// Blueprints: choose a plan, stake it out among trees on a slope, and let
// the hiker clear, level and build it; copy the cabin down as a plan of your
// own; and have a small one built from nothing, gathering as it goes.
//
// Needs: the cabin (10-build), to keep clear of and to copy. The last step
// starts the world again from nothing, without creative, so a part that
// wants the cabin has to come before this one.

import assert from 'node:assert/strict';

// In the page, beside the play-through's own helpers (T).
export function inPage() {
  const w = window.world;
  // Move the crosshair about, rings out from `from`, until the plan tool's
  // ghost is green and its prompt matches `want`, as you would. Only spots
  // whose 4 × 3 m of ground falls between fall[0] and fall[1] m are tried:
  // with no trees or boulders right on them, or, if `wooded`, with a tree
  // standing on them. -> { x, z, prompt } or null
  T.siteFor = async (from, { r0 = 20, fall = [0, 0.2], want, wooded = false }) => {
    const H = (x, z) => w.chunks.heightAt(x, z);
    const busy = (x, z) => T.trees(x, z, 5).length + T.plants(x, z, 3, ['rock']).length;
    const x0 = Math.round(from.x);
    const z0 = Math.round(from.z);
    let tried = 0;
    for (let r = r0; r < 90; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = x0 + dx;
          const z = z0 + dz;
          const hs = [H(x - 2, z - 1), H(x + 2, z - 1), H(x - 2, z + 2), H(x + 2, z + 2)];
          const f = Math.max(...hs) - Math.min(...hs);
          if (f < fall[0] || f > fall[1] || (wooded ? !T.trees(x, z + 0.5, 2.5).length : busy(x, z + 0.5))) continue;
          if (++tried > 40) return null;
          await T.aimGround(x, z, 7);
          if (new RegExp(want).test(T.prompt())) return { x, z, prompt: T.prompt() };
        }
      }
    }
    return null;
  };
}

export default async function ({ page, step, key, frames, state, shot, open, made }) {
  const { corners, middle } = made.cabin;

  await step('choose a blueprint', async () => {
    await key('Digit9');
    assert.equal(await page.evaluate(() => T.tool()), 9, 'the blueprint tool is in hand');
    const plans = await page.evaluate(() => world.blueprints.list());
    assert.ok(plans.length >= 4, 'plans come with the game');
    await key('Digit9');
    assert.equal(await page.evaluate(() => world.blueprints.library.current.name), plans[1], '9 again: the next plan');
    for (let i = 1; i < plans.length; i++) await key('Digit9');
    assert.equal(await page.evaluate(() => world.blueprints.library.current.name), plans[0], 'and round to the first');
    return { plans };
  });

  const plot = await step('stake one out', async () => {
    // Move the crosshair about until the ghost is green, as you would: well
    // clear of the cabin, among trees, on a slope it will have to level.
    const found = await page.evaluate((m) => T.siteFor(m, { fall: [0.3, 0.9], wooded: true, want: '^click stake out the .*clearing .*levelling' }), middle);
    assert.ok(found, 'somewhere the first plan will go, once cleared and levelled');
    for (let i = 0; i < 4; i++) await page.evaluate(() => T.tap('alt')); // turned all the way round
    await page.evaluate(() => T.tap('use'));
    const site = await page.evaluate(() => world.blueprints.site());
    assert.ok(site, 'a click stakes it out');
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /is staked out/);
    return { at: [site.x, site.z], plan: site.plan.name, ghost: found.prompt, prompt };
  });

  await step('it builds itself', async () => {
    const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    await key('KeyB');
    assert.equal(await page.evaluate(() => world.blueprints.foreman.state), 'working', 'B sets it going');
    // it clears the site, levels it, sets the footings, then lays the first course with each crossing notched in
    const onSite = () =>
      page.evaluate(() => {
        const R = world.blueprints.foreman.placed.rect;
        const on = (p) => p.x > R.x0 - 1.5 && p.x < R.x1 + 1.5 && p.z > R.z0 - 1.5 && p.z < R.z1 + 1.5;
        const F = world.builder.forest;
        return { trees: T.trees((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, 12).filter(on).length, stumps: [...F.stumps.values()].filter(on).length, felled: [...F.felled.values()].filter(on).length };
      });
    const wooded = await onSite();
    assert.ok(wooded.trees > 0, 'a tree stands on the site');
    const levelled = await page.evaluate(() => T.until(() => /footing/.test(world.blueprints.foreman.doing), 120000));
    assert.ok(levelled, `cleared and levelled (it says: "${await page.evaluate(() => T.prompt())}")`);
    assert.deepEqual(await onSite(), { trees: 0, stumps: 0, felled: 0 }, 'nothing left standing or lying on the site');
    const pad = await page.evaluate(() => {
      const f = world.blueprints.foreman;
      return { level: f.site.level, off: Math.max(...f.placed.footings.map((p) => Math.abs(world.chunks.heightAt(p.x, p.z) - f.site.level))), moved: world.builder.terrain.map.size };
    });
    assert.ok(pad.level !== null && pad.moved > 0, 'the ground was moved to a grade');
    assert.ok(pad.off <= 0.031, `every footing's ground is on grade (${pad.off} m off)`);
    const ok = await page.evaluate(() =>
      T.until(() => {
        const b = world.blueprints.foreman.building(world.builder.buildings).b;
        return b && b.footings.size === 4 && b.logs.filter((L) => L.k <= 1 && L.seated).length === 4;
      }, 120000),
    );
    assert.ok(ok, `the first course is in (it says: "${await page.evaluate(() => T.prompt())}")`);
    const walked = await page.evaluate((f) => Math.hypot(world.player.pos.x - f.x, world.player.pos.z - f.z), from);
    assert.ok(walked > 2, 'the hiker walked over to do it');
    // your own keys take the hiker back
    await page.keyboard.down('KeyW');
    await frames(4);
    await page.keyboard.up('KeyW');
    await frames(3);
    const f = await page.evaluate(() => [world.blueprints.foreman.state, world.blueprints.foreman.why]);
    assert.deepEqual(f, ['paused', 'paused: you took over']);
    await shot('blueprint-started');
    return { walked: walked > 2, paused: f[1], cleared: wooded, levelled: { moved: pad.moved, off: Math.round(pad.off * 100) } };
  });

  await page.evaluate(() => T.frames(120));
  await step('the site is remembered', async () => {
    const had = await page.evaluate(() => world.blueprints.site());
    await open('&creative');
    assert.deepEqual(await page.evaluate(() => world.blueprints.site()), had);
    assert.equal(await page.evaluate(() => world.blueprints.foreman.state), 'idle', 'and waits to be asked');
    return { same: true };
  });

  await step('and it finishes the job', async () => {
    // The courses in between go up through the same rules the tools use, as
    // the cabin's did; the foreman lays the top course and raises the roof.
    const filled = await page.evaluate(() => {
      const f = world.blueprints.foreman;
      const B = world.builder.buildings;
      const b = f.building(B).b;
      for (const L of b.logs) for (const n of [...L.below]) B.notch(b, L, n);
      const top = Math.max(...f.placed.logs.map((L) => L.k));
      let n = 0;
      for (const L of f.placed.logs) {
        if (L.k < 2 || L.k >= top || b.logs.some((M) => M.axis === L.axis && M.line === L.line && M.s0 === L.s0 && M.s1 === L.s1 && M.k === L.k)) continue;
        const M = B.addLog(b, L.kind, L.axis, L.line, L.s0, L.s1);
        if (!M) return { failed: [L.axis, L.line, L.s0, L.s1, L.k] };
        for (const c of [...M.below]) B.notch(b, M, c);
        n++;
      }
      return { n };
    });
    assert.ok(!filled.failed, `a log of the plan went up: ${filled.failed}`);
    await key('KeyB');
    assert.equal(await page.evaluate(() => T.tool()), 9, 'B picks the blueprint tool up');
    const done = await page.evaluate(() => T.until(() => !world.blueprints.site(), 90000));
    assert.ok(done, `it finished (it says: "${await page.evaluate(() => T.prompt())}")`);
    const b = await page.evaluate(() => {
      const B = world.builder.buildings.list.find((q) => q.roofs.length);
      return B && { logs: B.logs.length, seated: B.logs.every((L) => L.seated), roofs: B.roofs.length, footings: B.footings.size };
    });
    const plan = await page.evaluate(() => JSON.parse(world.blueprints.export(world.blueprints.list()[0])));
    assert.deepEqual(b, { logs: plan.logs.length, seated: true, roofs: 1, footings: 4 }, 'all of it, notched in and roofed');
    await page.evaluate((p) => T.standAndAim(p.at[0] - 9, p.at[1] - 8, p.at[0], world.chunks.heightAt(p.at[0], p.at[1]) + 1.4, p.at[1]), plot);
    await frames(20);
    await shot('blueprint-built');
    return { filledByRules: filled.n, ...b };
  });

  await step('copy a building down as a blueprint', async () => {
    const at = corners[0];
    await page.evaluate(
      ([m, c]) => {
        const b = world.builder.buildings.list.find((q) => [...q.footings.values()].some((f) => f.x === c[0] && f.z === c[1]));
        return T.standAndAim(m.x, m.z - 5, m.x, b.y0 + 0.8, m.z);
      },
      [middle, at],
    );
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /copy this building down/, `aiming at the cabin (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('use'));
    const kept = await page.evaluate(() => ({ names: world.blueprints.list(), stored: JSON.parse(localStorage.getItem('my-world:blueprints')) }));
    assert.equal(kept.stored.plans.length, 1, 'kept in this browser');
    assert.equal(kept.names.at(-1), kept.stored.plans[0].name);
    assert.equal(kept.stored.plans[0].footings.length, 4);
    return { name: kept.names.at(-1), logs: kept.stored.plans[0].logs.length };
  });

  await step('it gathers what it needs', async () => {
    // From nothing, without creative: two footings and a hewn sill between
    // them want stones, a tree felled and bucked, and its log hewn square.
    await open('&reset&clearbuild');
    const sill = { name: 'A hewn sill', footings: [[0, 0], [4, 0]], logs: [['timber', 'x', 0, 0, 4, 0]], roofs: [] };
    const name = await page.evaluate((p) => world.blueprints.import(JSON.stringify(p)), sill);
    assert.equal(name, sill.name, 'a blueprint taken in from JSON');
    await key('Digit9');
    await page.evaluate((n) => world.blueprints.pick(n), name);
    const before = await state();
    assert.deepEqual([before.inv.log, before.inv.timber, before.inv.stone], [0, 0, 0], 'nothing in hand');
    const found = await page.evaluate(() => T.siteFor(world.player.pos, { r0: 6, want: '^click stake out the A hewn sill \\(4 m timber · 4 stones\\)' }));
    assert.ok(found, 'somewhere level for it');
    await page.evaluate(() => T.tap('use'));
    await key('KeyB');
    const t0 = await page.evaluate(() => world.game.frame.time);
    // everything it turns its hand to, on the way
    const { done, saw } = await page.evaluate(async () => {
      const f = world.blueprints.foreman;
      const seen = new Set();
      const ok = await T.until(() => {
        seen.add(f.doing.split(': ').at(-1));
        return !world.blueprints.site() || f.state !== 'working';
      }, 180000);
      return { done: ok, saw: [...seen] };
    });
    assert.ok(done && !(await page.evaluate(() => world.blueprints.site())), `built (it says: "${await page.evaluate(() => T.prompt())}")`);
    const s = await state();
    assert.equal(s.buildings.length, 1);
    assert.deepEqual([s.buildings[0].footings.length, s.buildings[0].logs.map((L) => L[0])], [2, ['timber']], 'the footings and the sill are in');
    assert.ok(s.stumps.length >= 1, 'a tree was felled for it');
    for (const what of ['picking up a stone', 'felling', 'limbing it', 'bucking it into logs', 'hewing a log square']) {
      assert.ok(saw.some((d) => d.startsWith(what)), `it was seen ${what} (saw: ${saw.join(', ')})`);
    }
    await shot('gathered');
    return { took: Math.round((await page.evaluate(() => world.game.frame.time)) - t0), trees: s.stumps.length, left: s.inv };
  });
}
