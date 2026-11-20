// The save server's front door.
//
// There is almost nothing here: a world lives in its own Durable Object
// (world.js), named after the world's id, and this routes to it. The object is
// the single writer, which is what makes live building work — see world.js.
//
//   POST   /api/worlds?seed=N[&name=]        create          -> { id, gen }
//   GET    /api/worlds/:id                   open            -> a world frame
//   POST   /api/worlds/:id/ops               changes, in bulk or when offline
//   GET    /api/worlds/:id/live              the WebSocket everyone builds over
//   GET    /api/worlds/:id/meta              is it there? how big?
//   GET    /api/worlds/:id/history           the whole copies still kept
//   GET    /api/worlds/:id/revisions/:gen    one of them, as a frame

export { World } from './world.js';

const ID_LENGTH = 10;
// No vowels, and no 0/1/l/o/i/u, so ids don't spell things and survive being
// read aloud or copied by hand.
const ID_ALPHABET = '23456789bcdfghjkmnpqrstvwxyz';
const ID_RE = /^[0-9a-z]{4,32}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error('world api', err && err.stack ? err.stack : err);
      return fail(500, 'the save server broke');
    }
  },
};

async function route(request, env, url) {
  if (!env.WORLD) return fail(503, 'no world store is bound to this Worker');
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method === 'HEAD' ? 'GET' : request.method;

  if (path === '/api/worlds') {
    if (method !== 'POST') return notAllowed('POST');
    return create(request, env, url);
  }

  const m = path.match(/^\/api\/worlds\/([^/]+)(?:\/(live|ops|meta|history|revisions\/\d+))?$/);
  if (!m) return fail(404, 'no such endpoint');
  const id = decodeURIComponent(m[1]).toLowerCase();
  if (!ID_RE.test(id)) return fail(400, 'that is not a world id');
  const tail = m[2];

  if (!tail) {
    if (method !== 'GET') return notAllowed('GET');
    return send(env, id, 'open', request, url);
  }
  if (tail === 'ops') {
    if (method !== 'POST') return notAllowed('POST');
    return send(env, id, 'ops', request, url);
  }
  if (method !== 'GET') return notAllowed('GET');
  if (tail === 'live') return send(env, id, 'live', request, url);
  if (tail === 'meta' || tail === 'history') return send(env, id, tail, request, url);
  return send(env, id, `copy/${tail.slice('revisions/'.length)}`, request, url);
}

// Ids are random, so a clash is vanishingly unlikely — but the object itself
// says so (409) rather than anyone having to keep a register of them.
async function create(request, env, url) {
  const body = await request.arrayBuffer();
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    const res = await send(env, id, 'create', request, url, body);
    if (res.status !== 409) return res;
  }
  return fail(503, 'could not mint a world id');
}

function send(env, id, what, request, url, body) {
  const stub = env.WORLD.get(env.WORLD.idFromName(id));
  const forward = new Request(`https://world/${what}${url.search}`, {
    method: request.method,
    headers: request.headers,
    body: body !== undefined ? body : request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
  forward.headers.set('x-world-id', id);
  return stub.fetch(forward);
}

function newId() {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (status, error) => json(status, { error });
const notAllowed = (allow) => new Response(JSON.stringify({ error: `only ${allow} here` }), { status: 405, headers: { 'content-type': 'application/json', allow } });
