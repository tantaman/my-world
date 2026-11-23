// The camera locked behind you, switched on from the settings panel (O) as
// a visitor would: then A and D turn the hiker on the spot with the camera
// behind, W walks the way they face, S backs them up, a pad's right stick
// turns them without tipping the camera, and the help panel says so. It's still on when the game is opened again, and switched off
// again for the parts after this one.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, open, shot }) {
  await step('camera behind you', async () => {
    const flip = async () => {
      await key('KeyO');
      await page.click('#settings [data-setting="camera-behind"]');
      await key('KeyO');
      return page.evaluate(() => world.player.lockCamera);
    };
    const now = () =>
      page.evaluate(() => {
        const p = world.player;
        const off = Math.atan2(Math.sin(p.yaw + Math.PI - p.camYaw), Math.cos(p.yaw + Math.PI - p.camYaw));
        return { x: p.pos.x, z: p.pos.z, yaw: p.yaw, camYaw: p.camYaw, off };
      });
    const hold = async (code, n) => {
      await page.keyboard.down(code);
      await frames(n);
      await page.keyboard.up(code);
      await frames(20);
    };
    const moved = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

    assert.equal(await flip(), true, 'the switch locks the camera behind you');

    // A turns you on the spot, and the camera with you
    const before = await now();
    await hold('KeyA', 40);
    const turned = await now();
    const by = turned.camYaw - before.camYaw;
    assert.ok(by > 0.6, `A turns the camera round (${by.toFixed(2)} rad)`);
    assert.ok(moved(before, turned) < 0.3, `without stepping aside (${moved(before, turned).toFixed(2)} m)`);
    assert.ok(Math.abs(turned.off) < 0.1, `the hiker facing the way it looks (${turned.off.toFixed(2)} rad off)`);

    // W walks the way you face; S backs you up, still facing it
    await hold('KeyW', 40);
    const walked = await now();
    const ahead = { x: Math.sin(turned.yaw), z: Math.cos(turned.yaw) };
    const along = (walked.x - turned.x) * ahead.x + (walked.z - turned.z) * ahead.z;
    assert.ok(along > 0.8, `W walks ahead (${along.toFixed(2)} m)`);
    await shot('camera behind');
    await hold('KeyS', 40);
    const backed = await now();
    const back = (walked.x - backed.x) * ahead.x + (walked.z - backed.z) * ahead.z;
    assert.ok(back > 0.3, `S backs up (${back.toFixed(2)} m)`);
    assert.ok(Math.abs(backed.off) < 0.1, `still facing ahead (${backed.off.toFixed(2)} rad off)`);

    // a pad's right stick turns you, and pushed across with the thumb a
    // little high, as thumbs push, it doesn't tip the camera down to the ground
    const pitch = () => page.evaluate(() => world.player.camPitch);
    await page.evaluate(() => T.pad.plug(true));
    const level = await pitch();
    const yaws = [(await now()).camYaw];
    for (const way of [1, -1]) {
      await page.evaluate((x) => T.pad.stick('right', x, -0.3), way);
      await frames(60);
      yaws.push((await now()).camYaw);
    }
    await page.evaluate(() => T.pad.stick('right', 0, 0));
    await frames(5);
    const padTurned = await now();
    const tipped = (await pitch()) - level;
    assert.ok(yaws[1] < yaws[0] - 0.5 && yaws[2] > yaws[1] + 0.5, `the right stick turns you (${yaws.map((y) => y.toFixed(2)).join(', ')})`);
    assert.ok(Math.abs(tipped) < 0.01, `turning with the right stick doesn't tip the camera (${tipped.toFixed(2)} rad)`);
    assert.ok(Math.abs(padTurned.off) < 0.1, `the hiker facing the way it looks (${padTurned.off.toFixed(2)} rad off)`);
    await key('KeyQ'); // a key puts the pad down
    await page.evaluate(() => T.pad.plug(false));

    // the help panel says what the keys do now
    await key('KeyH');
    const help = await page.evaluate(() => document.getElementById('help-controls').textContent);
    await key('KeyH');
    assert.match(help, /left and right turn you/, 'the help panel says A and D turn you');

    await open('&creative');
    assert.equal(await page.evaluate(() => world.player.lockCamera), true, 'still behind you when the game is opened again');
    assert.equal(await flip(), false, 'and free again');
    return { turned: Math.round(by * 100) / 100, walked: Math.round(along * 10) / 10, backed: Math.round(back * 10) / 10, padTipped: Math.round(tipped * 1000) / 1000 };
  });
}
