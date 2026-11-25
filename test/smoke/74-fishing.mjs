// Fishing: take the rod, cast from the bank of a lake, strike when
// the float goes under and play the fish in; then do it again out in the
// canoe the boats part left on the bank; and find what you caught still
// counted after a reload.
//
// Needs the canoe from 73-boats (made.canoe), and you standing by it. Leaves
// you on the bank, the canoe beside you, and a fish or two in your pack.

import assert from 'node:assert/strict';

// In the page: the crosshair on the water `out` m ahead of where you face,
// and a fish played in the way someone careful would, letting go while it
// runs and when the line strains.
export function inPage() {
  const w = window.world;
  T.aimOut = async (out) => {
    const p = w.player.pos;
    const gx = p.x + Math.sin(w.player.yaw) * out;
    const gz = p.z + Math.cos(w.player.yaw) * out;
    const o = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
    const level = w.chunks.waterAt(gx, gz, o) ? o.level : w.chunks.heightAt(gx, gz);
    const dx = p.x - gx;
    const dy = p.y + w.player.eye - level;
    const dz = p.z - gz;
    w.look(Math.atan2(dx, dz), Math.asin(dy / Math.hypot(dx, dy, dz)), 5);
    await T.frames(6);
  };
  // Somewhere along the bank s (facing out over the water, s.yaw) to cast
  // `out` m from: dry where you stand, open water deep enough for fish out
  // there, and nothing of the bank between your eye and it. `side` m along
  // it first, then further either way. -> { x, z } or null
  T.bankToFish = (s, out, side = 8) => {
    const o = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
    const ux = Math.sin(s.yaw);
    const uz = Math.cos(s.yaw);
    const wet = (x, z) => w.chunks.waterAt(x, z, o) && o.depth > 0.02;
    for (const along of [side, -side, side * 1.75, -side * 1.75, side / 2, -side / 2, side * 2.5, -side * 2.5]) {
      const x = s.x - ux * 0.6 + uz * along;
      const z = s.z - uz * 0.6 - ux * along;
      if (wet(x, z) || !wet(x + ux * out, z + uz * out) || o.depth < 1) continue;
      const level = o.level;
      const eye = w.chunks.heightAt(x, z) + w.player.eye;
      let clear = true;
      for (let k = 0.05; k < 1 && clear; k += 0.05) clear = w.chunks.heightAt(x + ux * out * k, z + uz * out * k) < eye + (level - eye) * k - 0.05;
      if (clear) return { x, z };
    }
    return null;
  };
  T.playIn = async () => {
    const L = w.fishing.line;
    const said = new Set();
    while (L.state === 'hooked') {
      T.press('use', L.run <= 0 && L.tension < 0.7);
      said.add(T.prompt().replace(/\d+/g, 'N'));
      await T.frames(1);
    }
    T.press('use', false);
    await T.frames(4);
    return [...said];
  };
}

export default async function ({ page, step, key, frames, open, shot, made }) {
  const prompt = () => page.evaluate(() => T.prompt());
  const toast = () => page.evaluate(() => document.getElementById('toast').textContent);
  const canoe = made.canoe;

  // Cast `out` m ahead, hurry a fish along, strike, and play it in.
  const fish = async (out) => {
    await page.evaluate((o) => T.aimOut(o), out);
    const aimed = await prompt();
    assert.match(aimed, /^click cast \(\d+ m out\)$/, `(prompt: "${aimed}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await page.evaluate(() => T.until(() => world.fishing.line.state === 'waiting', 10000)), 'the float lands');
    await frames(2);
    const waiting = await prompt();
    assert.match(waiting, /^waiting for a bite… · right-click reel in$/);
    assert.ok(await page.evaluate(() => world.fishing.hurry()), 'a fish comes to it');
    assert.ok(await page.evaluate(() => T.until(() => world.fishing.line.state === 'biting', 20000)), 'and takes it');
    await frames(2);
    assert.match(await prompt(), /^click strike!$/);
    await page.evaluate(() => T.tap('use'));
    assert.equal(await page.evaluate(() => world.fishing.line.state), 'hooked', 'hooked');
    await shot('fish-on');
    const said = await page.evaluate(() => T.playIn());
    assert.ok(
      said.some((s) => /^hold click reel in · the line’s (taut|straining) · right-click let it go$/.test(s)),
      `reeling (said: ${said.join(' | ')})`,
    );
    const landed = await toast();
    assert.match(landed, /^\+1 fish · an? .+, \d+ cm \(\d+(\.\d)? k?g\)/, `(toast: "${landed}")`);
    assert.equal(await page.evaluate(() => world.player.character.raised), 'fish', 'held up to look at');
    return { aimed: aimed.replace(/\d+/, 'N'), landed: landed.replace(/\d+(\.\d+)?/g, 'N') };
  };

  await step('a rod', async () => {
    // its key is wherever its slot is on the bar
    const n = await page.evaluate(() => world.builder.slotOf('rod'));
    await key(`Digit${n % 10}`);
    assert.equal(await page.evaluate(() => world.builder.tool), 'rod', `${n % 10} is the rod`);
    const slot = await page.evaluate((i) => document.querySelectorAll('#hotbar .slot')[i - 1].querySelector('kbd')?.textContent, n);
    assert.equal(slot, String(n % 10), 'and the bar says so');
    return { slot };
  });

  await step('fishing from the bank', async () => {
    // a little way along the bank from where the canoe was built, facing out
    // over open water (not where a stream runs in, or the bank juts out)
    const bank = await page.evaluate(async (s) => {
      const at = T.bankToFish(s, 11);
      if (at) {
        await world.teleport(at.x, at.z, s.yaw);
        await T.frames(6);
      }
      return at;
    }, canoe.bank);
    assert.ok(bank, 'somewhere along the bank to cast from');
    const facts = await fish(11);
    await shot('caught-from-the-bank');
    assert.equal(await page.evaluate(() => world.builder.inv.fish), 1, 'in your pack');
    return facts;
  });

  await step('fishing from the canoe', async () => {
    await page.evaluate((c) => world.teleport(c.x, c.z), canoe);
    await frames(6);
    await key('KeyF');
    assert.ok(await page.evaluate(() => T.until(() => world.boats.aboard && !world.boats.aboard.launching && world.boats.aboard.afloat, 10000)), 'in the canoe');
    // the rod is still in hand, and works out here: the paddle stays put
    const inBoat = await page.evaluate(() => ({ tool: world.builder.tool, idle: world.builder.idle, held: world.player.character.tool, swim: world.player.carrier.swim }));
    assert.deepEqual([inBoat.tool, inBoat.idle, inBoat.held], ['rod', false, 'rod'], 'the rod, not the paddle');
    // out a little way: with the rod in hand, only sculling
    await page.evaluate((s) => world.look(s.yaw + Math.PI, 0.3, 6), canoe.bank);
    await page.keyboard.down('KeyW');
    await frames(90);
    await page.keyboard.up('KeyW');
    await frames(20);
    const facts = await fish(10);
    await shot('caught-from-the-canoe');
    // put the rod down and the paddle is back
    await key('Digit1');
    const after = await page.evaluate(() => ({ idle: world.builder.idle, held: world.player.character.tool, swim: world.player.carrier.swim }));
    assert.ok(after.idle && after.held === 'paddle', 'the paddle again');
    assert.ok(after.swim > inBoat.swim * 2, 'and paddling, not sculling');
    assert.equal(await page.evaluate(() => world.builder.inv.fish), 2);
    return facts;
  });

  await step('what you caught is kept', async () => {
    // back to the bank, and out
    await page.evaluate((s) => world.look(s.yaw, 0.3, 6), canoe.bank);
    await page.keyboard.down('KeyW');
    await frames(300);
    await page.keyboard.up('KeyW');
    await key('KeyF');
    if (await page.evaluate(() => world.boats.aboard)) await key('KeyF');
    assert.equal(await page.evaluate(() => world.boats.aboard), null, 'out of the canoe');
    const caught = await page.evaluate(() => world.fishing.catches());
    assert.equal(caught.reduce((n, c) => n + c.caught, 0), 2, 'two caught');
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    await open();
    assert.deepEqual(await page.evaluate(() => world.fishing.catches()), caught, 'remembered');
    assert.equal(await page.evaluate(() => world.builder.inv.fish), 2, 'and still in your pack');
    const line = await page.evaluate(() => document.getElementById('inv').textContent);
    assert.match(line, /fish 2/, 'on the line of what you carry');
    return { kinds: caught.map((c) => c.kind).sort() };
  });
}
