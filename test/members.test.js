// Who is who in a world on the save server: the rules for names and
// passwords (src/save/who.js), and how the server keeps them
// (worker/members.js). Passwords already on the server are hashed this way,
// so a hash must keep checking out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, nameKey, nameProblem, passwordProblem, NAME_MAX, PASSWORD_MIN } from '../src/save/who.js';
import { hashPassword, checkPassword, newToken, tokenId, readCookie, sessionCookie, clearCookie, COOKIE } from '../worker/members.js';

test('a name is tidied before anyone sees it', () => {
  assert.equal(cleanName('  Ana   Lu  '), 'Ana Lu');
  assert.equal(cleanName('ben\u0000​‮'), 'ben', 'control and invisible characters go');
  assert.equal(cleanName('line\nbreak'), 'line break');
  assert.equal(cleanName(42), '');
  assert.equal(cleanName(undefined), '');
});

test('names that look the same are the same person', () => {
  assert.equal(nameKey('Ana'), nameKey('ana'));
  assert.equal(nameKey('  ANA '), nameKey('ana'));
  assert.equal(nameKey('Ａｎａ'), nameKey('ana'), 'full-width letters');
  assert.notEqual(nameKey('ana'), nameKey('anna'));
});

test('what a name and a password must be', () => {
  assert.match(nameProblem(''), /pick a name/);
  assert.equal(nameProblem('x'.repeat(NAME_MAX)), '');
  assert.match(nameProblem('x'.repeat(NAME_MAX + 1)), /at most/);
  assert.equal(nameProblem('🌲'.repeat(NAME_MAX)), '', 'counted in characters, not code units');
  assert.match(passwordProblem('x'.repeat(PASSWORD_MIN - 1)), /at least/);
  assert.equal(passwordProblem('x'.repeat(PASSWORD_MIN)), '');
  assert.match(passwordProblem(undefined), /at least/);
});

test('a password is kept as a salted hash, and checks out', async () => {
  const kept = await hashPassword('correct horse');
  assert.match(kept, /^pbkdf2-sha256\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!kept.includes('correct horse'));
  assert.equal(await checkPassword('correct horse', kept), true);
  assert.equal(await checkPassword('correct horsE', kept), false);
  assert.equal(await checkPassword('', kept), false);
  assert.notEqual(await hashPassword('correct horse'), kept, 'a new salt each time');
  assert.equal(await checkPassword('anything', 'not a hash'), false);
});

test('a hash made with fewer rounds still checks out', async () => {
  // so the count can be raised later without locking anyone out
  const kept = await hashPassword('pine needles', { iterations: 1000 });
  assert.match(kept, /^pbkdf2-sha256\$1000\$/);
  assert.equal(await checkPassword('pine needles', kept), true);
});

test('a sign-in is a random token; only its digest is kept', async () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/, 'safe in a cookie as it is');
  assert.match(await tokenId(a), /^[0-9a-f]{64}$/);
  assert.equal(await tokenId(a), await tokenId(a));
  assert.notEqual(await tokenId(a), await tokenId(b));
});

test('the cookie is for one world, kept from scripts and other sites', () => {
  const set = sessionCookie('kxbbsjfw52', 'tok', { secure: true });
  assert.match(set, new RegExp(`^${COOKIE}=tok; `));
  assert.match(set, /Path=\/api\/worlds\/kxbbsjfw52(;|$)/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Secure/);
  assert.match(set, /Max-Age=\d{7,}/);
  assert.doesNotMatch(sessionCookie('kxbbsjfw52', 'tok', { secure: false }), /Secure/, 'not on a laptop’s http');
  assert.match(clearCookie('kxbbsjfw52'), /Max-Age=0/);
  assert.equal(readCookie(`theme=dark; ${COOKIE}=abc_123-x; other=1`), 'abc_123-x');
  assert.equal(readCookie('theme=dark'), '');
  assert.equal(readCookie(null), '');
  assert.equal(readCookie(`x${COOKIE}=nope`), '', 'the whole name, not the end of another');
});
