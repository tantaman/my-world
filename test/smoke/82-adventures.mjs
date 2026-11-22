// Adventures: the board (I), a twister that picks you up and throws you, a
// bear brought down with the rifle, the stronghold's men shot and shooting
// back, a fire that gets you and sets you down where it began, and your
// record kept across a reload.
//
// Needs nothing from earlier parts: it goes back to where the path starts.
// Uses hunting's helpers in the page (T.body, T.lookAt, T.idle). It comes
// after mounts because it takes you all over the place, and word of where
// the wild horse is comes as you go. Leaves nothing behind: every adventure
// is over or given up, and the bear it brings down is cleared away.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, take, frames, open, shot }) {
  const view = () => page.evaluate(() => world.adventures.view());

  await step('the board', async () => {
    await page.evaluate(async () => {
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
    });
    await key('KeyN');
    const board = await page.evaluate(() => ({
      open: document.getElementById('adventures').classList.contains('open'),
      rows: [...document.querySelectorAll('#adventures [data-act="go"]')].map((b) => b.dataset.kind),
      rec: document.querySelector('#adventures .adv-board-rec').textContent,
    }));
    assert.ok(board.open, 'I opens the board');
    // the ones this feature defines, in the order it defines them. Another
    // feature may add its own (adventures.define), and they come after these:
    // adding one shouldn't mean editing this part.
    const own = ['tornado', 'hurricane', 'wildfire', 'avalanche', 'bear', 'lion', 'stronghold', 'cave'];
    assert.deepEqual(board.rows.slice(0, own.length), own);
    assert.equal(board.rec, 'not yet tried');
    await shot('board');
    await key('Escape');
    assert.ok(!(await page.evaluate(() => document.getElementById('adventures').classList.contains('open'))), 'Escape closes it');
    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row')].map((r) => r.textContent));
    await key('KeyH');
    assert.ok(help.some((r) => /^Nadventures · start one, or give it up$/.test(r)), 'it is on the help panel');
    // the corner button opens it too
    await page.click('#adventure-btn');
    assert.ok(await page.evaluate(() => document.getElementById('adventures').classList.contains('open')));
    await key('Escape');
    return board;
  });

  await step('a twister', async () => {
    await key('KeyN');
    await page.click('#adventures [data-kind="tornado"]');
    await frames(30);
    const on = await page.evaluate(() => ({
      state: world.adventures.state,
      funnel: !!world.scene.getObjectByName('twister'),
      banner: document.getElementById('adventure').textContent.replace(/\s+/g, ' ').trim(),
      dark: world.sky.overcast,
    }));
    assert.equal(on.state, 'on');
    assert.ok(on.funnel, 'a funnel in the sky');
    assert.match(on.banner, /^TORNADO ?\d:\d\d keep clear of the twister until it lifts ◆ the twister · \d+ m/);
    assert.ok(on.dark > 0.05, `the sky darkens (${on.dark})`);
    // walk into it
    const thrown = await page.evaluate(async () => {
      const run = world.adventures.run;
      run.aimIn = 999;
      await world.teleport(run.x + 5, run.z);
      let up = 0;
      await T.until(() => {
        up = Math.max(up, world.player.vel.y);
        return world.adventures.health < 100 && up > 5;
      }, 30000);
      return { health: world.adventures.health, up, note: world.adventures.view().note };
    });
    assert.ok(thrown.health < 100 && thrown.up > 5, `it picks you up and throws you (${JSON.stringify(thrown)})`);
    await shot('twister');
    // given up from the board
    await key('KeyN');
    assert.match(await page.evaluate(() => document.querySelector('#adventures .adv-board-now').textContent), /on now: Tornado/);
    await page.click('#adventures [data-act="quit"]');
    await frames(5);
    const off = await page.evaluate(() => ({ state: world.adventures.state, funnel: !!world.scene.getObjectByName('twister'), banner: document.getElementById('adventure').hidden }));
    assert.deepEqual(off, { state: 'idle', funnel: false, banner: true }, 'given up: all of it gone');
    return { thrown };
  });

  await step('a bear, and the rifle', async () => {
    await page.evaluate(async () => {
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
      world.hunting.carcasses.clear();
      world.adventures.begin('bear');
      await T.frames(5);
    });
    // it comes for you, and gets you
    const mauled = await page.evaluate(async () => {
      const a = world.adventures;
      const b = a.run.prowler;
      const p = world.player.pos;
      b.x = p.x + 8;
      b.z = p.z;
      b._set('charge');
      await T.until(() => a.health < 100, 30000);
      return { health: a.health, mind: b.mind };
    });
    assert.ok(mauled.health < 100, `mauled (${mauled.health})`);
    assert.equal(mauled.mind, 'back', 'and it backs off');
    // the rifle in hand, however many tools share its number: pressing the
    // number once can as easily put away what you are already holding
    await take('rifle');
    const shots = await page.evaluate(async () => {
      const a = world.adventures;
      const b = a.run.prowler;
      const said = [];
      for (let k = 0; k < 8 && a.state === 'on'; k++) {
        b._set('back', 999);
        b.speed = 0;
        await T.frames(2);
        const body = T.body(b);
        await T.lookAt(body.x, body.y, body.z);
        await T.idle();
        const prompt = T.prompt();
        await T.tap('use');
        await T.idle();
        said.push({ prompt: prompt.replace(/\d+ m/, 'N m').replace(/\(\d rounds?\)/, '(N rounds)'), hp: b.hp, toast: document.getElementById('toast').textContent });
      }
      await T.frames(5);
      return { said, state: a.state, outcome: a.outcome, line: a.line, kill: world.hunting.carcasses.list.map((c) => c.kind), record: a.record.bear };
    });
    assert.ok(shots.said.some((s) => /^the black bear · N m · click shoot \(N rounds\)/.test(s.prompt)), `the crosshair names it (${JSON.stringify(shots.said)})`);
    assert.equal(shots.outcome, 'won');
    assert.match(shots.line, /you brought down the black bear/);
    assert.deepEqual(shots.kill, ['bear'], "it's a kill to dress, like any other");
    assert.deepEqual(shots.record, { tries: 1, won: 1, best: shots.record.best });
    assert.ok(await page.evaluate(() => T.until(() => world.adventures.state === 'idle', 30000)), 'and it is over');
    await page.evaluate(() => world.hunting.carcasses.clear());
    return { said: shots.said.map((s) => s.toast) };
  });

  await step('the stronghold', async () => {
    const camp = await page.evaluate(async () => {
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
      world.adventures.begin('stronghold');
      await T.frames(5);
      const run = world.adventures.run;
      const c = run.camp.fire;
      const p = world.player.pos;
      return { far: Math.hypot(c.x - p.x, c.z - p.z), men: run.guards.list.length, solids: world.solids.owners.get(run.owner).length, walls: run.camp.walls.length };
    });
    assert.ok(camp.far > 100, `off a way (${camp.far} m)`);
    assert.equal(camp.men, 8);
    assert.ok(camp.solids > 20 && camp.walls > 20, 'a stockade you bump into, and that stops a shot');
    // a man at the gate, shot from in front of it
    const shot1 = await page.evaluate(async () => {
      const run = world.adventures.run;
      const g = run.guards.list.find((m) => m.role === 'post');
      const c = run.camp.fire;
      let prompt = '';
      const tries = []; // what each go at it saw, for when none of them works
      // The camp is somewhere new each time, and a tree or a boulder outside
      // it can stand in the line of fire (and stops a shot, as it should). So
      // each go is from somewhere else out in front of the gate: nearer, and
      // to one side. He turns, too, once he's seen you.
      const FROM = [[22, 0], [14, 0], [9, 0], [14, 2.5], [14, -2.5], [9, 2], [9, -2], [6, 0]]; // m out from him, and to the side
      for (let k = 0; k < FROM.length && !g.down; k++) {
        const [out, side] = FROM[k];
        const l = Math.hypot(g.x - c.x, g.z - c.z);
        const ux = (g.x - c.x) / l;
        const uz = (g.z - c.z) / l;
        await T.standAndAim(g.x + ux * out - uz * side, g.z + uz * out + ux * side, g.x, g.y + 1.1, g.z);
        await T.idle();
        await T.frames(4);
        prompt = T.prompt();
        tries.push({ out, side, prompt });
        if (!/^an outlaw/.test(prompt)) continue;
        await T.tap('use');
        await T.idle();
        await T.frames(3);
      }
      return { tries, prompt: prompt.replace(/\d+ m/, 'N m').replace(/\(\d rounds?\)/, '(N rounds)'), down: g.down, left: run.guards.left, toast: document.getElementById('toast').textContent, alerted: run.guards.alerted };
    });
    assert.match(shot1.prompt, /^an outlaw · N m · click shoot/, `the crosshair names him (${JSON.stringify(shot1.tries)})`);
    assert.ok(shot1.down, `he is down (${JSON.stringify(shot1.tries)})`);
    assert.equal(shot1.left, 7);
    assert.match(shot1.toast, /an outlaw is down · 7 left/);
    assert.ok(shot1.alerted, 'and the rest know you are there');
    await shot('stronghold');
    // ...and they shoot back
    const back = await page.evaluate(async () => {
      const a = world.adventures;
      const was = a.health;
      a.run._fire(a.run.guards.list.find((m) => !m.down), true);
      return { was, now: a.health };
    });
    assert.ok(back.now < back.was, 'a bullet of theirs hurts');
    await page.evaluate(() => world.adventures.abandon());
    const gone = await page.evaluate(() => ({ object: !!world.scene.getObjectByName('stronghold'), solids: [...world.solids.owners.keys()].filter((o) => o && o.stronghold).length }));
    assert.deepEqual(gone, { object: false, solids: 0 }, 'given up: the camp is gone, walls and all');
    return { prompt: shot1.prompt };
  });

  await step("a fire that gets you", async () => {
    const home = await page.evaluate(async () => {
      const s = world.player.start;
      await world.teleport(s.x, s.z, s.yaw);
      world.adventures.begin('wildfire');
      await T.frames(5);
      return { x: world.player.pos.x, z: world.player.pos.z };
    });
    const caught = await page.evaluate(async () => {
      const a = world.adventures;
      const run = a.run;
      run.t = 40; // well under way
      await T.frames(3);
      // into the flames, and stay there
      const keepIn = () => {
        const p = run._at(run.where.i, 4, {});
        world.player.pos.x = p.x;
        world.player.pos.z = p.z;
      };
      const ok = await T.until(() => {
        keepIn();
        return a.outcome === 'lost';
      }, 60000);
      return { ok, line: a.line, flames: run.flames.count };
    });
    assert.ok(caught.ok, 'the fire gets you');
    assert.match(caught.line, /you didn't make it · caught in the fire/);
    assert.ok(caught.flames > 10, 'there were flames');
    const after = await page.evaluate(async (h) => {
      await T.until(() => Math.hypot(world.player.pos.x - h.x, world.player.pos.z - h.z) < 1, 20000);
      return { back: Math.hypot(world.player.pos.x - h.x, world.player.pos.z - h.z), card: document.getElementById('adv-card').textContent };
    }, home);
    assert.ok(after.back < 1, `set down where it began (${after.back} m off)`);
    assert.match(after.card, /YOU DIDN'T MAKE IT/);
    assert.ok(await page.evaluate(() => T.until(() => world.adventures.state === 'idle', 30000)), 'and it is over');
    return { line: caught.line };
  });

  await step('your record, kept', async () => {
    await page.evaluate(() => T.frames(140)); // long enough for it to be written down
    await open();
    const rec = await page.evaluate(() => world.adventures.record);
    assert.equal(rec.bear.won, 1, 'the bear you brought down');
    assert.equal(rec.wildfire.tries, 1);
    assert.equal(rec.wildfire.won, 0);
    await key('KeyN');
    const said = await page.evaluate(() => document.querySelector('#adventures [data-kind="bear"] .adv-board-rec').textContent);
    await key('Escape');
    assert.match(said, /^made it once · best \d:\d\d$/);
    return { said };
  });
}
