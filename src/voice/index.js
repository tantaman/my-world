// Talking to each other, in a world you share.
//
// Two ways, both push to talk:
//
//   aloud   hold C. Your own voice, heard from where you stand by whoever is
//           near enough (it carries about 40 m, and fades well before).
//   radio   hold X. The hiker unclips the radio from the pack strap and
//           talks into it, and everyone in the world hears it, wherever they
//           are: everyone's radio is always on, so you hear all the chatter.
//           Whoever is beside you hears your own voice as well.
//
// Voice goes browser to browser (mesh.js); the world's object only passes on
// the messages that set that up, and who is talking how (src/save: say() and
// 'message', on the channels 'rtc' and 'voice'). Nothing is recorded or kept.
// The microphone isn't asked for until you first talk (mic.js).
//
// In a world that lives in only one browser there is nobody to talk to, and
// the keys say so.

import { Talk, QUIET, RADIO, MODES } from './talk.js';
import { Mic } from './mic.js';
import { Mesh } from './mesh.js';
import { Voices, REACH } from './voices.js';
import { TalkBars } from './bars.js';
import { VoiceScreen } from './onScreen.js';
import { walkie } from './walkie.js';
import { formatDistance } from '../core/format.js';

const MOUTH = 1.62; // m above the ground a hiker talks from
const NO_MIC = {
  blocked: 'the microphone is blocked · allow it for this site to talk',
  none: 'no microphone found',
  insecure: 'talking needs the site on https',
};

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'player', 'audio', 'save'];
export function installVoice(game) {
  const { save, peers, player, sound, hud, commands, input, scene } = game;

  const talk = new Talk();
  const mic = new Mic();
  const mesh = new Mesh({
    signal: (to, body) => save.say('rtc', body, to),
    servers: () => iceServers(save.id),
  });
  const mouthOf = (p) => (p ? { x: p.pos.x, y: p.pos.y + MOUTH, z: p.pos.z } : null);
  const voices = new Voices({ where: (id) => mouthOf(peers.get(id)), ear: () => mouthOf(player) });
  sound.addLayer(voices.layer());
  const bars = new TalkBars(scene);
  const touch = { aloud: false, radio: false }; // the on-screen buttons
  const screen = new VoiceScreen({ hold: (which, down) => (touch[which] = down) });

  const modes = new Map(); // id -> how they are talking (only those who are)
  game.provide('voice', {
    talk,
    mic,
    mesh,
    voices,
    // -> [{ id, name, mode, level, heard: { aloud, radio }, line }]: everyone
    // here, how they are talking, how loud, how loud that reaches you, and
    // how the line to them is
    list: () =>
      peers.list().map((p) => ({
        id: p.id,
        name: p.name,
        mode: modes.get(p.id) || QUIET,
        level: voices.level(p.id),
        heard: voices.heard(p.id),
        line: mesh.links.get(p.id)?.state || 'none',
      })),
  });

  // ── Everyone carries a radio ──────────────────────────────────────────────
  const armed = new WeakSet();
  const giveRadio = (character) => {
    if (armed.has(character)) return;
    armed.add(character);
    const { held, stowed } = walkie();
    character.addRaised('radio', held, { stowed });
  };
  giveRadio(player.character);

  // ── Talking ───────────────────────────────────────────────────────────────
  const held = { aloud: false, radio: false }; // the keys, this frame
  let hushed = false; // no microphone: say nothing more until the key is let go
  const able = () => {
    if (!save.id) hud.flash('talking needs a shared world · L to put this one on the server');
    else if (!save.connected) hud.flash('not connected · nobody can hear you');
    return save.connected;
  };
  commands.add({ id: 'talk', keys: ['KeyC'], group: 'TALK', help: 'hold C', label: 'talk to whoever is near', run: able, hold: () => (held.aloud = true) });
  commands.add({ id: 'radio', keys: ['KeyX'], group: 'TALK', help: 'hold X', label: 'talk on the radio, to everyone', run: able, hold: () => (held.radio = true) });

  talk.on('change', (mode, was) => {
    mic.live = mode !== QUIET;
    save.say('voice', { mode });
    player.character.raise(mode === RADIO ? 'radio' : null);
    if (mode === RADIO || was === RADIO) voices.keyed(mode === RADIO);
  });
  mic.on('track', (track) => {
    mesh.setTrack(track);
    voices.setMine(track);
  });
  mic.on('denied', (why) => {
    hushed = true;
    talk.stop();
    hud.flash(NO_MIC[why] || NO_MIC.none);
  });

  // ── Everyone else ─────────────────────────────────────────────────────────
  mesh.on('track', (id, track) => voices.add(id, track));
  mesh.on('drop', (id) => voices.remove(id));

  let warned = false;
  function heard(id, name, mode) {
    if ((modes.get(id) || QUIET) === mode) return;
    // Everyone here says where they are several times a second; someone who
    // hasn't yet can't be placed, shown or hung up on, so isn't heard either.
    if (mode !== QUIET && !peers.get(id)) return;
    if (mode === QUIET) modes.delete(id);
    else modes.set(id, mode);
    voices.mode(id, mode);
    const p = peers.get(id);
    if (p) p.character.raise(mode === RADIO ? 'radio' : null);
    if (mode !== QUIET && !sound.enabled && !warned) {
      warned = true;
      hud.flash(`${name || 'someone'} is talking · sound is off (N)`);
    }
  }
  save.on('message', (m) => {
    if (m.ch === 'rtc') mesh.heard(m.from, m.body);
    else if (m.ch === 'voice' && m.body) heard(m.from, m.name, MODES.includes(m.body.mode) ? m.body.mode : QUIET);
  });

  let known = new Set();
  peers.on('change', () => {
    const ids = peers.list().map((p) => p.id);
    for (const id of ids) {
      const p = peers.get(id);
      giveRadio(p.character);
      p.character.raise(modes.get(id) === RADIO ? 'radio' : null);
      // someone new, while you are mid-sentence: they need telling
      if (!known.has(id) && talk.talking) save.say('voice', { mode: talk.mode }, id);
    }
    for (const id of [...modes.keys()]) if (!peers.get(id)) heard(id, '', QUIET);
    known = new Set(ids);
    mesh.sync(save.me, ids);
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  game.addSystem({
    name: 'talk',
    phase: 'update',
    update({ dt, now }) {
      const aloud = held.aloud || touch.aloud;
      const radio = held.radio || touch.radio;
      held.aloud = held.radio = false;
      if (hushed && !aloud && !radio) hushed = false;
      const can = save.connected && !hushed;
      talk.update(dt, { aloud: can && aloud, radio: can && radio });
      mic.update(now);
      mesh.update(now);
    },
  });

  const talking = [];
  game.addSystem({
    name: 'voices',
    phase: 'world',
    update({ dt }) {
      talking.length = 0;
      for (const [id] of modes) {
        const p = peers.get(id);
        if (p) talking.push({ id, x: p.pos.x, y: p.pos.y, z: p.pos.z, level: voices.level(id), colour: p.colour });
      }
      bars.update(talking, player.camYaw, dt);
    },
  });

  game.addSystem({
    name: 'voice screen',
    phase: 'late',
    update() {
      screen.showButtons(input.isTouch && !!save.id);
      const rows = [];
      if (talk.talking) {
        rows.push({ key: 'you', name: save.you || 'you', how: talk.mode === RADIO ? 'on the radio' : 'talking', level: voices.myLevel(), radio: talk.mode === RADIO, you: true });
      }
      for (const [id, mode] of modes) {
        const p = peers.get(id);
        if (!p) continue;
        const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        if (mode === RADIO) rows.push({ key: id, name: p.name || 'someone', how: 'radio', level: voices.level(id), radio: true });
        else if (d < REACH) rows.push({ key: id, name: p.name || 'someone', how: formatDistance(d), level: voices.level(id) });
      }
      screen.show(rows);
    },
  });
}

// How to reach each other from here (worker/ice.js).
async function iceServers(id) {
  if (!id) return [];
  const res = await fetch(`/api/worlds/${encodeURIComponent(id)}/voice`);
  if (!res.ok) throw new Error(`the save server said ${res.status}`);
  const { iceServers: list } = await res.json();
  return Array.isArray(list) ? list : [];
}
