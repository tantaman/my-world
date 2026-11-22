// Being in the town: everything from walking in through the gate to walking
// out again. None of it is needed until someone is at the gate, so it is
// fetched then (core/lazy.ts, from index.ts), and with it the town, the
// match, the bots and what they all look and sound like.
//
//   const town = openTown({ … });      once, when the gate is first stood up
//   town.enter() / town.leave()        in through the gate, and out
//   town.update(dt)                    each frame, first thing: reads the
//                                      controls while you're in, and keeps
//                                      count of who's in while you aren't
//   town.draw(dt)                      each frame: the town, in the forest's place
//   town.key(what) / town.word(what)   the town's keys (index.ts binds them),
//                                      and what each would do now
//
// While you're in, the forest isn't drawn and the town is drawn through the
// same pipeline in its place. The hiker waits by the gate (player.rides),
// out of sight; the keys are the town's own (commands.mode); and the match
// reads the controls itself, so the forest never sees the mouse move.
//
// Handed what it needs of the game, so it knows nothing else of it:
//   camera, pipeline         the forest's, to draw in the place of
//   player, input, hud, commands, save, sound, peers
//   record     what's yours there, kept by index.ts: { visited, matches, wins, rounds, kills }
//   quick      () => how fast the mouse turns you (a setting)
//   front      () => { x, y, z, yaw }: where the hiker stands meanwhile, in
//              front of the gate, and steps out to

import * as THREE from 'three';
import { Session, CHANNEL } from './net.js';
import { SkirmishLook } from './look.js';
import { SkirmishHud, named, howName, esc } from './hud.js';
import { nearness } from './sound.js';
import { NAME, BOXES, siteAt } from './town.js';
import { eyeOf, aim, rayBoxes } from './mover.js';
import { strike } from './match.js';
import { sees } from './bots.js';
import { SHOP } from './arms.js';
import { SIDES, WHY } from './rounds.js';
import { DECK, UNDER } from '../render/uniforms.js';

export { CHANNEL };
export const MODE = 'skirmish'; // the keys are the town's own while you're in it (game/commands.js): what its commands say for `mode`
const SENS = 0.0022; // rad of turn per pixel the mouse moves, in the town
const STICK_TURN = { yaw: 3.2, pitch: 2 }; // rad/s with a pad's right stick pushed all the way
const AGAIN = 2.5; // s to press L a second time to leave a match before it's over
const EXPOSURE = 1.0;
const STEP = 2.3; // m of running between footfalls
const HEARD = { shot: 110, step: 24, charge: 60, burst: 90 }; // m these carry
const WATCH_AFTER = 1.6; // s you lie where you fell before you're watching someone else
const SLOTS = ['main', 'side', 'knife', 'nade', 'charge']; // what the number row brings up
const SLACK = 3; // m from the gate the hiker can be put, by something else, before that has taken them out of the town

const _o = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };

export function openTown({ camera, pipeline, player, input, hud, commands, save, sound, peers, record, quick, front }) {
  // ── Who's in there ────────────────────────────────────────────────────────
  const session = new Session({
    say: (body, to) => save.say(CHANNEL, body, to),
    who: () => ({ id: save.me, name: save.you || 'You' }),
    others: () => (peers ? peers.count : 0),
  });
  save.on('message', (msg) => msg.ch === CHANNEL && session.hear(msg.from, msg.name, msg.body));
  // Someone who has left the world has left the town with it. (Only once
  // they've been seen here: where someone stands arrives separately from
  // what they say, and may come a moment after it.)
  const here = new Set();
  if (peers) peers.on('change', () => {
    for (const id of session.inside.keys()) if (peers.get(id)) here.add(id);
    for (const id of [...here]) {
      if (peers.get(id)) continue;
      here.delete(id);
      session.gone(id);
    }
  });

  const ui = new SkirmishHud();

  // ── In and out ────────────────────────────────────────────────────────────
  let inside = false;
  let look = null;
  let match = null; // the session's, while you're in
  let wasVisible = true;
  let leaveAsked = -Infinity;
  const cam = new THREE.PerspectiveCamera(70, camera.aspect, 0.05, 3200);
  const ambience = { ambience: 1, wildlife: 1 }; // the levels to put back
  let hold = null; // what the hiker is held by while you're in (player/rides.ts)
  // Where the hiker is meanwhile: standing by the gate. (Put anywhere else,
  // by a place picked some other way, they're out of the town: `lost`.)
  const aboard = {
    slack: SLACK,
    place(out) {
      const at = front();
      out.x = at.x;
      out.y = at.y;
      out.z = at.z;
      out.yaw = at.yaw;
    },
  };

  function enter() {
    if (inside) return false;
    if (!player.rides.free) {
      hud.flash(player.rides.why());
      return false;
    }
    // (taken from you, by something that didn't ask: you're out of the town too)
    hold = player.rides.take({ by: 'skirmish', what: `the match at ${NAME}`, aboard, lost: () => leave(false) });
    if (!hold) return false;
    inside = true;
    wasVisible = player.character.root.visible;
    player.character.root.visible = false;
    commands.mode = MODE;
    document.body.classList.add('in-skirmish');
    for (const bus of Object.keys(ambience)) {
      ambience[bus] = sound.levels[bus] ?? 1;
      sound.volume(bus, 0);
    }
    if (!look) look = new SkirmishLook(cam);
    ui.show(true);
    leaveAsked = -Infinity;
    session.enter();
    if (!record.visited) {
      record.visited = true;
      save.touch();
    }
    return true;
  }

  // out: step out in front of the gate (not when something else has taken you off)
  function leave(out = true) {
    if (!inside) return;
    inside = false;
    session.leave();
    ui.show(false);
    commands.mode = null;
    document.body.classList.remove('in-skirmish');
    for (const [bus, level] of Object.entries(ambience)) sound.volume(bus, level);
    if (hold) hold.release();
    hold = null;
    player.character.root.visible = wasVisible;
    if (!out) return;
    // out through the gate, facing the way you came
    const at = front();
    player.spawn(at.x, at.z, at.yaw);
    hud.flash(`back outside the ${NAME} gate`, 2400);
  }

  // L: once when a match is over, twice to walk out on one.
  function askLeave() {
    if (!inside) return;
    const now = performance.now() / 1000;
    if (!match || match.rounds.phase === 'ended' || now - leaveAsked < AGAIN) return leave();
    leaveAsked = now;
    ui.say('L again to walk out<small>a bot takes your place</small>', AGAIN * 1000);
  }

  // ── What happens in a match, as you see and hear it ───────────────────────
  let watch = null; // who you're watching, once you're down
  let downAt = 0; // when you went down (match.time)
  let briefed = ''; // the round and the side you've been told you're on
  const seen = new Map(); // the other side's ids -> when one of yours last saw them
  const strides = new Map(); // fighter id -> m run since their last footfall
  const mineOf = (m) => m.mine;
  // how far something in the town is from where you're seeing it from (m)
  const far = (x, z) => Math.hypot(cam.position.x - x, cam.position.z - z);
  session.on('match', (m) => {
    match = m;
    watch = null;
    seen.clear();
    strides.clear();
    ui.shop(null);
    ui.scores(null);
    if (!m) return;
    briefed = '';
    m.on('round', () => {
      watch = null;
      seen.clear();
      sound.sfx('sk-round');
    });
    m.on('live', () => ui.shopOpen || ui.quiet());
    m.on('shot', (e) => {
      look.shot(e, m);
      const f = m.fighters[e.by];
      const own = f === mineOf(m);
      const size = own ? 1 : nearness(far(e.from[0], e.from[2]), HEARD.shot) * 0.9;
      if (e.gun === 'knife') sound.sfx('sk-knife', { size });
      else if (size > 0.02) sound.sfx('sk-shot', { gun: e.gun, size });
    });
    m.on('hurt', (e) => {
      const me = mineOf(m);
      if (!me) return;
      if (e.id === me.id) {
        ui.ouch();
        sound.sfx('sk-hit');
      } else if (e.by === me.id && e.part === 'head') sound.sfx('sk-dink', { size: 1 });
    });
    m.on('kill', (e) => {
      const me = mineOf(m);
      const victim = m.fighters[e.id];
      const by = e.by >= 0 ? m.fighters[e.by] : null;
      ui.feed(`${by ? named(m, by) : ''}<i>${howName(e.how)}${e.head ? ' ✹' : ''}</i>${named(m, victim)}`);
      if (!me) return;
      if (by === me && victim !== me) {
        sound.sfx('sk-kill');
        record.kills++;
        save.touch();
      }
      if (victim === me) {
        downAt = m.time;
        watch = null;
        ui.shop(null);
        sound.sfx('sk-died');
        ui.say(`you’re down<small>${by ? `${named(m, by)} · ${howName(e.how)}` : howName(e.how)}</small>`, 2600);
      }
    });
    m.on('planting', (e) => sound.sfx('sk-planting', { size: nearness(far(m.fighters[e.id].body.pos.x, m.fighters[e.id].body.pos.z), 30) }));
    m.on('planted', (e) => {
      sound.sfx('sk-planted');
      ui.say(`the charge is set at ${esc(e.site)}<small>${m.rounds.rules.fuse} seconds</small>`, 3200, 'alarm');
    });
    m.on('picked', (e) => ui.feed(`${named(m, m.fighters[e.id])}<i>has the charge</i>`));
    m.on('dropped', (e) => {
      const me = mineOf(m);
      if (me && m.sideOf(me) === 'attack' && m.charge.state === 'dropped') ui.feed(`<i>the charge is down</i>${named(m, m.fighters[e.id])}`);
    });
    m.on('defusing', (e) => sound.sfx('sk-defusing', { size: nearness(far(m.fighters[e.id].body.pos.x, m.fighters[e.id].body.pos.z), 30) }));
    m.on('defused', () => sound.sfx('sk-defused'));
    m.on('boom', (e) => {
      look.boom(e);
      sound.sfx('sk-boom', { size: nearness(far(e.at[0], e.at[2]), 140) });
    });
    m.on('burst', (e) => {
      look.burst(e);
      const size = nearness(far(e.at[0], e.at[2]), HEARD.burst);
      const me = mineOf(m);
      sound.sfx(`sk-${e.kind}`, { size, ring: e.kind === 'flash' && me ? Math.min(1, size * 1.4) : 0 });
    });
    m.on('bought', (e) => {
      const me = mineOf(m);
      if (me && e.id === me.id) sound.sfx('sk-buy');
    });
    m.on('refused', (e) => {
      const me = mineOf(m);
      if (!me || e.id !== me.id) return;
      sound.sfx('sk-no');
      hud.flash(e.why, 1600);
    });
    m.on('won', (e) => {
      const me = mineOf(m);
      const mine = me ? m.sideOf(me) : null;
      ui.shop(null);
      ui.say(`${SIDES[e.side] || ''} win the round<small>${(WHY[e.why] || {})[e.side] || ''}</small>`, 4200, e.side);
      if (mine) {
        sound.sfx(mine === e.side ? 'sk-win' : 'sk-lose');
        record.rounds++;
        save.touch();
      }
    });
    m.on('half', () => ui.say('half time<small>the sides change over</small>', 4000));
    m.on('ended', (e) => {
      const me = mineOf(m);
      if (me) {
        record.matches++;
        if (e.winner === me.team) record.wins++;
        save.touch();
      }
    });
    m.on('match', () => ui.say('a new match', 2400));
    m.on('joined', (e) => {
      const me = mineOf(m);
      if (!me || e.id !== me.id) ui.feed(`${named(m, m.fighters[e.id])}<i>has walked in</i>`);
    });
    m.on('left', (e) => ui.feed(`<i>${esc(e.name)} has walked out:</i>${named(m, m.fighters[e.id])}<i>is back</i>`));
    // your own doings, that nobody else is told
    m.on('moved', (id, e) => {
      if (e.what === 'jump') sound.sfx('sk-jump');
      else if (e.what === 'land' && e.speed > 3) {
        sound.sfx('sk-land', { size: Math.min(1, e.speed / 12) });
        look.landed(e.speed);
      }
    });
    m.on('dry', () => sound.sfx('sk-dry'));
    m.on('draw', () => sound.sfx('sk-draw'));
    m.on('reload', (id) => {
      const gun = m.gunOf(m.fighters[id]);
      sound.sfx('sk-reload', { len: gun ? gun.reload : 2.3 });
    });
  });

  // ── The keys, in the town ─────────────────────────────────────────────────
  // What's been pressed since the match last looked (commands run first).
  const pressed = { reload: false, drop: false, pick: null, buy: null };
  const held = { crouch: false, use: false, scores: false };
  const canBuy = () => !!match && !!match.mine && match.mine.alive && match.rounds.buying && match.atHome(match.mine);
  // Each says what it would do now, where it would do something: on a touch
  // screen that is its button (src/pack/), there while it's any use.
  // your fighter, while they're standing
  const up = () => (match && match.mine && match.mine.alive ? match.mine : null);
  const lowOn = () => {
    const f = up();
    const gun = f && match.gunOf(f);
    const a = gun && f.ammo[gun.id];
    return !!a && a.mag < gun.mag && a.spare > 0 && f.reloading <= 0;
  };
  // what E would do here: set the charge, at a site with it on you; pull its fuse, beside it
  const useFor = () => {
    const f = up();
    if (!f) return '';
    const c = match.charge;
    if (f.charge && match.rounds.phase === 'live' && siteAt(f.body.pos.x, f.body.pos.z)) return 'set the charge';
    if (match.sideOf(f) === 'defend' && match.rounds.phase === 'planted' && Math.hypot(f.body.pos.x - c.x, f.body.pos.z - c.z) < 2) return 'pull the fuse';
    return '';
  };
  const shop = () => {
    if (ui.shopOpen) return ui.shop(null);
    if (!canBuy()) return hud.flash(up() ? (match.rounds.buying ? 'only at home' : 'the time to buy is over') : 'not now', 1400);
    ui.shop(match);
  };
  ui.on('buy', (item) => (pressed.buy = item));
  // A key of the town's went down (index.ts binds them, and says which).
  function key(what) {
    if (what === 'reload') pressed.reload = true;
    else if (what === 'drop') pressed.drop = true;
    else if (what === 'last' || what === 'next') pressed.pick = what;
    else if (what === 'buy') shop();
    else if (what === 'leave') askLeave();
    else if (what === 'use' || what === 'crouch' || what === 'scores') held[what] = true;
    else if (what.startsWith('row-')) {
      // the number row: what to bring up, or with the shop open, what to buy
      const i = Number(what.slice(4));
      if (ui.shopOpen) pressed.buy = SHOP[i];
      else if (SLOTS[i]) pressed.pick = SLOTS[i];
    }
  }
  // ...and what each would do now, in a word: where it would do something,
  // that is its button on a touch screen (src/pack/).
  function word(what) {
    if (what === 'reload') return lowOn() ? 'reload' : '';
    if (what === 'use') return useFor();
    if (what === 'buy') return canBuy() ? (ui.shopOpen ? 'done buying' : 'buy') : '';
    if (what === 'drop') return up() && up().charge ? 'drop the charge' : '';
    if (what === 'next') return up() ? 'next gun' : '';
    if (what === 'crouch') return up() ? 'crouch' : '';
    if (what === 'leave') return 'walk out';
    return '';
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  // First, the match reads the controls: you're in the town, not walking
  // about out here.
  const yours = { move: { x: 0, y: 0 }, turn: { yaw: 0, pitch: 0 }, jump: false, crouch: false, walk: false, fire: false, fired: false, alt: false, use: false, reload: false, drop: false, pick: null, buy: null };
  const idle = () => {
    yours.move.x = yours.move.y = yours.turn.yaw = yours.turn.pitch = 0;
    yours.jump = yours.crouch = yours.walk = yours.fire = yours.fired = yours.alt = yours.use = yours.reload = yours.drop = false;
    yours.pick = yours.buy = null;
  };
  let aimed = null;
  let lookIn = 0;
  let beepIn = 0;
  function update(dt) {
    if (!inside) {
      session.update(dt);
      return;
    }
    const looked = input.consumeLook();
    const stick = input.lookRate();
    const wheel = input.consumeZoom();
    idle();
    if (!input.blocked) {
      yours.turn.yaw = -looked.x * SENS * quick() - stick.x * STICK_TURN.yaw * dt;
      yours.turn.pitch = -looked.y * SENS * quick() - stick.y * STICK_TURN.pitch * dt;
      const m = input.moveAxes();
      yours.move.x = m.x;
      yours.move.y = m.y;
      yours.jump = input.isDown('jump') || input.jumped();
      yours.walk = input.isDown('run');
      yours.crouch = held.crouch;
      yours.fire = input.holding('use');
      yours.fired = input.tapped('use');
      yours.alt = input.tapped('alt');
      yours.use = held.use;
      yours.reload = pressed.reload;
      yours.drop = pressed.drop;
      yours.pick = pressed.pick || (wheel > 0 ? 'next' : wheel < 0 ? 'prev' : null);
      yours.buy = pressed.buy;
    }
    const scores = held.scores;
    pressed.reload = pressed.drop = false;
    pressed.pick = pressed.buy = null;
    held.crouch = held.use = held.scores = false;
    session.update(dt, yours);
    const m = match;
    if (!m) return;
    const me = m.mine;
    const R = m.rounds;

    // what you're to do this round, said once: at its start, or when you walk in on it
    if (me && R.phase !== 'ended' && R.round > 0) {
      const side = m.sideOf(me);
      const tag = `${R.round}:${side}`;
      if (tag !== briefed) {
        const task = side === 'attack' ? (me.charge ? 'you have the charge: set it at A or B' : 'get the charge to A or B, and keep it there') : 'keep the charge off A and B, or pull its fuse';
        const keys = briefed ? '<b>B</b> buys, here at home' : '<b>B</b> buys, at home · <b>H</b> lists the keys · <b>L</b> walks out';
        briefed = tag;
        ui.say(`round ${R.round} · ${SIDES[side]}<small>${task}<br>${keys}</small>`, 4600, side);
      }
    }

    // once you're down: a moment where you fell, then whoever of yours is
    // still standing; a click for the next of them
    if (me && !me.alive) {
      const mates = m.fighters.filter((f) => f.alive && f.team === me.team);
      if (watch && !watch.alive) watch = null;
      if (!watch && m.time - downAt > WATCH_AFTER) watch = mates[0] || null;
      else if (watch && yours.fired && mates.length > 1) watch = mates[(mates.indexOf(watch) + 1) % mates.length];
    } else if (!me) watch = watch && watch.alive ? watch : m.fighters.find((f) => f.alive) || null;
    else watch = null;

    // who your side can see (for the radar), and who's under your crosshair
    if ((lookIn -= dt) <= 0) {
      lookIn = 0.15;
      const team = me ? me.team : watch ? watch.team : 0;
      for (const g of m.fighters) {
        if (!g.alive || g.team === team) continue;
        if (m.fighters.some((f) => f.alive && f.team === team && sees(m, f, g) !== null)) seen.set(g.id, m.time);
      }
      aimed = null;
      if (me && me.alive) {
        _o.x = me.body.pos.x;
        _o.y = me.body.pos.y + eyeOf(me.body);
        _o.z = me.body.pos.z;
        aim(me.yaw, me.pitch, _d);
        let reach = Math.min(70, rayBoxes(_o, _d, BOXES, 70));
        for (const g of m.fighters) {
          if (g === me || !g.alive || !strike(_o, _d, g, reach, 0.1)) continue;
          // the other side only by name once they're plainly seen
          if (g.team !== me.team && sees(m, me, g) === null) continue;
          aimed = g;
          reach = Math.hypot(g.body.pos.x - _o.x, g.body.pos.z - _o.z);
        }
      }
    }

    // footfalls: anyone running, heard from where you are
    for (const f of m.fighters) {
      const b = f.body;
      const speed = Math.hypot(b.vel.x, b.vel.z);
      if (!f.alive || !b.grounded || f.walking || b.crouch > 0.5 || speed < 2.6) continue;
      const gone = (strides.get(f.id) || 0) + speed * dt;
      strides.set(f.id, gone % STEP);
      if (gone < STEP) continue;
      const size = f === me ? 0.55 : nearness(far(b.pos.x, b.pos.z), HEARD.step) * 0.8;
      if (size > 0.03) sound.sfx('sk-step', { size });
    }
    // the charge, beeping faster as its fuse runs down
    if (R.phase === 'planted' && m.charge.state === 'planted') {
      if ((beepIn -= dt) <= 0) {
        beepIn = 0.14 + 0.86 * Math.min(1, R.left / R.rules.fuse);
        sound.sfx('sk-beep', { size: nearness(far(m.charge.x, m.charge.z), HEARD.charge) });
      }
    } else beepIn = 0;

    // what a key would do, here
    let cue = '';
    if (me && me.alive) {
      const side = m.sideOf(me);
      const c = m.charge;
      if (R.phase === 'freeze') cue = `<b>B</b> buy · the round starts in ${Math.ceil(R.left)}`;
      else if (me.planting > 0) cue = 'setting the charge…';
      else if (me.defusing > 0) cue = `pulling the fuse${me.kit.kit ? ', with your kit' : ''}…`;
      else if (me.charge && R.phase === 'live') cue = siteAt(me.body.pos.x, me.body.pos.z) ? '<b>hold E</b> to set the charge here' : 'you have the charge: get it to A or B';
      else if (side === 'defend' && R.phase === 'planted' && Math.hypot(me.body.pos.x - c.x, me.body.pos.z - c.z) < 2) cue = '<b>hold E</b> to pull the fuse';
      else if (canBuy() && !ui.shopOpen && R.time < 6) cue = '<b>B</b> buy';
    } else if (R.phase === 'ended') cue = '<b>L</b> to walk out · the next match starts shortly';
    if (ui.shopOpen && !canBuy()) ui.shop(null);
    ui.update(m, { watch, seen, aimed, cue, blind: me ? Math.min(1, me.blind / 0.9) : 0, smoke: look.smoked(m) });
    if (scores || R.phase === 'ended') ui.scores(m, `<b>L</b> walks out · your record here: ${record.wins} ${record.wins === 1 ? 'win' : 'wins'} in ${record.matches} · ${record.kills} down`);
    else ui.scores(null);
  }

  // Drawing the town in place of the forest, with the forest's air (its
  // haze, its cloud, its water) taken out.
  function draw(dt) {
    if (!inside || !match) return;
    if (cam.aspect !== camera.aspect) {
      cam.aspect = camera.aspect;
      cam.updateProjectionMatrix();
    }
    look.update(dt, match, watch);
    const kept = { haze: pipeline.haze, far: pipeline.fogFar, deck: DECK.uDeckCover.value, under: UNDER.uUnder.value };
    pipeline.haze = 0;
    pipeline.fogFar = 1e7;
    DECK.uDeckCover.value = 0;
    UNDER.uUnder.value = 0;
    try {
      pipeline.render(look.scene, cam, EXPOSURE, 1, dt);
    } finally {
      pipeline.haze = kept.haze;
      pipeline.fogFar = kept.far;
      DECK.uDeckCover.value = kept.deck;
      UNDER.uUnder.value = kept.under;
    }
  }

  return {
    session,
    enter,
    leave,
    update,
    draw,
    key,
    word,
    get inside() {
      return inside;
    },
    get match() {
      return inside ? match : null;
    },
    get look() {
      return look;
    },
    get watching() {
      return watch;
    },
    // skip what's left of the freeze (or of the pause between rounds)
    hurry() {
      if (match && match.host && (match.rounds.phase === 'freeze' || match.rounds.phase === 'over')) match.rounds.left = 0;
      return match ? match.rounds.phase : null;
    },
  };
}
