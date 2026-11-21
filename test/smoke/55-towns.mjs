// Towns: find the nearest one with people in it on the map, track it, go
// there, be said hello to, and walk in through a front door.
//
// Leaves: you back where it found you and nothing tracked on the HUD, so
// what comes after plays as it would without it.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  let town = null;
  const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, yaw: world.player.yaw }));

  await step('find a town on the map', async () => {
    town = await page.evaluate(() => world.towns.list(5000).find((t) => t.people > 0 && t.kind !== 'eerie') || null);
    assert.ok(town, 'a town with people in it within reach');
    // picked off the map, as clicking its badge does
    await key('KeyM');
    await frames(20);
    const card = await page.evaluate((id) => {
      world.map.selectPlace(id);
      return { open: !document.getElementById('place-card').hidden, name: document.getElementById('place-name').textContent, kind: document.getElementById('place-kind').textContent };
    }, town.id);
    assert.ok(card.open && card.name === town.name, `its card shows what it is (${JSON.stringify(card)})`);
    await page.click('[data-act="place-track"]');
    await key('Escape');
    await key('Escape');
    const hud = await page.evaluate(() => document.getElementById('track').textContent);
    assert.ok(hud.includes(town.name), `the HUD points the way to it (${hud})`);
    return { town, card };
  });

  await step('walk into town', async () => {
    const there = await page.evaluate(async (id) => {
      const t = world.towns.towns.byId(id);
      // in at the end of its street, once its buildings are standing
      const u = -t.len / 2 - 12;
      await world.teleport(t.x + Math.cos(t.yaw) * u, t.z - Math.sin(t.yaw) * u, t.yaw + Math.PI / 2);
      await T.until(() => world.towns.shown.has(id) && !world.towns.shown.get(id).queue.length, 60000);
      const e = world.towns.shown.get(id);
      // ...and along it, to the middle
      await world.teleport(t.x, t.z, t.yaw + Math.PI / 2);
      await T.until(() => world.towns.visited.has(id), 5000);
      const toast = document.getElementById('toast').textContent;
      const solids = [...e.built.values()].reduce((n, b) => n + b.solids.length, 0);
      return { built: e.built.size, solids, people: e.people ? e.people.people.length : 0, visited: world.towns.visited.has(id), toast };
    }, town.id);
    assert.ok(there.built > 3 && there.solids > 20, `its buildings stand there, solid (${JSON.stringify(there)})`);
    assert.ok(there.people > 0, 'with people in it');
    assert.ok(there.visited && there.toast.includes(town.name), `and its name comes up as you arrive (${there.toast})`);
    // now it's one of the places nearby
    await key('KeyM');
    await frames(20);
    const listed = await page.evaluate(() => [...document.querySelectorAll('#place-list button')].map((b) => b.dataset.place));
    await key('Escape');
    assert.ok(listed.includes(town.id), 'listed beside the map as somewhere nearby');
    await shot('town');
    return there;
  });

  await step('somebody says hello', async () => {
    const hello = await page.evaluate(async (id) => {
      const e = world.towns.shown.get(id);
      await T.until(() => e.people.people.some((p) => !p.path.length && !p.indoors), 30000);
      const p = e.people.people.find((q) => !q.path.length && !q.indoors);
      p.idle = 60; // (stay put while they're visited)
      await world.teleport(p.x + 2.2, p.z, -Math.PI / 2);
      world.look(Math.PI / 2, 0.2, 4);
      await T.until(() => /“/.test(document.getElementById('toast').textContent), 5000);
      return { toast: document.getElementById('toast').textContent, waving: p.body.waving > 0 };
    }, town.id);
    assert.match(hello.toast, /“.+”/, 'they say something');
    await shot('town-hello');
    return hello;
  });

  await step('in through a front door', async () => {
    const inside = await page.evaluate(async (id) => {
      const e = world.towns.shown.get(id);
      // one whose door is in the middle of its front, to walk straight in at
      const lot = [...e.built.keys()].find((l) => ['store', 'house', 'saloon', 'inn', 'hotel'].includes(l.type) && !l.ruin);
      const fx = Math.sin(lot.yaw);
      const fz = Math.cos(lot.yaw);
      const out = lot.d / 2 + 1.5;
      await world.teleport(lot.x + fx * out, lot.z + fz * out, lot.yaw + Math.PI);
      world.look(lot.yaw, 0.3, 4);
      const down = (type) => dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
      const depth = () => (world.player.pos.x - lot.x) * fx + (world.player.pos.z - lot.z) * fz;
      down('keydown');
      await T.until(() => depth() < lot.d / 2 - lot.front - 1.2, 30000);
      down('keyup');
      await T.frames(10);
      const p = world.player;
      return { type: lot.type, on: p.underfoot && p.underfoot.surface, depth: +depth().toFixed(2), front: +(lot.d / 2 - lot.front).toFixed(2) };
    }, town.id);
    assert.equal(inside.on, 'boards', `you walk in over the threshold onto its floor (${JSON.stringify(inside)})`);
    assert.ok(inside.depth < inside.front, 'and you are inside its walls');
    await shot('town-indoors');
    // and back to where this started, tracking nothing: this part says what
    // comes after it plays as it would without it, and a town left tracked
    // holds the HUD's guide (the first source with one wins, ui/hud.js), so
    // the next feature to point the way somewhere would never get a look in.
    await page.evaluate((p) => {
      world.marks.setTracked(null);
      world.teleport(p.x, p.z, p.yaw);
    }, from);
    return inside;
  });
}
