// Old places: pick one off the map, track it, go there, and walk into an old
// cabin.
//
// Leaves: you standing in the nearest old cabin, which may be a long way
// from where you started.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('find an old place', async () => {
    // The places the forest has (old cabins, wells, docks...) are on the map,
    // nearest first beside it. Pick one there, track it, and go. The caves
    // are places too, and many more of them, so start within sight of the
    // nearest old place, or only caves may be listed.
    await page.evaluate(async () => {
      const s = world.landmarks.nearest(null, 4000);
      if (s) await world.teleport(s.x + 60, s.z);
      await T.frames(30);
    });
    await key('KeyM');
    await frames(30);
    const listed = await page.evaluate(() => [...document.querySelectorAll('#place-list button')].map((b) => ({ id: b.dataset.place, name: b.querySelector('.name').textContent, old: !!world.landmarks.sites.byId(b.dataset.place) })));
    assert.ok(listed.length > 0, 'places are listed beside the map');
    const place = listed.find((p) => p.old); // (a cave or a hike may be nearer)
    assert.ok(place, `an old place is among them (${listed.map((p) => p.id).join(', ')})`);
    await page.click(`#place-list button[data-place="${place.id}"]`);
    await frames(5);
    const card = await page.evaluate(() => ({ open: !document.getElementById('place-card').hidden, name: document.getElementById('place-name').textContent }));
    assert.deepEqual(card, { open: true, name: place.name }, 'picking one shows what it is');
    await page.click('[data-act="place-track"]');
    await key('Escape');
    await key('Escape');
    const hud = await page.evaluate(() => document.getElementById('track').textContent);
    assert.ok(hud.includes(place.name), `the HUD points the way to it (${hud})`);
    // ...and there it is, standing in the world
    const there = await page.evaluate(async (id) => {
      const s = world.landmarks.sites.byId(id);
      const back = s.kind === 'canoe' ? 5 : -5;
      await world.teleport(s.x + Math.sin(s.yaw) * back, s.z + Math.cos(s.yaw) * back, s.yaw);
      await T.frames(60);
      const solid = [];
      world.solids.forEachNear(s.x, s.z, 4, (x) => solid.push(x));
      return { shown: world.landmarks.shown.has(id), solids: solid.length, visited: world.landmarks.visited.has(id) };
    }, place.id);
    assert.ok(there.shown && there.solids > 0, `it stands there, solid (${JSON.stringify(there)})`);
    assert.ok(there.visited, 'and you have been there');
    return { place, there };
  });

  await step('walk into an old cabin', async () => {
    const f = await page.evaluate(async () => {
      const c = world.landmarks.nearest('cabin', 4000);
      const s = world.landmarks.sites.byId(c.id);
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      await world.teleport(s.x + fx * 4.5, s.z + fz * 4.5, s.yaw + Math.PI);
      // nothing grows through it
      const inside = T.plants(s.x, s.z, 4, ['pine', 'broad', 'birch', 'bush', 'rock', 'log']).filter((p) => {
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        return Math.abs(dx * fz - dz * fx) < 2.5 && Math.abs(dx * fx + dz * fz) < 2.1;
      });
      // in through the door: W walks where the camera looks
      world.look(s.yaw, 0.35, 5);
      const down = (type) => dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
      down('keydown');
      await T.frames(150);
      down('keyup');
      await T.frames(10);
      const p = world.player;
      const dx = p.pos.x - s.x;
      const dz = p.pos.z - s.z;
      return {
        name: c.name,
        plants: inside.length,
        on: p.underfoot && p.underfoot.surface,
        local: [dx * fz - dz * fx, dx * fx + dz * fz].map((v) => +v.toFixed(2)),
        ground: +(p.pos.y - world.chunks.heightAt(p.pos.x, p.pos.z)).toFixed(2),
      };
    });
    assert.equal(f.plants, 0, 'no tree, bush or stone stands inside it');
    assert.equal(f.on, 'boards', `you walk in over the threshold onto its floor (${JSON.stringify(f)})`);
    assert.ok(Math.abs(f.local[0]) < 2.5 && Math.abs(f.local[1]) < 2.1, 'and you are inside its walls');
    await shot('old-cabin');
    return f;
  });
}
