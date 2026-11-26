// Buried treasure: on the adventures board, the map unfolding as you set
// off, the hunt begun at the old place it starts from, your paces counted as
// you walk, the mark on the way, a hole in the wrong place, the spade
// striking the chest and the lid lifted, and what was in it kept in your
// pack across a reload.
//
// Needs nothing from earlier parts: it goes back to where the path starts.
// Comes after adventures, whose board it is on. Leaves nothing behind: the
// game is opened again at the end, and only what you found is kept.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, open, shot }) {
  const hunt = () =>
    page.evaluate(() => {
      const h = world.treasure.hunt;
      return h && { stage: h.stage, paces: h.pacer.paces, holes: h.holes.length, digging: !!h.digging, note: h.note(), objective: h.objective() };
    });

  let plan = null;
  await step('the map, as you set off', async () => {
    await page.evaluate(async () => {
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
    });
    await key('KeyN');
    const rows = await page.evaluate(() => [...document.querySelectorAll('#adventures [data-act="go"]')].map((b) => b.dataset.kind));
    assert.ok(rows.includes('treasure'), 'it is on the board');
    await page.click('#adventures [data-kind="treasure"]');
    await frames(10);
    const set = await page.evaluate(() => {
      const c = document.querySelector('#treasure-map canvas');
      const px = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return {
        state: world.adventures.state,
        why: world.hud.toast.textContent,
        plan: world.treasure.plan,
        open: document.getElementById('treasure-map').classList.contains('open'),
        words: [...document.querySelectorAll('#treasure-map .tm-words li')].map((l) => l.textContent),
        inked: px[3],
        banner: document.getElementById('adventure').textContent.replace(/\s+/g, ' ').trim(),
      };
    });
    assert.equal(set.state, 'travel', `sent to where the map starts (${set.why})`);
    plan = set.plan;
    assert.ok(set.open, 'the map unfolds');
    assert.ok(set.inked > 0, 'drawn on');
    assert.equal(set.words.length, 3);
    assert.equal(set.words[0], `Begin at ${plan.start.name}.`);
    assert.match(set.banner, new RegExp(`get to ${plan.start.name}`));
    await shot('treasure-map');
    await key('Escape');
    assert.ok(!(await page.evaluate(() => document.getElementById('treasure-map').classList.contains('open'))), 'Escape folds it up');
    // in your pack, at hand while you're after it
    const hand = await page.evaluate(() => world.pack.list().hand.map((r) => r.word));
    assert.ok(hand.includes('map'), `the map at hand (${hand.join(', ')})`);
    return { start: plan.start.name, legs: plan.legs.map((l) => `${l.paces} ${l.way}`), coins: plan.coins };
  });

  await step('pacing it out from the old place', async () => {
    // to its door: it begins
    const on = await page.evaluate(async (p) => {
      await world.teleport(p.start.x, p.start.z);
      return T.until(() => world.adventures.state === 'on' && world.scene.getObjectByName('treasure-mark'), 30000);
    }, plan);
    assert.ok(on, 'it begins at the old place, with the mark put out on the way');
    let h = await hunt();
    assert.equal(h.stage, 0);
    assert.equal(h.paces, 0, 'standing at it: counting from nothing');
    assert.match(h.objective, new RegExp(`^from ${plan.start.name}, ${plan.legs[0].paces} paces ${plan.legs[0].way}, to `));
    // walk the way the map says, and the paces go up
    const way = plan.legs[0].way;
    await page.evaluate((w) => {
      const i = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'].indexOf(w);
      const a = (i * Math.PI) / 4;
      // (the camera looks along -sin/-cos of its yaw, and W walks where it looks)
      world.look(Math.atan2(-Math.sin(a), Math.cos(a)), 0.3);
    }, way);
    await page.keyboard.down('KeyW');
    const walked = await page.evaluate(() => T.until(() => world.treasure.hunt.pacer.paces >= 5, 30000));
    await page.keyboard.up('KeyW');
    assert.ok(walked, 'paces counted as you walk');
    await frames(5);
    h = await hunt();
    assert.match(h.note, new RegExp(`^\\d+ of ${plan.legs[0].paces} paces · ${way}(, dead on|: bear (left|right))$`), 'and whether you are on the bearing');
    // at the mark: the second leg
    const mark = plan.legs[0].to;
    await page.evaluate(async (m) => {
      await world.teleport(m.x + 1.8, m.z + 1.8);
      await T.until(() => world.treasure.hunt.stage === 1, 10000);
    }, mark);
    h = await hunt();
    assert.equal(h.stage, 1, 'the mark found');
    assert.match(h.objective, new RegExp(`, ${plan.legs[1].paces} paces ${plan.legs[1].way}, and dig$`));
    return { paces: h.paces };
  });

  await step('digging', async () => {
    // a hole in the wrong place, by the mark
    await frames(5);
    assert.equal(await page.evaluate(() => world.act.here()?.word), 'dig', 'the act key digs');
    await page.keyboard.down('KeyF');
    const mid = await page.evaluate(async () => {
      await T.until(() => world.treasure.hunt.digging, 10000);
      await T.frames(4);
      return { tool: world.player.character.tool, idle: world.builder.idle, prompt: T.prompt() };
    });
    const dug = await page.evaluate(() => T.until(() => world.treasure.hunt.holes.length === 1, 20000));
    await page.keyboard.up('KeyF');
    assert.ok(dug, 'a hole');
    assert.deepEqual([mid.tool, mid.idle], ['shovel', true], 'the spade in hand, the tools put away');
    assert.match(mid.prompt, /digging/);
    let h = await hunt();
    assert.equal(h.stage, 1, 'nothing in it');
    assert.ok(await page.evaluate(() => !!world.scene.getObjectByName('treasure-hole')));
    await frames(5);
    assert.equal(await page.evaluate(() => world.player.character.tool), null, 'the spade put away when you stop');
    // on the spot, facing the way the map says, dig
    await page.evaluate(async (p) => {
      const i = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'].indexOf(p.legs[1].way);
      const a = (i * Math.PI) / 4;
      const sx = Math.sin(a);
      const sz = -Math.cos(a);
      await world.teleport(p.x - sx * 0.8, p.z - sz * 0.8, Math.atan2(sx, sz));
      await T.frames(5);
    }, plan);
    await page.keyboard.down('KeyF');
    const struck = await page.evaluate(() => T.until(() => world.treasure.hunt.stage === 'found', 20000));
    await page.keyboard.up('KeyF');
    assert.ok(struck, 'the spade strikes wood');
    await page.evaluate(() => T.frames(40));
    const chest = await page.evaluate(() => ({ there: !!world.scene.getObjectByName('treasure-chest'), prompt: T.prompt(), said: world.hud.toast.textContent }));
    assert.ok(chest.there, 'the chest comes up');
    assert.match(chest.said, /strikes wood/);
    assert.match(chest.prompt, /F\s*open the chest/);
    await key('KeyF');
    const won = await page.evaluate(async () => {
      await T.frames(10);
      const a = world.adventures;
      return { outcome: a.outcome, line: a.line, record: a.record.treasure, card: document.getElementById('adv-card').textContent, yours: world.pack.list().yours };
    });
    assert.equal(won.outcome, 'won');
    assert.equal(won.line, `${plan.name}: ${plan.coins} gold coins and ${plan.trinket}`);
    assert.match(won.card, /YOU MADE IT/);
    assert.deepEqual(won.record, { tries: 1, won: 1, best: won.record.best });
    assert.deepEqual(
      won.yours.filter((t) => t.label === 'gold coins'),
      [{ label: 'gold coins', note: `${plan.coins} · from one hoard` }],
      'the gold in your pack',
    );
    assert.ok(won.yours.some((t) => t.label === plan.trinket), `and ${plan.trinket}`);
    await shot('treasure-chest');
    return { line: won.line };
  });

  await step('what you found, kept', async () => {
    await page.evaluate(() => T.frames(140)); // long enough for it to be written down
    await open();
    const kept = await page.evaluate(() => ({ finds: world.treasure.finds, chest: !!world.scene.getObjectByName('treasure-chest'), state: world.adventures.state }));
    assert.equal(kept.finds.coins, plan.coins);
    assert.deepEqual(kept.finds.hoards, [[plan.name, plan.coins, plan.trinket]]);
    assert.ok(!kept.chest, 'and nothing of it left in the world');
    assert.equal(kept.state, 'idle');
    return kept.finds;
  });
}
