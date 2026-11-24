// Washington, DC: picked on the map, `go here` sets you down in front of the
// Capitol, and the city stands up round you, life size: its buildings with
// their surveyed roofs, its streets and sidewalks, its street trees. A walk
// along the pavement, on the ground and not through it; the Capitol counted
// as been to; a wall that stops you; and over a bridge, on its deck and not
// down in the creek under it.
//
// Needs: nothing in particular (the city is on the map from anywhere).
// Leaves: you on a bridge over Rock Creek, by the zoo.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, key, shot }) {
  await step('to the Capitol, from the map', async () => {
    await key('KeyM');
    const place = await page.evaluate(() => {
      const p = world.map.places.get('washington:capitol');
      world.map.centerOn(p.x, p.z);
      world.map.selectPlace(p.id);
      return p;
    });
    assert.ok(place, 'the Capitol is on the map');
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), 'United States Capitol', 'by name');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((p) => T.until(() => Math.hypot(world.player.pos.x - p.x, world.player.pos.z - p.z) < 40, 180000), place);
    assert.ok(there, 'go here sets you down in front of it');
    // and the city stands up round you, a tile at a time
    const up = await page.evaluate(() => T.until(() => world.washington.tiles().settled, 180000));
    assert.ok(up, 'the city stands up round you');
    const city = await page.evaluate(() => {
      const t = world.washington.tiles();
      let tris = 0;
      let trees = 0;
      for (const o of world.scene.children) {
        if (!o.name.startsWith('washington ')) continue;
        o.traverse((m) => {
          if (m.isInstancedMesh) trees += m.count;
          else if (m.isMesh) tris += m.geometry.index.count / 3;
        });
      }
      return { tiles: t.up.length, tris, trees };
    });
    assert.ok(city.tris > 100000, `its buildings and streets (${city.tris} triangles)`);
    assert.ok(city.trees > 200, `its street trees (${city.trees})`);
    assert.ok(await page.evaluate(() => T.until(() => world.washington.landmarks().find((m) => m.id === 'capitol').been, 10000)), 'the Capitol, been to');
    await frames(30);
    await shot('the Capitol');
    return city;
  });

  await step('along the pavement', async () => {
    const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    await page.keyboard.down('KeyW');
    await frames(120);
    await page.keyboard.up('KeyW');
    const to = await page.evaluate(() => ({ x: world.player.pos.x, y: world.player.pos.y, z: world.player.pos.z, ground: world.chunks.heightAt(world.player.pos.x, world.player.pos.z) }));
    const walked = Math.hypot(to.x - from.x, to.z - from.z);
    assert.ok(walked > 3, `on along it (${walked.toFixed(1)} m)`);
    assert.ok(Math.abs(to.y - to.ground) < 1.2, 'on the ground, not through it');
    return { walked: Math.round(walked * 10) / 10 };
  });

  await step('a wall stops you', async () => {
    // the nearest long, tall wall to where you arrive at the White House:
    // stand 5 m out from it, out of doors, facing it, and walk at it
    const wall = await page.evaluate(async () => {
      await world.washington.go('white-house');
      const { x, z } = world.player.pos;
      let [best, bd] = [null, Infinity];
      world.solids.forEachNear(x, z, 200, (s) => {
        if (!s.wall || Math.hypot(s.bx - s.ax, s.bz - s.az) < 6 || Math.min(s.topA, s.topB) - s.bottom < 6) return;
        const d = Math.hypot((s.ax + s.bx) / 2 - x, (s.az + s.bz) / 2 - z);
        if (d < bd) [best, bd] = [s, d];
      });
      const [mx, mz] = [(best.ax + best.bx) / 2, (best.az + best.bz) / 2];
      const l = Math.hypot(best.bx - best.ax, best.bz - best.az);
      const [nx, nz] = [-(best.bz - best.az) / l, (best.bx - best.ax) / l];
      // (its outside: no roof over it there)
      const k = [1, -1].find((k) => world.washington.at(mx + nx * k, mz + nz * k) !== 'a building' && world.washington.at(mx + nx * k * 5, mz + nz * k * 5) !== 'a building');
      const yaw = Math.atan2(-nx * k, -nz * k);
      world.player.spawn(mx + nx * k * 5, mz + nz * k * 5, yaw, yaw + Math.PI);
      return { ax: best.ax, az: best.az, bx: best.bx, bz: best.bz };
    });
    await frames(10);
    await page.keyboard.down('KeyW');
    await frames(240);
    await page.keyboard.up('KeyW');
    const end = await page.evaluate((w) => {
      const { x, z } = world.player.pos;
      const [dx, dz] = [w.bx - w.ax, w.bz - w.az];
      const t = Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / (dx * dx + dz * dz)));
      return { inside: world.washington.at(x, z) === 'a building', off: Math.hypot(x - w.ax - dx * t, z - w.az - dz * t) };
    }, wall);
    assert.ok(!end.inside, 'walked at it, you stay out of the building');
    assert.ok(end.off < 1.5, `and stop against its wall (${end.off.toFixed(2)} m from it)`);
    await shot('against a wall');
    return { off: Math.round(end.off * 100) / 100 };
  });

  await step('over a bridge, on its deck', async () => {
    // Rock Creek's valley, between Adams Morgan and the zoo: Calvert Street
    // and Connecticut Avenue cross it on bridges 30 m and more over the creek
    const deck = await page.evaluate(async () => {
      const c = world.landforms.cards.find((q) => q.id === 'washington-dc');
      const [x0, z0] = [c.at[0] - 3100, c.at[1] - 3100];
      await world.washington.standUp(x0, z0);
      world.player.spawn(x0, z0, 0);
      // the deck nearest there highest over the ground under its middle
      const best = world.washington
        .decks()
        .map((d) => {
          const [x, z] = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
          return { x, z, over: Math.max(d.a[2], d.b[2]) - world.gen.height(x, z), near: Math.hypot(x - x0, z - z0) };
        })
        .filter((d) => d.near < 400)
        .sort((a, b) => b.over - a.over)[0];
      world.player.spawn(best.x, best.z, 0, Math.PI, 1e4);
      await T.frames(20);
      return { y: world.player.pos.y, ground: world.gen.height(best.x, best.z), over: best.over };
    });
    assert.ok(deck.over > 15, `a bridge high over the creek (${deck.over.toFixed(1)} m)`);
    assert.ok(deck.y > deck.ground + 10, `on its deck (${deck.y.toFixed(1)} m), not down by the creek (${deck.ground.toFixed(1)} m)`);
    await frames(20);
    await shot('over Rock Creek');
    return deck;
  });
}
