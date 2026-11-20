// How two browsers in a world find a way through to each other, to talk.
//
// Voice goes browser to browser (WebRTC), not through the world's object:
// the object only passes on the few small messages that set a call up. To
// find a path between two browsers behind home routers, each asks a STUN
// server what it looks like from outside, which is free and is enough most of
// the time. Where neither side can be reached that way (some offices, some
// phone networks) the audio has to be relayed by a TURN server, which carries
// every packet and so needs an account.
//
// Give the Worker a Cloudflare TURN key — TURN_KEY_ID as a variable and
// TURN_KEY_API_TOKEN as a secret — and each person asking is handed
// credentials for it that run out after TURN_TTL. Without one, STUN only.

export const STUN = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
const TURN_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';
export const TURN_TTL = 12 * 60 * 60; // seconds TURN credentials last

// -> the iceServers to hand an RTCPeerConnection. Never throws: a TURN
// service that is down still leaves STUN.
export async function iceServers(env, { fetch = globalThis.fetch } = {}) {
  if (!env || !env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return STUN;
  try {
    const res = await fetch(`${TURN_API}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL }),
    });
    if (!res.ok) throw new Error(`the TURN service said ${res.status}`);
    const list = usable((await res.json()).iceServers);
    return list.length ? list : STUN;
  } catch (err) {
    console.error('turn', err && err.message ? err.message : err);
    return STUN;
  }
}

// Browsers block port 53, and an address on it only waits to time out.
function usable(servers) {
  if (!Array.isArray(servers)) return [];
  const out = [];
  for (const s of servers) {
    if (!s || typeof s !== 'object') continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u));
    if (!urls.length) continue;
    const server = { urls };
    if (typeof s.username === 'string') server.username = s.username;
    if (typeof s.credential === 'string') server.credential = s.credential;
    out.push(server);
  }
  return out;
}
