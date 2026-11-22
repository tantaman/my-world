import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, RULES } from '../src/saltworks/match.js';
import { RELAYS } from '../src/saltworks/layout.js';
import { IDLE, controls } from '../src/saltworks/motion.js';
import { ArenaRoom } from '../worker/saltworks.js';

const packet = (seq, fields = {}) => ({ action: 'input', seq, ...fields });
const leave = { action: 'leave' };

test('a real visitor takes the bot position, health, and remaining charge', () => {
  const room = new ArenaRoom();
  const first = room.receive('p1', 'Ada', packet(1), 100);
  const { match } = room;
  const bot = match.fighters[5];
  bot.body.pos.x += 1;
  bot.hp = 32;
  bot.ammo = 7;
  const second = room.receive('p2', 'Mira', packet(1, { hp: 100, x: 1000, fire: true }), 100);
  assert.equal(first.state.me, 0);
  assert.equal(second.state.me, 5);
  assert.equal(second.epoch, first.epoch);
  assert.equal(second.state.fighters.filter((f) => f.human).length, 2);
  assert.deepEqual(second.state.fighters[5], { ...first.state.fighters[5], pos: bot.body.pos, human: true, name: 'Mira', hp: 32, ammo: 7 });
  assert.equal(bot.input.fire, false, 'initial packet cannot act before the slot has been assigned');

  room.receive('p2', 'Mira', leave, 100);
  const after = room.receive('p1', 'Ada', packet(2), 150);
  assert.equal(after.state.fighters[5].human, false);
  assert.equal(after.state.fighters[5].hp, 32);
  assert.equal(after.state.fighters[5].ammo, 7);
});

test('a full arena queues visitors and promotes them once in arrival order', () => {
  const room = new ArenaRoom();
  const enter = (i, now) => room.receive(`p${i}`, `Visitor ${i}`, packet(now), now).state;
  const results = Array.from({ length: 12 }, (_, i) => enter(i, 100));
  assert.equal(new Set(results.slice(0, 10).map((s) => s.me)).size, 10);
  assert.deepEqual(results.slice(10).map(({ me, queue }) => [me, queue]), [[null, 1], [null, 2]]);
  const gone = results[4].me;
  room.leave('p4', 100);
  assert.equal(enter(10, 150).me, gone);
  assert.equal(enter(11, 150).queue, 1);
  room.leave('p2', 150);
  assert.equal(enter(11, 200).me, results[2].me);
  assert.equal(enter(10, 200).me, gone);
});

test('a stalled visitor gives up the slot and stale controls cannot affect a fresh round', () => {
  const room = new ArenaRoom();
  const first = room.receive('p1', 'Ada', packet(1), 100);
  room.receive('p2', 'Mira', packet(1), 100);
  const second = room.receive('p2', 'Mira', packet(2), 7800);
  const expired = room.receive('p2', 'Mira', packet(3), 8150);
  assert.equal(second.state.fighters[first.state.me].human, true);
  assert.equal(expired.state.fighters[first.state.me].human, false);
  const slot = room.match.slot('p2');
  room.match.startRound();
  room.receive('p2', 'Mira', packet(4, { slot: slot.id, round: expired.state.round, fire: true }), 8200);
  assert.equal(slot.input.fire, false);
  room.leave('p2', 8200);
  const replacement = room.receive('p3', 'Jules', packet(1), 8200);
  assert.notEqual(replacement.epoch, first.epoch);
});

test('a relay transmits after the last Runner is tagged out unless Wardens disable it', () => {
  const match = new Match();
  for (const slot of match.fighters) match.join(String(slot.id), slot.botName);
  match.advance(RULES.ready + 0.1);
  const [runner, warden] = [match.fighters[0], match.fighters[5]];
  const relay = RELAYS[0];
  runner.body.pos.x = relay.x;
  runner.body.pos.z = relay.z;
  match.input(runner.owner.id, { ...IDLE, use: true });
  match.advance(RULES.activate + 0.1);
  assert.equal(match.relay, 0);
  for (const f of match.fighters.filter((f) => f.team === 0)) f.hp = 0;
  match.advance(0.2);
  assert.equal(match.phase, 'live');
  warden.body.pos.x = relay.x;
  warden.body.pos.z = relay.z;
  match.input(warden.owner.id, { ...IDLE, use: true });
  match.advance(RULES.disable + 0.1);
  assert.equal(match.winner, 1);
  assert.equal(match.reason, 'Relay disabled');
  assert.deepEqual(match.score, [0, 1]);
});

test('controls clamp movement and ignore clients claiming their own health or position', () => {
  const input = controls({ x: 400, z: 200, pitch: Infinity, yaw: 4 * Math.PI, hp: 100, pos: {}, fire: 'true', jump: true });
  assert.equal(Math.hypot(input.x, input.z), 1);
  assert.equal(input.pitch, 0);
  assert.ok(Math.abs(input.yaw) < 1e-10);
  assert.equal(input.fire, false);
  assert.equal(input.jump, true);
  assert.equal(input.hp, undefined);
  assert.equal(input.pos, undefined);
});

test('bots can navigate the saltworks, activate a relay, and finish a round', () => {
  const match = new Match();
  for (let i = 0; i < 60 && match.phase !== 'between'; i++) match.advance(1);
  assert.equal(match.phase, 'between');
  assert.ok(match.relay >= 0);
  assert.equal(match.score[0] + match.score[1], 1);
});
