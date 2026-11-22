// Tubing: away from the water, V says where the nearest river to float down
// is and points the way there; on its bank, F (the act key) tosses the tube in
// and you drop into it; the river carries you on down, and your hands paddle
// you along faster; F climbs out (onto the bank, or out in deep water, asked
// twice, into the water); and you're back in your tube after a reload.
//
// Needs nothing from earlier parts: it finds its own river. Leaves you on
// foot by that river, out of the tube.

import assert from 'node:assert/strict';

// In the page: somewhere to stand, dry, near (x, z), and the water there.
export function inPage() {
  const w = window.world;
  const o = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
  T.water = (x, z) => (w.chunks.waterAt(x, z, o) && o.depth > 0 ? { ...o } : null);
  // dry ground within `reach` m of (x, z), with no water at all within `clear` m of it
  T.dryBy = (x, z, { reach = 6, clear = 0 } = {}) => {
    for (let r = 0; r <= reach; r += 0.5) {
      const n = Math.max(1, Math.round((Math.PI * 2 * r) / 0.5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (T.water(px, pz)) continue;
        let wet = false;
        for (let k = 0; k < 12 && clear > 0 && !wet; k++) {
          const b = (k / 12) * Math.PI * 2;
          for (let s = 1; s <= clear && !wet; s += 1) wet = !!T.water(px + Math.cos(b) * s, pz + Math.sin(b) * s);
        }
        if (!wet) return { x: px, z: pz };
      }
    }
    return null;
  };
}

export default async function ({ page, step, key, frames, open, shot }) {
  const toast = () => page.evaluate(() => document.getElementById('toast').textContent);
  let river = null;

  await step('away from the water, where to go and float', async () => {
    const dry = await page.evaluate(async () => {
      const p = world.player.pos;
      const at = T.dryBy(p.x, p.z, { reach: 200, clear: 5 });
      if (at) await world.teleport(at.x, at.z);
      return at;
    });
    assert.ok(dry, 'somewhere dry to start');
    await key('KeyV');
    const said = await toast();
    assert.match(said, /^no water deep enough to float in here · the nearest (river|stream) to float down is [\d.]+ k?m (N|NE|E|SE|S|SW|W|NW), and runs [\d.]+ k?m from there$/, `(said: "${said}")`);
    assert.equal(await page.evaluate(() => world.tubing.active), false, 'and not in a tube');
    await frames(3);
    const track = await page.evaluate(() => document.getElementById('track').textContent);
    assert.match(track, /a river to float down/, `the way there is shown (${track})`);
    river = await page.evaluate(() => world.tubing.river());
    return { said, track };
  });

  await step('on its bank, into the tube', async () => {
    const bank = await page.evaluate(async (r) => {
      await world.teleport(r.x, r.z);
      const at = T.dryBy(r.x, r.z, { reach: 8 });
      if (!at) return null;
      await world.teleport(at.x, at.z, Math.atan2(r.x - at.x, r.z - at.z));
      await T.frames(5);
      return { at, prompt: T.prompt() };
    }, river);
    assert.ok(bank, 'a bank to stand on, beside the river');
    assert.match(bank.prompt, /^F float down it in your inner tube$/, `walking by, the prompt says so (${bank.prompt})`);
    await key('KeyF');
    const ok = await page.evaluate(() => T.until(() => world.tubing.state() && !world.tubing.state().hopping, 10000));
    assert.ok(ok, 'hopped in');
    await frames(10);
    const now = await page.evaluate(() => {
      const ch = world.player.character;
      const p = world.player.pos;
      const o = T.water(p.x, p.z);
      return {
        state: world.tubing.state(),
        seated: !!ch.seated,
        rest: ch.seated && ch.seated.rest,
        hips: ch.root.position.y + 0.94,
        level: o && o.level,
        idle: world.builder.idle,
        prompt: T.prompt(),
        readout: document.getElementById('tubing').textContent,
        said: document.getElementById('toast').textContent,
      };
    });
    assert.ok(now.seated && now.rest === 1, 'sat in it, arms over the sides');
    assert.ok(now.level !== null && Math.abs(now.hips - now.level) < 0.3, `down in it at the water (hips ${now.hips.toFixed(2)}, water ${now.level?.toFixed(2)})`);
    assert.ok(now.idle, 'the tools put away');
    assert.match(now.said, /^into your tube · the river carries you along · W A S D to paddle · F to get out$/);
    assert.match(now.prompt, /^W A S D paddle · shift hard · F get out$/);
    assert.match(now.readout, /^[\d.]+ km\/h/);
    await shot('tubing-in');
    return { state: now.state };
  });

  await step('the river carries you on down', async () => {
    const from = await page.evaluate(() => world.tubing.state());
    const ok = await page.evaluate(() => T.until(() => world.tubing.state().far > 4, 60000));
    const now = await page.evaluate(() => ({ s: world.tubing.state(), readout: document.getElementById('tubing').textContent }));
    assert.ok(ok, `carried along (${now.s.far} m)`);
    assert.ok(now.s.left === null || from.left === null || now.s.left < from.left, `with less river left (${from.left} -> ${now.s.left} m)`);
    assert.ok(!now.s.aground, 'afloat');
    assert.match(now.readout, /^[\d.]+ km\/h( · \d+ m in \d+ s)?( · [\d.]+ k?m of river left| · the end of the river| · no way on)?$/, `how fast, how far, how much is left (${now.readout})`);
    await shot('tubing-along');
    return { far: now.s.far, speed: now.s.speed, left: now.s.left, readout: now.readout };
  });

  await step('your hands paddle you along', async () => {
    // the camera is round behind the way you're going: W paddles you on
    const drift = await page.evaluate(() => world.tubing.state().speed);
    await page.keyboard.down('KeyW');
    await frames(90);
    const going = await page.evaluate(() => ({ s: world.tubing.state(), stroke: world.player.character.seated.stroke }));
    await page.keyboard.up('KeyW');
    await frames(5);
    const after = await page.evaluate(() => world.player.character.seated.stroke);
    assert.ok(going.stroke !== null, 'stroke after stroke');
    assert.ok(going.s.speed > drift + 0.2, `faster (${drift} -> ${going.s.speed} m/s)`);
    assert.equal(after, null, 'and the arms back on the rim');
    return { drift, paddled: going.s.speed };
  });

  await step('out of the tube', async () => {
    await key('KeyF');
    let said = await toast();
    if (/no bank within reach/.test(said)) await key('KeyF');
    said = await toast();
    const out = await page.evaluate(() => ({ active: world.tubing.active, aboard: !!world.player.aboard, seated: world.player.character.seated }));
    assert.equal(out.active, false, 'out of it');
    assert.equal(out.aboard, false);
    assert.equal(out.seated, null, 'on your feet (or swimming)');
    assert.match(said, /^out of your tube, (onto the bank|into the water)( · [\d.]+ k?m in \d+ (s|min))?$/, `(said: "${said}")`);
    return { said };
  });

  await step('back in your tube after a reload', async () => {
    await key('KeyF');
    assert.ok(await page.evaluate(() => T.until(() => world.tubing.state() && !world.tubing.state().hopping, 10000)), 'in again');
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    await open();
    const back = await page.evaluate(() => ({ s: world.tubing.state(), seated: !!world.player.character.seated }));
    assert.ok(back.s && !back.s.hopping, 'in your tube');
    assert.ok(back.seated, 'sat in it');
    await key('KeyF');
    if (await page.evaluate(() => world.tubing.active)) await key('KeyF');
    assert.equal(await page.evaluate(() => world.tubing.active), false, 'and out of it again');
    return { far: back.s.far };
  });
}
