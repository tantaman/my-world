// Far out: go to the far side of the world and see that it is drawn as well
// there as in the middle (src/render/origin.js).
//
// Leaves: you 4,000 km from where the play began, with a fire lit beside you.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('the far side of the world', async () => {
    // As far as the world goes: the far side of the Earth, 18,500 km from the
    // middle. The graphics card works in 32-bit floats, which out here are a
    // metre or two apart, so nothing may
    // be handed to it from this far out: each frame is drawn from an origin
    // near you, and whatever fills a buffer measures from a spot of its own
    // (src/render/origin.js). Go there, set things going, draw it, and look
    // at every number there is to draw.
    const FAR = [15987654, -9345678];
    const got = await page.evaluate(async ([x, z]) => {
      await world.teleport(x, z);
      const { player, fires, splashes, builder, wildlife, chunks, scene, origin, camera } = world;
      const p = player.pos;
      const f = fires.add(Math.round(p.x) + 3, Math.round(p.z) + 2, chunks.heightAt(p.x + 3, p.z + 2));
      fires.lay(f, 1);
      fires.light(f);
      splashes.burst(p.x + 1, p.y + 0.2, p.z + 1, p.y, 12);
      builder.chips.burst({ x: p.x + 1, y: p.y + 1, z: p.z - 1 }, 20, 0x6b5a40, 3, 1);
      for (const kind of ['fox', 'bees', 'snake']) wildlife.spawn(kind, { here: true });
      T.picture(true); // shaders, shadows and all
      await T.frames(8);
      T.picture(false);
      // m from zero: the most anything is measured across from a spot of its
      // own (the far view's outer ring, 55 km across, from its corner), and
      // far short of any number from the middle of the world
      const LIMIT = 60000;
      const big = [];
      let buffers = 0;
      const check = (o, name, arr) => {
        let most = 0;
        for (let i = 0; i < arr.length; i++) most = Math.max(most, Math.abs(arr[i]));
        buffers++;
        if (!(most <= LIMIT)) big.push(`${o.name || o.type}: ${name} reaches ${most}`);
      };
      scene.traverse((o) => {
        if (!o.geometry) return;
        for (const [name, a] of Object.entries(o.geometry.attributes)) {
          const arr = a.array || (a.data && a.data.array);
          if (a.itemSize >= 3 && arr) check(o, name, arr);
        }
        if (o.isInstancedMesh) check(o, 'instanceMatrix', o.instanceMatrix.array.subarray(0, o.count * 16));
      });
      return {
        big,
        buffers,
        at: [p.x, p.z],
        fromOrigin: Math.max(Math.abs(camera.position.x - origin.x), Math.abs(camera.position.z - origin.z)),
        // between frames, the scene is back in the world
        scene: scene.position.toArray(),
        body: [player.character.root.matrixWorld.elements[12], player.character.root.matrixWorld.elements[14]],
        aloft: { sparks: fires.fx.sp.length + fires.fx.pf.length, drops: splashes.live, chips: builder.chips.p.length, animals: wildlife.entities.length },
      };
    }, FAR);
    assert.ok(Math.hypot(got.at[0] - FAR[0], got.at[1] - FAR[1]) < 5, 'you can get there');
    assert.ok(got.fromOrigin <= 1024, `the picture is drawn from near you (${got.fromOrigin} m off)`);
    assert.ok(got.aloft.sparks > 0 && got.aloft.chips > 0 && got.aloft.animals >= 3, 'with a fire going, chips in the air and animals about');
    assert.ok(got.buffers > 50, `${got.buffers} buffers looked at`);
    assert.deepEqual(got.big, [], 'no buffer holds a number from the middle of the world');
    assert.deepEqual(got.scene, [0, 0, 0], 'and once drawn, the scene is back where it is in the world');
    assert.ok(Math.hypot(got.body[0] - got.at[0], got.body[1] - got.at[1]) < 2, 'you with it');
    // and you can still walk about
    const walked = async (code) => {
      const from = await page.evaluate(() => [world.player.pos.x, world.player.pos.z]);
      await page.keyboard.down(code);
      await frames(40);
      await page.keyboard.up(code);
      // how high you are over the ground, or over the water's surface where
      // there is water (out here that may be the open sea, far over its bed)
      const to = await page.evaluate(() => {
        const { player, chunks } = world;
        const p = player.pos;
        const w = {};
        const ground = chunks.heightAt(p.x, p.z);
        const top = chunks.waterAt(p.x, p.z, w) && w.depth > 0 ? Math.max(ground, w.level) : ground;
        return [p.x, p.z, p.y, top];
      });
      return { d: Math.hypot(to[0] - from[0], to[1] - from[1]), off: to[2] - to[3] };
    };
    const ways = [await walked('KeyW'), await walked('KeyS'), await walked('KeyA')];
    const went = Math.max(...ways.map((w) => w.d));
    assert.ok(went > 0.5, `walking goes somewhere (${went.toFixed(2)} m)`);
    assert.ok(ways.every((w) => Number.isFinite(w.off) && w.off > -3 && w.off < 3), `over the ground, or in the water on it (${ways.map((w) => w.off.toFixed(2)).join(', ')} m)`);
    await shot('the-far-side');
    return { at: got.at, fromOrigin: got.fromOrigin, buffers: got.buffers, aloft: got.aloft, walked: went };
  });
}
