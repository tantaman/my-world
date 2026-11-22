// Surfing: the surf spots are in Routes and on the map; going to one sets
// you on its beach with sets of waves coming in; wading out, surf is at hand
// and you lie on a board; out past the break you wait facing in, paddle as
// a wave comes, stand up as it takes you and ride it, along the face the way
// it peels, until it's over or you go over with it; and swim, at hand, gets
// you off the board.
//
// Needs nothing from earlier parts: it finds its own break. Leaves you in
// the sea off its beach, off the board.

import assert from 'node:assert/strict';

// In the page: holding keys down frame by frame, as somebody playing does,
// and the break's own frame (out to sea along n, along the shore t).
export function inPage() {
  const down = new Set();
  T.keys = (codes) => {
    for (const c of down) if (!codes.includes(c)) {
      dispatchEvent(new KeyboardEvent('keyup', { code: c }));
      down.delete(c);
    }
    for (const c of codes) if (!down.has(c)) {
      dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      down.add(c);
    }
  };
  T.tapKey = async (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    await T.frames(2);
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  T.breakFrame = (b, x, z) => ({ u: (x - b.x) * b.nx + (z - b.z) * b.nz, v: (x - b.x) * -b.nz + (z - b.z) * b.nx });
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // A or D to come round to `aim` (+ yaw is to the left)
  T.turnTo = (yaw, aim, slack = 0.2) => {
    const d = wrap(aim - yaw);
    return d > slack ? ['KeyA'] : d < -slack ? ['KeyD'] : [];
  };
  T.wrap = wrap;
}

export default async function ({ page, step, key, frames, shot }) {
  const hand = () => page.evaluate(() => world.pack.list().hand.map((r) => ({ id: r.id, word: r.word })));
  let spot = null;

  await step('the surf, in Routes and on the map', async () => {
    await key('KeyM');
    await page.click('[data-tab="routes"]');
    await page.click('.route-lists button[data-list="surf"]');
    const first = page.locator('button[data-destination^="surf:"]').first();
    await first.waitFor({ timeout: 60000 });
    const id = await first.getAttribute('data-destination');
    await key('KeyM');
    spot = await page.evaluate((id) => {
      const s = world.surfing.spots.byId(id);
      const p = world.map.places.get(id);
      return { id, name: s.name, kind: s.kind, x: s.x, z: s.z, nx: s.nx, nz: s.nz, size: s.size, beach: s.beach, place: p && { kind: p.kind, name: p.name, note: p.note, x: p.x, z: p.z } };
    }, id);
    assert.equal(spot.place.kind, 'surf spot');
    assert.equal(spot.place.name, spot.name);
    assert.match(spot.place.note, /(peak|left-hander|right-hander).*m sets every \d+ s/);
    return spot;
  });

  await step('on its beach, the sets coming in', async () => {
    const got = await page.evaluate(async (s) => {
      await world.teleport(s.beach.x, s.beach.z, Math.atan2(s.nx, s.nz));
      await T.frames(30);
      const b = world.breakers;
      return { near: world.surfing.near?.id, set: b.spot?.id, waves: b.waves.length, layers: world.sound.layers.map((l) => l.name), hand: world.pack.list().hand.map((r) => r.id) };
    }, spot);
    assert.equal(got.near, spot.id, 'the break nearest you is rolling');
    assert.equal(got.set, spot.id);
    assert.ok(got.waves > 0, `${got.waves} waves in`);
    assert.ok(got.layers.includes('surfing'), 'and they are heard');
    assert.ok(!got.hand.includes('surf'), 'on the sand, no board yet');
    await page.evaluate(() => T.picture(true));
    await shot('surf-beach');
    await page.evaluate(() => T.picture(false));
    return got;
  });

  await step('wading out, a board is at hand, and you lie on it', async () => {
    const at = await page.evaluate(async (s) => {
      // straight out from the beach to water deeper than your waist
      for (let u = 2; u < 60; u += 1) {
        const x = s.x + s.nx * u;
        const z = s.z + s.nz * u;
        const w = {};
        if (world.chunks.waterAt(x, z, w) && w.depth > 1) {
          await world.teleport(x, z, Math.atan2(s.nx, s.nz));
          await T.frames(10);
          return { u, depth: w.depth };
        }
      }
      return null;
    }, spot);
    assert.ok(at, 'deep enough water off the beach');
    assert.deepEqual((await hand()).find((r) => r.id === 'surf'), { id: 'surf', word: 'surf' }, 'surf is at hand');
    // the pack opens on what's at hand: Enter does it
    await key('Tab');
    await key('Enter');
    await frames(10);
    const on = await page.evaluate(() => ({
      active: world.surfing.active,
      mode: world.surfing.state().mode,
      lying: !!world.player.character.hung,
      aboard: !!world.player.aboard,
      idle: world.builder.idle,
      said: document.getElementById('toast').textContent,
    }));
    assert.deepEqual({ active: on.active, mode: on.mode, lying: on.lying, aboard: on.aboard, idle: on.idle }, { active: true, mode: 'prone', lying: true, aboard: true, idle: true });
    assert.match(on.said, /^on your board at .* · paddle out past where it breaks$/);
    assert.deepEqual((await hand()).find((r) => r.id === 'surf'), { id: 'surf', word: 'swim' }, 'and swim is at hand, to get off it');
    return at;
  });

  await step('paddling out', async () => {
    // the board points out to sea: W paddles it there
    const got = await page.evaluate(async (s) => {
      const sf = world.surfing.surfer;
      const from = T.breakFrame(s, sf.x, sf.z).u;
      T.keys(['KeyW']);
      await T.until(() => T.breakFrame(s, sf.x, sf.z).u > from + 6, 60000);
      T.keys([]);
      return { from, to: T.breakFrame(s, sf.x, sf.z).u, cue: T.prompt() };
    }, spot);
    assert.ok(got.to > got.from + 5, `out from ${got.from.toFixed(0)} to ${got.to.toFixed(0)} m`);
    return got;
  });

  await step('a wave: paddle, stand up, and ride it', async () => {
    // Out past the break, as the console puts you, and then by the keys alone:
    // face in, paddle as a wave stands up behind you, space as it has you
    // (steering the way it peels, to come up angled along it), then along
    // its face. Waves aren't all alike: up to a few goes, for one ridden well.
    const goes = [];
    for (let go = 0; go < 4; go++) {
      await page.evaluate((id) => world.surfing.go(id), spot.id);
      await frames(5);
      const got = await page.evaluate(async (s) => {
        const S = world.surfing;
        const sf = S.surfer;
        const events = [];
        const hear = (e) => (a) => events.push(e + (typeof a === 'string' ? `: ${a}` : a && a.name ? `: ${a.name}` : ''));
        const heard = ['caught', 'pop', 'turn', 'tubed', 'takeoff', 'land', 'crash', 'off', 'beach'].map((e) => [e, hear(e)]);
        for (const [e, fn] of heard) sf.on(e, fn);
        const faceIn = Math.atan2(-s.nx, -s.nz);
        const side = s.kind === 'right' ? -1 : 1;
        const cues = new Set();
        let rode = null;
        let readout = '';
        const t0 = performance.now();
        while (performance.now() - t0 < 120000) {
          const w = sf.wave;
          if (sf.mode === 'prone') {
            if (rode) break;
            const keys = T.turnTo(sf.yaw, faceIn, 0.25);
            if (w && w.H > 0.5 && w.x > -2.5) keys.push('KeyW');
            T.keys(keys);
            if (sf.caught) {
              cues.add(T.prompt());
              T.keys([side > 0 ? 'KeyA' : 'KeyD']);
              await T.tapKey('Space');
            }
          } else if (sf.mode === 'riding') {
            rode ||= {};
            // along the crest the way it peels, higher or lower on the face to hold the middle of it
            let aim = sf.yaw;
            if (w) {
              const along = Math.atan2(w.iz * side, -w.ix * side);
              const inn = Math.atan2(w.ix, w.iz);
              const down = Math.max(-0.7, Math.min(0.7, (w.x / w.face + 0.45) * 0.9));
              aim = along + Math.sign(T.wrap(inn - along)) * down;
            }
            T.keys([...T.turnTo(sf.yaw, aim, 0.12), 'KeyW']);
            rode.time = S.ride.time;
            rode.distance = S.ride.distance;
            rode.top = S.ride.top;
            if (!readout) readout = document.getElementById('surf').textContent;
            cues.add(T.prompt());
          } else if (rode) break;
          await T.frames(1);
        }
        T.keys([]);
        for (const [e, fn] of heard) sf.off(e, fn);
        await T.frames(5);
        return { rode, events, cues: [...cues], readout };
      }, spot);
      goes.push(got);
      if (got.rode && got.rode.time > 3 && got.rode.distance > 15) break;
    }
    const all = goes.flatMap((g) => g.events);
    assert.ok(all.includes('caught'), `a wave took you (${all.join(', ')})`);
    assert.ok(all.includes('pop') && goes.some((g) => g.rode), 'and you stood up on it');
    assert.ok(goes.some((g) => g.cues.some((c) => /space to stand up/.test(c))), 'told to stand up');
    const ridden = goes.find((g) => g.rode && g.readout);
    assert.match(ridden.readout, /^\d+ km\/h/, `how fast, while you ride (${ridden.readout})`);
    const best = goes.filter((g) => g.rode).reduce((a, g) => (g.rode.distance > a.rode.distance ? g : a));
    assert.ok(best.rode.time > 3 && best.rode.distance > 15, `ridden ${best.rode.time.toFixed(1)} s, ${best.rode.distance.toFixed(0)} m (${goes.map((g) => g.events.join(', ')).join(' / ')})`);
    return { goes: goes.map((g) => ({ events: g.events, rode: g.rode })) };
  });

  await step('on the wave, as it looks', async () => {
    // stood up on the next one that comes, for a picture
    const ok = await page.evaluate(async () => {
      const S = world.surfing;
      if (!S.active) await S.go();
      const sf = S.surfer;
      const ok = await T.until(() => sf.wave && sf.wave.H > 0.6 && sf.wave.x < 0 && sf.wave.x > -sf.wave.face, 60000);
      if (ok) S.stand();
      return ok;
    });
    if (ok) {
      await page.evaluate(() => T.picture(true));
      await frames(3);
      await shot('surfing');
      await page.evaluate(() => T.picture(false));
    }
    return { ok };
  });

  await step('swim: off the board', async () => {
    await page.evaluate(async () => {
      if (!world.surfing.active) await world.surfing.go();
      await T.frames(3);
    });
    await key('Tab');
    await key('Enter');
    await frames(5);
    const off = await page.evaluate(() => ({ active: world.surfing.active, aboard: !!world.player.aboard, lying: !!world.player.character.hung, stood: !!world.player.character.stood }));
    assert.deepEqual(off, { active: false, aboard: false, lying: false, stood: false });
    return off;
  });
}
