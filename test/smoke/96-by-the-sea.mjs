// A real place of its own kind of country, by the sea: its streams run, and
// where the sea breaks on its shore there is surf to hear.
//
// Leaves: you standing on the shore of a hike that has one, looking out to sea.

import assert from 'node:assert/strict';

export default async function ({ page, step, shot }) {
  await step('a hike by the sea', async () => {
    // A real place of its own kind of country, by the sea: the streams on
    // its map run, and where the sea breaks on its shore there is surf to hear.
    const got = await page.evaluate(async () => {
      const h = world.hikes.list().find((x) => x.water.includes('the sea') && x.water.length > 1);
      if (!h) return null;
      await world.hikes.go(h.id, 'view');
      const { gen, chunks, player, sound } = world;
      const L = gen.lands.find((l) => l.def.id === h.id);
      const out = { hike: h.id, country: L.def.country || 'forest', pieces: L.segs.length, layers: sound.layers.map((l) => l.name) };
      // beside the stretch of stream nearest the view that has grown to some size
      const here = (s) => Math.hypot(s.pts[0] - player.pos.x, s.pts[1] - player.pos.z);
      const [piece] = L.segs.filter((s) => Math.min(s.w0, s.w1) > 1).sort((a, b) => here(a) - here(b));
      const mid = Math.floor(piece.count / 2) * 2;
      await world.teleport(piece.pts[mid] + 3, piece.pts[mid + 1] + 3);
      await T.frames(20);
      const w = { sources: [] };
      chunks.waterAround(player.pos.x, player.pos.z, 45, w);
      out.running = w.count;
      // and on the shore: the nearest dry ground a few metres from the sea
      const p = { x: player.pos.x, z: player.pos.z };
      let shore = null;
      for (let r = 6; r < 900 && !shore; r += 6) {
        for (let a = 0; a < 6.28 && !shore; a += 6 / r) {
          const [x, z] = [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r];
          const u = L.shore(x, z);
          if (L.sea && u > 2 && u < 6) shore = { x, z };
        }
      }
      if (shore) {
        await world.teleport(shore.x, shore.z);
        await T.frames(20);
        chunks.waterAround(player.pos.x, player.pos.z, 45, w);
        out.surf = w.surf;
        out.from = Math.hypot(w.ux - player.pos.x, w.uz - player.pos.z);
        // look out to sea, for the picture
        world.look(Math.atan2(w.ux - player.pos.x, w.uz - player.pos.z) + Math.PI, 0.3, 8);
        await T.frames(20);
      }
      return out;
    });
    if (!got) return console.log('    (no hike by the sea with a stream: skipped)');
    assert.notEqual(got.country, 'forest', 'it is its own kind of country');
    assert.ok(got.pieces > 0 && got.running > 0, `a stream runs there, and is heard (${got.running} of it near)`);
    assert.ok(got.surf > 0.3, `by the shore the sea breaks (${got.surf})`);
    assert.ok(got.from < 45, `near enough to hear (${got.from} m)`);
    assert.ok(got.layers.includes('surf'), 'and there is a sound for it');
    await shot('by-the-sea');
    return got;
  });
}
