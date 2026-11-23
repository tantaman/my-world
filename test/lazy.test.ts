// Code fetched when it's first wanted, once (src/core/lazy.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Lazy } from '../src/core/lazy.ts';

test('nothing is fetched until it is wanted, and then once', async () => {
  let fetches = 0;
  const look = new Lazy(async () => (fetches++, { build: () => 'a store' }));
  assert.equal(fetches, 0);
  assert.equal(look.want(), null, 'not here yet');
  assert.equal(look.want(), null);
  assert.equal(fetches, 1, 'asked for once, however often it is wanted');
  const m = await look.ready();
  assert.equal(m.build(), 'a store');
  assert.equal(look.want(), m, 'and from then on it is simply here');
  assert.equal(fetches, 1);
});

test('ready sends for it too, and hands back the same one', async () => {
  let fetches = 0;
  const look = new Lazy(async () => ({ n: ++fetches }));
  const [a, b] = await Promise.all([look.ready(), look.ready()]);
  assert.equal(a, b);
  assert.equal(fetches, 1);
  assert.equal(look.loaded, a);
});

test('a fetch that fails is asked for again, but not straight away', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let now = 0;
  let fetches = 0;
  let up = false;
  const look = new Lazy(
    async () => {
      fetches++;
      if (!up) throw new Error('the server is down');
      return { ok: true };
    },
    { clock: () => now },
  );
  assert.equal(look.want(), null);
  await assert.rejects(look.ready(), /the server is down/);
  assert.equal(fetches, 1);
  look.want();
  look.want();
  assert.equal(fetches, 1, 'not every frame');
  now += 2100; // after the first wait
  look.want();
  assert.equal(fetches, 2);
  await new Promise((r) => setTimeout(r, 0));
  now += 2100; // not long enough the second time
  look.want();
  assert.equal(fetches, 2);
  up = true;
  now += 5000;
  assert.equal(look.want(), null);
  assert.deepEqual(await look.ready(), { ok: true });
  assert.equal(fetches, 3);
});
