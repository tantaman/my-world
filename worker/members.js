// The people a world knows: how their passwords are kept, and how a browser
// is remembered once it has signed in.
//
// People belong to one world. They live in its Durable Object beside the
// world itself (world.js), so there is nothing to set up and nothing shared
// between worlds. There is no email and no way to reset a password.
//
// A password is kept only as a salted PBKDF2-SHA256 hash, written with its
// own iteration count so the count can be raised later without locking
// anyone out. A sign-in is a random token in an HttpOnly cookie scoped to the
// one world's path; the server keeps only the token's SHA-256.
//
// Plain functions over Web Crypto, so they run in Node for the tests too.

export const COOKIE = 'mw-session';
// How long a browser stays signed in. Browsers cap cookies at 400 days.
export const SESSION_LIFE = 365 * 24 * 60 * 60 * 1000; // ms
// PBKDF2 rounds. 100,000 is the most Cloudflare's Web Crypto allows.
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const TOKEN_BYTES = 32;

const enc = new TextEncoder();

// -> "pbkdf2-sha256$<iterations>$<salt>$<hash>", base64.
export async function hashPassword(password, { salt = random(SALT_BYTES), iterations = ITERATIONS } = {}) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

export async function checkPassword(password, kept) {
  const [scheme, rounds, salt, hash] = String(kept).split('$');
  if (scheme !== 'pbkdf2-sha256' || !salt || !hash) return false;
  const again = await hashPassword(password, { salt: unb64(salt), iterations: Number(rounds) });
  return same(again.split('$')[3], hash);
}

// A new sign-in: the token goes to the browser, its id is what is kept.
export const newToken = () => b64(random(TOKEN_BYTES)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function tokenId(token) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(header, name = COOKIE) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

// Scoped to the one world, so each world remembers you separately. Strict:
// nothing on another site can make your browser act in a world as you.
// Secure wherever the site is served over https (not on a laptop's http).
export function sessionCookie(worldId, token, { secure = true } = {}) {
  return cookie(worldId, token, Math.floor(SESSION_LIFE / 1000), secure);
}

export const clearCookie = (worldId, { secure = true } = {}) => cookie(worldId, '', 0, secure);

function cookie(worldId, value, maxAge, secure) {
  const parts = [`${COOKIE}=${value}`, `Path=/api/worlds/${worldId}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function random(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Compared in full whatever the first difference, so the time taken says
// nothing about how close a guess was.
function same(a = '', b = '') {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
