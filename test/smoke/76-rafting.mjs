// Rafting: away from the water, the raft in the pack says where the nearest
// rapid to run is and points the way to put in above it, and the rapid is on
// the map; at the put-in it goes in and you climb aboard; your paddle drives
// it along; down the rapid, kept straight, it runs it right way up and says
// so; over it goes, you're in the river, and right it and climb back in; out onto the
// bank (or over the side); and you're back in it after a reload.
//
// Needs nothing from earlier parts: it finds its own rapid from the start of
// the world. Uses T.dryBy from 75-tubing. Leaves you on foot, out of the
// raft, by that rapid.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, open, shot }) {
  const toast = () => page.evaluate(() => document.getElementById('toast').textContent);
  const state = () => page.evaluate(() => world.rafting.state());
  let rapid = null;

  await step('away from the water, where to go and run a rapid', async () => {
    const dry = await page.evaluate(async () => {
      const at = T.dryBy(0, 0, { reach: 300, clear: 8 });
      if (at) await world.teleport(at.x, at.z);
      return at;
    });
    assert.ok(dry, 'somewhere dry to start');
    await page.evaluate(() => world.pack.do('raft'));
    const said = await toast();
    assert.match(said, /^no river here wide and deep enough for a raft · the nearest rapid to run is .+, Class (I|II|III|IV|V), [\d.]+ k?m (N|NE|E|SE|S|SW|W|NW): put in above it$/, `(said: "${said}")`);
    assert.equal(await page.evaluate(() => world.rafting.afloat), false, 'and no raft out');
    await frames(3);
    const track = await page.evaluate(() => document.getElementById('track').textContent);
    assert.match(track, /a rapid to run/, `the way there is shown (${track})`);
    rapid = await page.evaluate(() => world.rafting.nearest());
    const onMap = await page.evaluate((id) => world.map.places.get(id), rapid.id);
    assert.ok(onMap && onMap.kind === 'rapid' && onMap.name === rapid.name, 'it is on the map');
    assert.match(onMap.note, /^Class (I|II|III|IV|V|VI) rapid · [\d.]+ k?m, falls [\d.]+ m$/, `(the map says "${onMap.note}")`);
    return { said, rapid: { id: rapid.id, name: rapid.name, cls: rapid.cls, len: rapid.len, drop: rapid.drop } };
  });

  await step('at the put-in, the raft goes in and you climb aboard', async () => {
    const bank = await page.evaluate(async (r) => {
      await world.teleport(r.putIn.x, r.putIn.z);
      const at = T.dryBy(r.putIn.x, r.putIn.z, { reach: 10 });
      if (!at) return null;
      await world.teleport(at.x, at.z, Math.atan2(r.putIn.x - at.x, r.putIn.z - at.z));
      await T.frames(5);
      return { at, hand: world.pack.list().hand.map((h) => [h.id, h.word]) };
    }, rapid);
    assert.ok(bank, 'a bank to stand on, beside the river');
    assert.ok(bank.hand.some(([id, word]) => id === 'raft' && word === 'raft'), `the raft is at hand (${JSON.stringify(bank.hand)})`);
    await page.evaluate(() => world.pack.do('raft'));
    const said = await toast();
    assert.ok(await page.evaluate(() => T.until(() => world.rafting.state()?.aboard && !world.rafting.state().hopping, 15000)), 'climbed aboard');
    await frames(10);
    const now = await page.evaluate(() => ({
      s: world.rafting.state(),
      seated: !!world.player.character.seated,
      tool: world.player.character.tool,
      idle: world.builder.idle,
      readout: document.getElementById('rafting').textContent,
      hand: world.pack.list().hand.map((h) => [h.id, h.word]),
    }));
    assert.match(said, /^your raft is in · W S paddle · A D turn · shift hard · keep her pointed down the river through the rapids( · .+, Class (I|II|III|IV|V|VI) ahead, in [\d.]+ k?m)?$/, `(said: "${said}")`);
    assert.ok(now.seated && now.tool === 'raftPaddle', 'sat on its tube with a paddle');
    assert.ok(now.idle, 'the tools put away');
    assert.ok(!now.s.flipped && !now.s.aground, 'afloat, right way up');
    assert.match(now.readout, /^[\d.]+ km\/h/, `(the readout: "${now.readout}")`);
    assert.ok(now.hand.some(([id, word]) => id === 'raft' && word === 'get out'), 'get out is at hand');
    await shot('rafting-in');
    return { readout: now.readout };
  });

  await step('your paddle drives it along', async () => {
    const drift = (await state()).speed;
    await page.keyboard.down('KeyW');
    await frames(90);
    const going = await page.evaluate(() => ({ s: world.rafting.state(), stroke: world.player.character.action?.kind }));
    await page.keyboard.up('KeyW');
    assert.equal(going.stroke, 'paddle', 'stroke after stroke');
    assert.ok(going.s.speed > drift + 0.3, `faster (${drift} -> ${going.s.speed} m/s)`);
    return { drift, paddled: going.s.speed };
  });

  await step('kept straight, it runs the rapid right way up', async () => {
    // in again a little way above the lip, and held straight down it
    await page.evaluate((r) => {
      const dx = r.lip.x - r.putIn.x;
      const dz = r.lip.z - r.putIn.z;
      const l = Math.hypot(dx, dz);
      world.rafting.putInAt(r.lip.x - (dx / l) * 7, r.lip.z - (dz / l) * 7, Math.atan2(dx, dz));
      world.rafting.hold({ fwd: 0.8, steer: true });
    }, rapid);
    let fastest = 0;
    let named = '';
    const ran = await page.evaluate(
      (id) =>
        T.until(() => {
          const s = world.rafting.state();
          if (s && s.inRapid === id) {
            window.__fastest = Math.max(window.__fastest || 0, s.speed);
            window.__named = document.getElementById('rafting').textContent;
          }
          // (what's said as it's run, before anything else is)
          if (world.rafting.log().ran.includes(id)) {
            window.__said = document.getElementById('toast').textContent;
            return true;
          }
          return s && s.flipped;
        }, 300000),
      rapid.id,
    );
    ({ fastest, named } = await page.evaluate(() => ({ fastest: window.__fastest || 0, named: window.__named || '' })));
    const s = await state();
    const said = await page.evaluate(() => window.__said || '');
    assert.ok(ran && !s.flipped, `ran it (flipped: ${s.flipped})`);
    assert.match(said, /^you ran .+, Class (I|II|III|IV|V|VI), right way up$/, `(said: "${said}")`);
    assert.ok(named.includes(rapid.name), `in it, the readout names it (${named})`);
    assert.ok(fastest > 1.5, `fast in it (${fastest} m/s)`);
    const yours = await page.evaluate(() => world.pack.list().yours.map((t) => [t.label, t.note]));
    assert.ok(yours.some(([label, note]) => label === 'rapids run' && /^1, the hardest Class /.test(note)), `kept, in the pack (${JSON.stringify(yours)})`);
    await shot('rafting-ran');
    return { fastest, said };
  });

  await step('over she goes: you’re in the river, right it, and climb back in', async () => {
    await page.evaluate(() => {
      world.rafting.hold(null);
      const r = world.rafting.raft;
      r.flipped = true;
      r.vroll = 6;
      r.emit('flip');
    });
    await frames(5);
    const over = await page.evaluate(() => ({ s: world.rafting.state(), wet: world.player.swimming || world.player.wade > 0, said: document.getElementById('toast').textContent, hand: world.pack.list().hand.map((h) => [h.id, h.word]) }));
    assert.ok(over.s.flipped && !over.s.aboard, 'upside down, and you out of it');
    assert.ok(over.wet, 'in the river, swimming or wading');
    assert.match(over.said, /^over she goes! you're in the river · get to the raft, then right it from your pack \(Tab\)$/, `(said: "${over.said}")`);
    assert.ok(over.hand.some(([id, word]) => id === 'raft' && word === 'right it'), `right it is at hand (${JSON.stringify(over.hand)})`);
    await page.evaluate(() => world.pack.do('raft'));
    assert.ok(await page.evaluate(() => T.until(() => world.rafting.state().aboard && !world.rafting.state().flipped && !world.rafting.state().hopping, 15000)), 'righted, and back aboard');
    assert.equal((await page.evaluate(() => world.rafting.log())).swims, 1, 'and the swim is kept');
    return { said: over.said };
  });

  await step('out of the raft', async () => {
    await page.evaluate(() => world.pack.do('raft'));
    let said = await toast();
    if (/no bank within reach/.test(said)) {
      await page.evaluate(() => world.pack.do('raft'));
      said = await toast();
    }
    const out = await page.evaluate(() => ({ s: world.rafting.state(), aboard: !!world.player.aboard, seated: world.player.character.seated, tool: world.player.character.tool }));
    assert.ok(!out.aboard && out.seated === null && out.tool !== 'raftPaddle', 'on your feet (or swimming), the paddle put away');
    assert.match(said, /^(out onto the bank, your raft rolled up and packed away( · [\d.]+ k?m down the river)?( · \d+ rapids? run)?|over the side into the river · swim back to the raft and get in again)$/, `(said: "${said}")`);
    return { said, out: out.s === null ? 'packed away' : 'left on the water' };
  });

  await step('back in your raft after a reload', async () => {
    await page.evaluate((r) => world.rafting.putInAt(r.putIn.x, r.putIn.z), rapid);
    assert.ok((await state())?.aboard, 'in again');
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    await open();
    const back = await page.evaluate(() => ({ s: world.rafting.state(), seated: !!world.player.character.seated, log: world.rafting.log() }));
    assert.ok(back.s && back.s.aboard, 'in your raft');
    assert.ok(back.seated, 'sat on its tube');
    assert.ok(back.log.ran.includes(rapid.id), 'and the rapid you ran is still yours');
    await page.evaluate(() => world.pack.do('raft'));
    if (await page.evaluate(() => world.rafting.aboard)) await page.evaluate(() => world.pack.do('raft'));
    assert.equal(await page.evaluate(() => world.rafting.aboard), false, 'and out of it again');
    return { log: back.log };
  });
}
