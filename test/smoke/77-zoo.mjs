// The National Zoo: picked on the map, `go here` sets you down at its gate on
// Connecticut Avenue in Washington, a long way from the forest, and the zoo
// stands up round you: its buildings, its fences and signs, and its animals
// in their pens. Down Olmsted Walk on foot; the flamingos by the path, seen
// and counted; and the cheetahs' fence keeps you out of their yard however
// hard you walk at it.
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
    return { walked: Math.round(walked * 10) / 10 };
  });

  await step('the flamingos, seen', async () => {
    await page.evaluate(() => world.zoo.go('flamingo'));
    const seen = await page.evaluate(() => T.until(() => world.zoo.seen.includes('American flamingo'), 20000));
    assert.ok(seen, 'standing by them, the flamingos are counted as seen');
    await shot('the flamingos');
    return { seen: await page.evaluate(() => world.zoo.seen) };
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
