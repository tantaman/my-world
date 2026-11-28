// The National Zoo: picked on the map, `go here` sets you down at its gate on
// Connecticut Avenue in Washington, a long way from the forest, and the zoo
// stands up round you: its buildings, its fences and signs, and its animals
// in their pens. Down Olmsted Walk on foot, on its paving and not down in
// it; the walk's paving stones underfoot, skated along; the flamingos by the
// path, seen and counted; the goats in the yard the map fences, with no
// second fence inside it; and the cheetahs' fence keeps you out of their
// yard however hard you walk at it.
//
// Needs: nothing in particular (the zoo is on the map from anywhere).
// Leaves: you on the path by the cheetahs, at the Cheetah Conservation Station.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('to the zoo, from the map', async () => {
    await key('KeyM');
    const place = await page.evaluate(() => {
      const p = world.map.places.get('zoo:national-zoo');
      world.map.centerOn(p.x, p.z);
      world.map.selectPlace(p.id);
      return p;
    });
    assert.ok(place, 'the zoo is on the map');
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), 'National Zoo', 'by name');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((p) => T.until(() => Math.hypot(world.player.pos.x - p.x, world.player.pos.z - p.z) < 40, 120000), place);
    assert.ok(there, 'go here sets you down at the gate');
    assert.ok(await page.evaluate(() => T.until(() => world.zoo.built, 120000)), 'and the zoo stands up round you');
    const zoo = await page.evaluate(() => {
      const z = world.zoo.built;
      return {
        buildings: z.site.buildings.length,
        exhibits: z.site.exhibits.length,
        pens: z.site.exhibits.filter((e) => e.pen).length,
        animals: z.residents.list.length,
        kinds: new Set(z.residents.list.map((a) => a.kind.name)).size,
        signs: z.signs.length,
      };
    });
    assert.ok(zoo.buildings > 150, `its buildings (${zoo.buildings})`);
    assert.ok(zoo.pens > 50 && zoo.animals > 100 && zoo.kinds > 45, `its animals (${zoo.animals} of ${zoo.kinds} kinds)`);
    assert.ok(zoo.signs > 60, 'a sign at each exhibit');
    await shot('the gate of the National Zoo');
    return zoo;
  });

  await step('down Olmsted Walk', async () => {
    const from = await page.evaluate(() => ({ x: world.player.pos.x, y: world.player.pos.y, z: world.player.pos.z }));
    await page.keyboard.down('KeyW');
    await frames(150);
    await page.keyboard.up('KeyW');
    const to = await page.evaluate(() => ({ x: world.player.pos.x, y: world.player.pos.y, z: world.player.pos.z, ground: world.chunks.heightAt(world.player.pos.x, world.player.pos.z) }));
    const walked = Math.hypot(to.x - from.x, to.z - from.z);
    assert.ok(walked > 4, `on along it (${walked.toFixed(1)} m)`);
    assert.ok(Math.abs(to.y - to.ground) < 1.2, 'on the ground, not through it');
    // and the walk's paving round you lies just over the ground you stand
    // on: a boot's sole, not up round your ankles
    const paving = await page.evaluate(() => {
      const zoo = world.zoo.built;
      const meshes = [];
      zoo.group.traverse((o) => o.isMesh && o.material === zoo.materials.paving && meshes.push(o));
      // the top of the paving at (x, z), or null where there's none
      const top = (x, z) => {
        let best = null;
        for (const m of meshes) {
          const P = m.geometry.attributes.position.array;
          const I = m.geometry.index.array;
          const [ox, oy, oz] = [m.position.x, m.position.y, m.position.z];
          const [qx, qz] = [x - ox, z - oz];
          for (let k = 0; k < I.length; k += 3) {
            const [a, b, c] = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3];
            const d = (P[b + 2] - P[c + 2]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 2] - P[c + 2]);
            if (Math.abs(d) < 1e-9) continue;
            const wa = ((P[b + 2] - P[c + 2]) * (qx - P[c]) + (P[c] - P[b]) * (qz - P[c + 2])) / d;
            const wb = ((P[c + 2] - P[a + 2]) * (qx - P[c]) + (P[a] - P[c]) * (qz - P[c + 2])) / d;
            const wc = 1 - wa - wb;
            if (wa < 0 || wb < 0 || wc < 0) continue;
            const y = oy + wa * P[a + 1] + wb * P[b + 1] + wc * P[c + 1];
            if (best === null || y > best) best = y;
          }
        }
        return best;
      };
      const walk = zoo.site.paths.find((p) => p.name === 'Olmsted Walk');
      const { x: px, z: pz } = world.player.pos;
      const over = [];
      for (let k = 0; k + 3 < walk.pts.length; k += 2) {
        const [ax, az, bx, bz] = walk.pts.slice(k, k + 4);
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
        for (let i = 0; i < n; i++) {
          const [x, z] = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
          if (Math.hypot(x - px, z - pz) > 40) continue;
          const y = top(x, z);
          if (y !== null) over.push(y - world.chunks.heightAt(x, z));
        }
      }
      return over.sort((a, b) => a - b);
    });
    assert.ok(paving.length > 10, `paving along the walk near you (${paving.length} spots)`);
    const middle = paving[paving.length >> 1];
    // (raised where the forest's small bumps, laid over the zoo's land by
    // where in the world it is, would come up between its points)
    assert.ok(middle < 0.15, `the paving is ${middle.toFixed(2)} m over the ground you stand on`);
    assert.ok(paving[0] > -0.02, `and nowhere under it (${paving[0].toFixed(2)} m)`);
    return { walked: Math.round(walked * 10) / 10, paving: Math.round(middle * 100) / 100 };
  });

  await step('Olmsted Walk is paving stones underfoot, and skateable', async () => {
    // What's underfoot on a path is what the map says it's laid with
    // (world/paved.ts), so your footsteps hear it and the wheels roll on it
    // — the walk is paving stones, and the loop and the drives asphalt.
    const here = await page.evaluate(() => {
      const { x, z } = world.player.pos;
      let [yaw, far] = [0, -1];
      for (let k = 0; k < 24; k++) {
        const t = (k / 24) * 2 * Math.PI;
        let d = 2;
        while (d < 60 && world.paved.at(x - Math.sin(t) * d, z - Math.cos(t) * d)) d += 2;
        if (d > far) [yaw, far] = [t, d];
      }
      world.player.spawn(x, z, yaw, yaw);
      return { made: world.paved.at(x, z), far, underfoot: world.player.underfoot ? world.player.underfoot.surface ?? 'built' : null };
    });
    await frames(10);
    assert.equal(here.made, 'stone', 'the walk says it is laid in stone');
    assert.equal(here.underfoot, null, 'with nothing solid there to say it: it is laid on the ground');
    assert.ok(here.far > 10, `with room to roll along it (${here.far} m)`);
    await key('KeyF');
    await frames(10);
    const on = await page.evaluate(() => world.skateboarding.state());
    assert.ok(on.active, 'F, and you are on your board');
    assert.equal(on.surface, 'stone', 'the wheels on the paving stones');
    // (pushed until it has rolled a way: how far a few seconds take it is
    // the frames', and whether the walk runs uphill from here)
    await page.keyboard.down('KeyW');
    await page.evaluate(() => T.until(() => world.skateboarding.state().session.distance > 5, 30000));
    await page.keyboard.up('KeyW');
    const rolled = await page.evaluate(() => world.skateboarding.state());
    assert.ok(rolled.session.distance > 4, `pushed along the walk (${rolled.session.distance.toFixed(1)} m)`);
    await shot('skating Olmsted Walk');
    await key('KeyF');
    await frames(10);
    assert.ok(!(await page.evaluate(() => world.skateboarding.state().active)), 'F again, and it is under your arm');
    return { distance: Math.round(rolled.session.distance) };
  });

  await step('the flamingos, seen', async () => {
    await page.evaluate(() => world.zoo.go('flamingo'));
    const seen = await page.evaluate(() => T.until(() => world.zoo.seen.includes('American flamingo'), 20000));
    assert.ok(seen, 'standing by them, the flamingos are counted as seen');
    await shot('the flamingos');
    return { seen: await page.evaluate(() => world.zoo.seen) };
  });

  await step("the goats, in the yard the map fences, and no other", async () => {
    await page.evaluate(() => world.zoo.go('goat'));
    const goats = await page.evaluate(() => {
      const zoo = world.zoo.built;
      const e = zoo.site.exhibits.find((x) => x.id === 'goat');
      return { walled: !!e.walled, goats: zoo.residents.list.filter((a) => a.exhibit === e).length };
    });
    assert.ok(goats.walled, "their yard is the one the map fences in: it has no fence of its own inside that");
    assert.ok(goats.goats >= 2, `goats in it (${goats.goats})`);
    await shot('the goats at the Kids\' Farm');
    return goats;
  });

  await step("the cheetahs' fence keeps you out", async () => {
    await page.evaluate(() => world.zoo.go('cheetah'));
    await frames(10);
    // walk straight at their yard for a few seconds
    await page.keyboard.down('KeyW');
    await frames(240);
    await page.keyboard.up('KeyW');
    const inPen = await page.evaluate(() => {
      const e = world.zoo.built.site.exhibits.find((x) => x.id === 'cheetah');
      const { x, z } = world.player.pos;
      let c = false;
      for (let i = 0, j = e.pen.length - 1; i < e.pen.length; j = i++) {
        const [ax, az] = e.pen[j];
        const [bx, bz] = e.pen[i];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
      }
      return c;
    });
    assert.equal(inPen, false, 'still outside it');
    await shot('the cheetahs');
  });
}
