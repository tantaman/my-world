// Hunting: take the rifle, look through the scope, shoot a deer, dress it,
// roast the meat over a campfire, find the spit still there after a reload,
// eat, and empty the magazine to see it load again.
//
// Needs nothing from earlier parts: it goes back to where the path starts
// and calls up its own deer. Leaves no fire or spit behind, and no animals.

import assert from 'node:assert/strict';

// In the page: where an animal's body is, and pointing the crosshair at a
// spot from where you stand.
export function inPage() {
  const w = window.world;
  T.body = (who) => {
    const t = who.torso;
    const m = (t.a + t.b) / 2;
    return { x: who.x + Math.sin(who.yaw) * m, y: who.mesh.position.y + t.y, z: who.z + Math.cos(who.yaw) * m };
  };
  T.lookAt = async (gx, gy, gz) => {
    const p = w.player.pos;
    const dx = p.x - gx;
    const dy = p.y + w.player.eye - gy;
    const dz = p.z - gz;
    w.look(Math.atan2(dx, dz), Math.asin(dy / Math.hypot(dx, dy, dz)), 3);
    await T.frames(3);
  };
  T.idle = () => T.until(() => !w.builder.act, 30000);
}

export default async function ({ page, step, key, take, frames, open, shot }) {
  const inv = () => page.evaluate(() => ({ meat: world.builder.inv.meat, roast: world.builder.inv.roast }));
  const prompt = () => page.evaluate(() => T.prompt());

  await step('a rifle', async () => {
    await page.evaluate(async () => {
      world.wildlife.clear();
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
    });
    // the rifle's key is wherever its slot is on the bar
    const n = await page.evaluate(() => world.builder.slotOf('rifle'));
    await key(`Digit${n % 10}`);
    assert.equal(await page.evaluate(() => world.builder.tool), 'rifle', `${n % 10} is the rifle`);
    const slot = await page.evaluate((i) => document.querySelectorAll('#hotbar .slot')[i - 1].querySelector('kbd')?.textContent, n);
    assert.equal(slot, String(n % 10), 'and the bar says so');
    const said = await prompt();
    assert.match(said, /click shoot \(5 rounds\) · hold right-click scope/, `(prompt: "${said}")`);
    await shot('rifle');
    return { prompt: said };
  });

  let cuts = 0;
  await step('a deer, through the scope', async () => {
    // A deer to shoot, grazing in the open in front of you; and elk off to
    // one side, to hear the shot.
    const found = await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        world.wildlife.clear();
        world.wildlife.spawn('deer', { here: true, dist: 26, angle: i * 0.8 });
        const deer = world.wildlife.entities[0];
        deer.members.forEach((m) => m.setState('graze', 999));
        await T.frames(2);
        const b = T.body(deer.members[0]);
        await T.lookAt(b.x, b.y, b.z);
        await T.frames(4);
        if (/white-tailed/.test(T.prompt())) return { tries: i + 1, said: T.prompt().replace(/\d+ m/, 'N m') };
      }
      return null;
    });
    assert.ok(found, 'a deer in the open, named when the crosshair is on it');
    await page.evaluate(async () => {
      world.wildlife.spawn('elk', { here: true, dist: 45, angle: 2.2 });
      for (const m of world.wildlife.entities[1].members) m.setState('graze', 999);
      await T.frames(2);
    });

    const view = await page.evaluate(async () => {
      T.press('alt', true);
      await T.frames(4);
      const deer = world.wildlife.entities[0].members[0];
      const b = T.body(deer);
      await T.lookAt(b.x, b.y, b.z);
      return { sight: world.player.sight, scope: !document.getElementById('scope').hidden, fov: world.camera.fov, hidden: !world.player.character.root.visible };
    });
    assert.deepEqual(view.sight, { zoom: 4 }, 'right-click brings the scope up');
    assert.ok(view.scope && view.hidden, 'its view is on the screen, and you are out of the way');
    await shot('scope');
    const was = await page.evaluate(() => world.wildlife.entities[0].members.length);
    await page.evaluate(() => T.tap('use'));
    const after = await page.evaluate(async () => {
      T.press('alt', false);
      await T.frames(4);
      return {
        down: world.hunting.carcasses.list.map((c) => ({ kind: c.kind, cuts: c.cuts })),
        left: world.wildlife.entities.filter((e) => e.kind === 'deer').reduce((n, e) => n + e.members.length, 0),
        elk: world.wildlife.entities.filter((e) => e.kind === 'elk').flatMap((e) => e.members.map((m) => m.state)),
        rounds: world.hunting.rifle.rounds,
        said: document.getElementById('toast').textContent,
        sight: world.player.sight,
      };
    });
    assert.equal(after.down.length, 1, 'the deer is down');
    assert.equal(after.down[0].kind, 'deer');
    assert.equal(after.left, was - 1, 'and out of its herd');
    assert.match(after.said, /a clean shot · .* is down/);
    assert.ok(after.elk.length && after.elk.every((s) => s === 'flee'), `the elk ran at the shot (${after.elk.join(', ')})`);
    assert.equal(after.rounds, 4);
    assert.equal(after.sight, null, 'letting go lowers the scope');
    cuts = after.down[0].cuts;
    await frames(10);
    await shot('down');
    return { ...found, cuts, elk: after.elk.length };
  });

  await step('dressing the kill', async () => {
    await page.evaluate(async () => {
      world.wildlife.clear();
      const c = world.hunting.carcasses.list[0];
      await T.aimGround(c.x, c.z, 1.7, { x: c.x + c.fz * 3, z: c.z - c.fx * 3 });
    });
    const said = await prompt();
    assert.match(said, /hold click dress the .* \(\d+ cuts? of meat\)/, `beside it (prompt: "${said}")`);
    assert.ok(await page.evaluate(() => T.hold('use', () => world.hunting.carcasses.list.length === 0, 30000)), 'dressed');
    assert.deepEqual(await inv(), { meat: cuts, roast: 0 });
    assert.match(await page.evaluate(() => document.getElementById('inv').textContent), new RegExp(`raw meat ${cuts}$`), 'what you carry shows it');
    return { prompt: said };
  });

  let node = null;
  await step('roasting over a fire', async () => {
    // A fire to roast over: stones and wood to hand, a spot found, a ring
    // made, laid and lit with the campfire tool.
    await page.evaluate(() => {
      world.builder.gain('stone', 4);
      world.builder.gain('log', 1);
    });
    await take('fire');
    node = await page.evaluate(async () => {
      const p = world.player.pos;
      for (let r = 4; r < 20; r += 2) {
        for (let a = 0; a < 6.28; a += 0.5) {
          const x = Math.round(p.x + Math.sin(a) * r);
          const z = Math.round(p.z + Math.cos(a) * r);
          await T.aimGround(x, z, 1.4);
          if (/clear a fire pit/.test(T.prompt())) return { x, z };
        }
      }
      return null;
    });
    assert.ok(node, 'somewhere for a fire');
    assert.ok(await page.evaluate(() => T.hold('use', () => world.fires.list.size === 1, 20000)), 'a ring of stones');
    for (const step of ['lay', 'light']) {
      await page.evaluate(async () => {
        await T.idle();
        await T.frames(3);
        await T.tap('use');
        await T.idle();
      });
      if (step === 'light') assert.equal(await page.evaluate(() => world.fires.state(world.fires.list.values().next().value).state), 'burning', 'a fire burning');
    }

    await take('rifle');
    await page.evaluate((n) => T.aimGround(n.x, n.z, 1.4), node);
    const prompts = { put: await prompt() };
    assert.match(prompts.put, /click put a cut of meat on a spit over the fire/, `(prompt: "${prompts.put}")`);
    for (let i = 0; i < 2; i++) {
      await page.evaluate(async () => {
        await T.tap('use');
        await T.idle();
        await T.frames(3);
      });
    }
    assert.deepEqual(await page.evaluate(() => world.hunting.spits.serialize().map(([, , , c]) => c.length)), [2], 'two cuts on a spit');
    assert.equal((await inv()).meat, cuts - 2);
    // The first one is all but done: watch it finish over the flames.
    await page.evaluate(() => (world.hunting.spits.list.values().next().value.cuts[0] = 0.97));
    assert.ok(await page.evaluate(() => T.until(() => world.hunting.spits.list.values().next().value.cuts[0] >= 1, 20000)), 'it roasts');
    await frames(4);
    prompts.on = await prompt();
    assert.match(prompts.on, /on the spit: done, (raw|browning)/, `(prompt: "${prompts.on}")`);
    await shot('roasting');

    // Kept as it was, across a reload (give or take the moment it went on
    // roasting while the page went and came back).
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    const kept = await page.evaluate(() => world.hunting.spits.serialize());
    await open();
    const back = await page.evaluate(() => world.hunting.spits.serialize());
    assert.deepEqual(back.map(([x, z, y, c]) => [x, z, y, c.length]), kept.map(([x, z, y, c]) => [x, z, y, c.length]), 'the spit is remembered');
    back[0][3].forEach((d, i) => assert.ok(Math.abs(d - kept[0][3][i]) < 0.05, `and how done each cut is (${d} for ${kept[0][3][i]})`));

    await take('rifle');
    await page.evaluate((n) => T.aimGround(n.x, n.z, 1.4), node);
    await page.evaluate(async () => {
      await T.tap('alt');
      await T.idle();
    });
    assert.equal(await page.evaluate(() => world.hunting.spits.list.size), 0, 'the meat comes off, and the spit with it');
    assert.deepEqual(await inv(), { meat: cuts - 1, roast: 1 }, 'the done one roasted, the other back raw');
    prompts.off = await page.evaluate(() => document.getElementById('toast').textContent);
    assert.match(prompts.off, /\+1 roast meat · U to eat · 1 cut not done: back in your pack/);
    return { prompts: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.replace(/\(\d+ raw\)/, '(N raw)')])) };
  });

  await step('eating', async () => {
    await key('KeyU');
    assert.equal(await page.evaluate(() => world.player.character.raised), 'food', 'up to the mouth');
    assert.equal((await inv()).roast, 0);
    assert.ok(await page.evaluate(() => T.until(() => world.player.character.raised === null, 20000)), 'and eaten');
    const line = await page.evaluate(() => document.getElementById('inv').textContent);
    assert.doesNotMatch(line, /roast meat/, 'none left, so not on the line');
    await key('KeyU');
    assert.match(await page.evaluate(() => document.getElementById('toast').textContent), /nothing roasted to eat/);
    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row')].map((r) => r.textContent));
    await key('KeyH');
    assert.ok(help.some((r) => /^Ueat something you've roasted$/.test(r)), 'eating is on the help panel');
    const rifleKey = String((await page.evaluate(() => world.builder.slotOf('rifle'))) % 10);
    assert.ok(help.some((r) => r.startsWith(`${rifleKey}the rifle`)), `and the rifle, on ${rifleKey}`);
    return { line };
  });

  await step('how it sounds', async () => {
    // The play-through is muted: turn the sound on, put a cut over the fire
    // to sizzle, and make each of hunting's sounds.
    await page.evaluate((n) => T.aimGround(n.x, n.z, 1.4), node);
    await page.evaluate(async () => {
      await T.tap('use');
      await T.idle();
    });
    const heard = await page.evaluate(async () => {
      const s = world.sound;
      s.setEnabled(true);
      if (!(await T.until(() => s.running, 5000))) return { running: false };
      for (const kind of ['rifle', 'bolt', 'load', 'dress', 'spit', 'munch']) s.sfx(kind);
      await T.frames(60);
      const out = { running: true, layer: s.layers.some((l) => l.name === 'spits'), sizzling: !!world.hunting.spits.heard };
      s.setEnabled(false);
      return out;
    });
    if (heard.running) assert.deepEqual(heard, { running: true, layer: true, sizzling: true }, 'the meat sizzles');
    else console.log('    (no audio here: skipped)');
    await page.evaluate(async () => {
      await T.tap('alt');
      await T.idle();
    });
    assert.equal(await page.evaluate(() => world.hunting.spits.list.size), 0);
    return heard;
  });

  await step('the magazine', async () => {
    // Five into the ground, and five more pushed in.
    await page.evaluate(async () => {
      const p = world.player.pos;
      await T.lookAt(p.x + 6, world.chunks.heightAt(p.x + 6, p.z), p.z);
      for (let i = 0; i < 5; i++) {
        await T.idle();
        await T.frames(2);
        await T.tap('use');
      }
    });
    assert.equal(await page.evaluate(() => world.hunting.rifle.rounds), 0);
    await frames(4);
    const loading = await prompt();
    assert.ok(await page.evaluate(() => T.until(() => world.hunting.rifle.rounds === 5, 30000)), 'loaded again');
    assert.match(loading, /loading…/);

    // and leave no fire behind
    await take('fire');
    await page.evaluate((n) => T.aimGround(n.x, n.z, 1.4), node);
    for (let i = 0; i < 2; i++) {
      await page.evaluate(async () => {
        await T.idle();
        await T.tap('alt');
        await T.idle();
      });
    }
    assert.equal(await page.evaluate(() => world.fires.list.size), 0);
    return { loading };
  });
}
