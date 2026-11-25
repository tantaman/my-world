// Boats: take the boat tool, hollow out a canoe at the edge of a
// lake, get in and push off, paddle out and back until it runs aground short
// of the bank, get out onto the bank, come back to find yourself still in it
// after a reload, and lash a raft and break it up again.
//
// Needs nothing from earlier parts: it finds its own lake, and brings its own
// logs. Leaves the canoe by the bank (made.canoe: where it is, and the bank
// it was built on, facing out over the lake), and you standing by it.

import assert from 'node:assert/strict';

// In the page: the nearest good bank of the nearest lake, and standing on it
// with the crosshair on the spot.
export function inPage() {
  const w = window.world;
  T.lakeShore = (kind = 'canoe') => {
    const lake = w.underwater.find('lake', { depth: 2.5, reach: 2000 });
    return lake && w.boats.shore(kind, { x: lake.x, z: lake.z, reach: 250 });
  };
  // stand `back` m up the bank from s, the way it faces, and aim at it; or
  // nearer or further back, where the lip of the bank would be in the way
  // (the tool builds where the crosshair meets the ground, not beyond it)
  T.atShore = async (s, back = 2.4) => {
    const g = w.chunks.heightAt(s.x, s.z);
    const ux = Math.sin(s.yaw);
    const uz = Math.cos(s.yaw);
    const sees = (b) => {
      const x0 = s.x - ux * b;
      const z0 = s.z - uz * b;
      const eye = w.chunks.heightAt(x0, z0) + w.player.eye;
      for (let k = 0.05; k < 0.96; k += 0.05) {
        if (w.chunks.heightAt(x0 + ux * b * k, z0 + uz * b * k) > eye + (g - eye) * k - 0.03) return false;
      }
      return true;
    };
    const b = [1, 0.75, 1.3, 0.55, 1.6].map((f) => back * f).find(sees) ?? back;
    await T.standAndAim(s.x - ux * b, s.z - uz * b, s.x, g, s.z);
    // and again from where you've settled on the slope of the bank, a few
    // centimetres from where you were set down, which is enough to tip the
    // aim off the spot onto the next
    const p = w.player.pos;
    const dx = p.x - s.x;
    const dy = p.y + w.player.eye - g;
    const dz = p.z - s.z;
    w.look(Math.atan2(dx, dz), Math.asin(dy / Math.hypot(dx, dy, dz)), 3);
    await T.frames(4);
  };
  T.depthHere = () => {
    const o = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
    return w.chunks.waterAt(w.player.pos.x, w.player.pos.z, o) ? o.depth : 0;
  };
}

export default async function ({ page, step, key, frames, open, shot, made }) {
  const prompt = () => page.evaluate(() => T.prompt());
  const toast = () => page.evaluate(() => document.getElementById('toast').textContent);
  const hold = async (code, n) => {
    await page.keyboard.down(code);
    await frames(n);
    await page.keyboard.up(code);
    await frames(3);
  };

  let spot = null;
  await step('the boat tool', async () => {
    // the lake first, then its bank: until the ground there has come in, its
    // heights are worked out exactly, and once it has, they're sampled every
    // metre, as the tool sees them (a bank found from afar can be somewhere
    // else, and a lip in it in the way of the aim)
    spot = await page.evaluate(async () => {
      const far = T.lakeShore('canoe');
      if (!far) return null;
      await world.teleport(far.x - Math.sin(far.yaw) * 3, far.z - Math.cos(far.yaw) * 3, far.yaw);
      return T.lakeShore('canoe');
    });
    assert.ok(spot, 'a lake with a bank to build on');
    await page.evaluate(async (s) => {
      world.builder.gain('log', 30);
      await T.atShore(s);
    }, spot);
    // its key is wherever its slot is on the bar
    const n = await page.evaluate(() => world.builder.slotOf('boat'));
    await key(`Digit${n % 10}`);
    assert.equal(await page.evaluate(() => world.builder.tool), 'boat', `${n % 10} is the boat tool`);
    const slot = await page.evaluate((i) => document.querySelectorAll('#hotbar .slot')[i - 1].querySelector('kbd')?.textContent, n);
    assert.equal(slot, String(n % 10), 'and the bar says so');
    await frames(4);
    const said = await prompt();
    assert.match(said, /^hold click hollow out a dugout canoe \(5 m of log\) · hold right-click lash a raft \(12 m of log\)$/, `(prompt: "${said}")`);
    await shot('boat-tool');
    return { prompt: said };
  });

  await step('a canoe, hollowed out', async () => {
    const logs = await page.evaluate(() => world.builder.inv.log);
    const ok = await page.evaluate(() => T.hold('use', () => world.boats.list().length > 0, 60000));
    assert.ok(ok, 'it is made');
    const [b] = await page.evaluate(() => world.boats.list());
    assert.equal(b.kind, 'canoe');
    assert.ok(Math.hypot(b.x - spot.x, b.z - spot.z) < 0.01, `where it was aimed (${JSON.stringify({ at: [b.x, b.z, b.yaw], aimed: [spot.x, spot.z, spot.yaw] })})`);
    assert.equal(await page.evaluate(() => world.builder.inv.log), logs - 5, 'from 5 m of log');
    assert.match(await toast(), /a dugout canoe, at the water’s edge · F to get in/);
    assert.match(await prompt(), /F get in the canoe · hold right-click break it up \(\+3 m of log\)/);
    await shot('canoe-built');
    return { afloat: b.afloat };
  });

  await step('in, and pushed off', async () => {
    await key('KeyF');
    const ok = await page.evaluate(() => T.until(() => world.boats.aboard && !world.boats.aboard.launching && world.boats.aboard.afloat, 10000));
    assert.ok(ok, 'in it, and off the bank');
    const now = await page.evaluate(() => ({
      aboard: world.boats.aboard,
      keel: world.player.carrier && world.player.carrier.keel,
      held: world.player.character.tool,
      idle: world.builder.idle,
      seated: !!world.player.character.seated,
      prompt: T.prompt(),
    }));
    assert.equal(now.aboard.afloat, true, 'afloat');
    assert.ok(now.keel > 0, 'carried by something with a keel');
    assert.equal(now.held, 'paddle', 'the paddle in your hands');
    assert.ok(now.idle && now.seated, 'the tools put away, and you sat down');
    assert.match(now.prompt, /^F get out · shift paddle hard$/);
    return { prompt: now.prompt };
  });

  await step('paddling', async () => {
    // out across the lake, the way the bow points
    const from = await page.evaluate(() => {
      world.look(world.player.yaw + Math.PI, 0.3, 6);
      return { x: world.player.pos.x, z: world.player.pos.z };
    });
    await page.keyboard.down('KeyW');
    const stroked = await page.evaluate(() => T.until(() => world.player.character.action?.kind === 'paddle', 5000));
    await frames(150);
    await shot('paddling');
    await page.keyboard.up('KeyW');
    await frames(5);
    const there = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, depth: T.depthHere(), list: world.boats.list() }));
    const went = Math.hypot(there.x - from.x, there.z - from.z);
    assert.ok(stroked, 'stroke after stroke');
    assert.ok(went > 4, `out onto the lake (${went.toFixed(1)} m)`);
    assert.ok(Math.hypot(there.list[0].x - there.x, there.list[0].z - there.z) < 0.1, 'and the canoe with you');
    // and back again, at the bank you set off from, until it runs aground
    await page.evaluate((s) => world.look(Math.atan2(world.player.pos.x - s.x, world.player.pos.z - s.z), 0.3, 6), spot);
    await hold('KeyW', 400);
    const back = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, depth: T.depthHere(), afloat: world.boats.aboard.afloat }));
    const keel = await page.evaluate(() => world.player.carrier.keel);
    assert.ok(back.depth >= keel - 0.02, `aground short of the shallows (${back.depth.toFixed(2)} m of water)`);
    assert.ok(Math.hypot(back.x - spot.x, back.z - spot.z) < 7, 'close in by the bank');
    return { went: Math.round(went), depth: Math.round(back.depth * 100) / 100 };
  });

  await step('out onto the bank', async () => {
    await key('KeyF');
    const out = await page.evaluate(() => ({ aboard: world.boats.aboard, carrier: world.player.carrier, depth: T.depthHere(), list: world.boats.list(), held: world.player.character.tool }));
    assert.equal(out.aboard, null, 'out of it');
    assert.equal(out.carrier, null);
    assert.ok(out.depth < 0.75, `on the bank or in the shallows (${out.depth.toFixed(2)} m of water)`);
    assert.equal(out.list[0].out, null, 'the canoe is left where you got out');
    assert.ok(out.list[0].dist < 3, 'beside you');
    assert.notEqual(out.held, 'paddle', 'and the paddle with it');
    return { depth: Math.round(out.depth * 100) / 100 };
  });

  await step('still in it after a reload', async () => {
    await key('KeyF');
    assert.ok(await page.evaluate(() => T.until(() => world.boats.aboard && !world.boats.aboard.launching && world.boats.aboard.afloat, 10000)), 'back in');
    const id = await page.evaluate(() => world.boats.aboard.id);
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    await open();
    const back = await page.evaluate(() => ({ aboard: world.boats.aboard, list: world.boats.list(), held: world.player.character.tool }));
    assert.ok(back.aboard, 'in a boat');
    assert.equal(back.aboard.id, id, 'the same one');
    assert.equal(back.list.length, 1, 'and only the one');
    assert.equal(back.held, 'paddle');
    await key('KeyF');
    assert.equal(await page.evaluate(() => world.boats.aboard), null, 'and out of it again');
    return { id };
  });

  await step('a raft, lashed and broken up', async () => {
    const raft = await page.evaluate((bank) => {
      const c = world.boats.list()[0];
      // along the bank from where the canoe was built, one way or the other
      for (const along of [14, -14, 24, -24, 36, -36]) {
        const x = bank.x + Math.cos(bank.yaw) * along;
        const z = bank.z - Math.sin(bank.yaw) * along;
        const s = world.boats.shore('raft', { x, z, reach: 12 });
        if (s && Math.hypot(s.x - c.x, s.z - c.z) > 9) return s;
      }
      return null;
    }, spot);
    assert.ok(raft, 'somewhere for a raft');
    await page.evaluate(async (s) => T.atShore(s), raft);
    await key(`Digit${(await page.evaluate(() => world.builder.slotOf('boat'))) % 10}`);
    assert.equal(await page.evaluate(() => world.builder.tool), 'boat');
    const logs = await page.evaluate(() => world.builder.inv.log);
    assert.ok(await page.evaluate(() => T.hold('alt', () => world.boats.list().some((b) => b.kind === 'raft'), 60000)), 'lashed together');
    assert.equal(await page.evaluate(() => world.builder.inv.log), logs - 12, 'from 12 m of log');
    await shot('raft');
    const id = await page.evaluate(() => world.boats.list().find((b) => b.kind === 'raft').id);
    // the canoe is still there; the raft goes
    await frames(4);
    assert.match(await prompt(), /hold right-click break it up \(\+8 m of log\)/);
    assert.ok(await page.evaluate(() => T.hold('alt', () => !world.boats.list().some((b) => b.kind === 'raft'), 20000)), 'knocked apart');
    assert.equal(await page.evaluate(() => world.builder.inv.log), logs - 4, '8 m of it back');
    assert.deepEqual(await page.evaluate(() => world.boats.list().map((b) => b.kind)), ['canoe']);
    return { raft: id.length > 0 };
  });

  await step('boats on the help panel', async () => {
    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row')].map((r) => r.textContent));
    await key('KeyH');
    assert.ok(help.some((r) => /^Fget into the boat beside you · get out of it$/.test(r)), 'F');
    const n = (await page.evaluate(() => world.builder.slotOf('boat'))) % 10;
    assert.ok(help.some((r) => r.startsWith(`${n}the boat tool`)), 'and where the tool is');
    return { rows: help.filter((r) => /boat/.test(r)).length };
  });

  const c = await page.evaluate(() => world.boats.list()[0]);
  made.canoe = { id: c.id, x: c.x, z: c.z, bank: spot };
}
