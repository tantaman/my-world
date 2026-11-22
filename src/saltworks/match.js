// The live match keeps team, body, and equipment on the slot. The controller
// can change hands at any point, including while the slot is out for the round.
import { makeBody } from '../spaceport/mover.js';
import { SPAWNS, RELAYS, relayAt } from './layout.js';
import { Bot } from './bots.js';
import { IDLE, eye, forward, move, trace } from './motion.js';

export const RULES = {
  round: 80, ready: 3, between: 4, restart: 9, wins: 5,
  charge: 24, activate: 2, disable: 3, magazine: 12, reload: 1.25,
};
const BOTS = [['Copper', 'Finch', 'Silt', 'Garnet', 'Kiln'], ['Reed', 'Flint', 'Pike', 'Mica', 'Tarn']];
const PULSE = { damage: 34, interval: 0.25, visibleFor: 0.45 };
const STEP = 1 / 60;
const decimal = (n) => Math.round(n * 1000) / 1000;
const point = ({ x, y, z }) => ({ x: decimal(x), y: decimal(y), z: decimal(z) });

export class Match {
  constructor() {
    this.fighters = BOTS.flatMap((team, t) => team.map((botName, i) => ({ id: t * team.length + i, team: t, index: i, botName, owner: null })));
    this.waiting = new Map();
    this.score = [0, 0];
    this.age = 0;
    this.owed = 0;
    this.round = 0;
    this.traces = [];
    this.nextTrace = 0;
    this.startRound();
  }

  get empty() {
    return this.waiting.size === 0 && !this.fighters.some((f) => f.owner);
  }

  slot(id) {
    return this.fighters.find((f) => f.owner?.id === id);
  }

  join(id, name) {
    if (this.slot(id) || this.waiting.has(id)) return;
    this.waiting.set(id, { id, name });
    this.fill();
  }

  leave(id) {
    this.waiting.delete(id);
    const slot = this.slot(id);
    if (!slot) return;
    slot.owner = null;
    slot.bot = new Bot(slot.id);
    if (this.operator === slot) this.resetOperation();
  }

  fill() {
    const teams = this.fighters.reduce((count, f) => {
      if (f.owner) count[f.team]++;
      return count;
    }, [0, 0]);
    for (const [id, owner] of this.waiting) {
      const preferred = teams[0] <= teams[1] ? 0 : 1;
      const bot = this.fighters.find((f) => f.team === preferred && !f.owner) || this.fighters.find((f) => !f.owner);
      if (!bot) return;
      bot.owner = owner;
      bot.input = { ...IDLE, yaw: bot.yaw, pitch: bot.pitch };
      if (this.operator === bot) this.resetOperation();
      teams[bot.team]++;
      this.waiting.delete(id);
    }
  }

  input(id, input) {
    const slot = this.slot(id);
    if (slot) slot.input = input;
  }

  startRound() {
    this.round++;
    this.phase = 'ready';
    this.time = RULES.ready;
    this.relay = -1;
    this.resetOperation();
    this.winner = null;
    this.reason = '';
    this.traces.length = 0;
    for (const f of this.fighters) {
      const { x, z, yaw } = SPAWNS[f.team][f.index];
      Object.assign(f, { body: makeBody(x, 0, z), yaw, pitch: 0, hp: 100, ammo: RULES.magazine, cooldown: 0, reload: 0, bot: new Bot(f.id) });
      f.body.grounded = true;
      f.input = { ...IDLE, yaw };
    }
  }

  resetOperation() {
    this.operator = null;
    this.operatingSite = -1;
    this.progress = 0;
  }

  end(team, reason) {
    this.winner = team;
    this.reason = reason;
    this.score[team]++;
    this.phase = this.score[team] >= RULES.wins ? 'match' : 'between';
    this.time = this.phase === 'match' ? RULES.restart : RULES.between;
    this.resetOperation();
  }

  advance(dt) {
    this.owed += dt;
    while (this.owed >= STEP) {
      this.owed -= STEP;
      this.step(STEP);
    }
  }

  step(dt) {
    this.age += dt;
    this.time = Math.max(0, this.time - dt);
    while (this.traces.length && this.age - this.traces[0].at > PULSE.visibleFor) this.traces.shift();
    if (this.phase === 'match' || this.phase === 'between') {
      if (this.time <= 0) {
        if (this.phase === 'match') this.score = [0, 0];
        this.startRound();
      }
      return;
    }
    if (this.phase === 'ready' && this.time <= 0) {
      this.phase = 'live';
      this.time = RULES.round;
    }
    for (const fighter of this.fighters) {
      if (fighter.hp <= 0) continue;
      if (!fighter.owner) fighter.input = this.phase === 'live' ? fighter.bot.think(fighter, this, dt) : { ...IDLE, yaw: fighter.yaw };
      fighter.yaw = fighter.input.yaw;
      fighter.pitch = fighter.input.pitch;
      if (this.phase !== 'live') continue;
      move(fighter.body, fighter.input, dt);
      fighter.input.jump = false;
    }
    if (this.phase !== 'live') return;

    // Resolve pulses together so a team's order in the roster gives it no priority.
    const hits = [];
    for (const fighter of this.fighters) {
      if (fighter.hp > 0) this.pulse(fighter, dt, hits);
    }
    for (const victim of hits) victim.hp = Math.max(0, victim.hp - PULSE.damage);
    this.objective(dt);
  }

  pulse(f, dt, hits) {
    f.cooldown = Math.max(0, f.cooldown - dt);
    if (f.reload > 0) {
      f.reload = Math.max(0, f.reload - dt);
      if (f.reload <= 0) f.ammo = RULES.magazine;
    }
    if (f.input.reload && f.ammo < RULES.magazine && f.reload <= 0) f.reload = RULES.reload;
    if (!f.input.fire || f.cooldown > 0 || f.reload > 0) return;
    const o = eye(f.body);
    const d = forward(f.yaw, f.pitch);
    const { distance, hit } = trace(o, d, f, this.fighters);
    if (!f.owner && hit?.team === f.team) return;
    this.traces.push({ id: ++this.nextTrace, from: f.id, team: f.team, at: this.age, start: point(o), end: point({ x: o.x + d.x * distance, y: o.y + d.y * distance, z: o.z + d.z * distance }) });
    if (hit && hit.team !== f.team) hits.push(hit);
    f.cooldown = PULSE.interval;
    if (--f.ammo <= 0) f.reload = RULES.reload;
  }

  objective(dt) {
    const live = this.fighters.filter((f) => f.hp > 0);
    const active = this.relay >= 0;
    const siteFor = (f) => {
      if (!f.input.use || f.input.fire || f.team !== (active ? 1 : 0)) return -1;
      const at = relayAt(f.body.pos);
      return !active || at === this.relay ? at : -1;
    };
    const actor = live.includes(this.operator) && siteFor(this.operator) === this.operatingSite ? this.operator : live.find((f) => siteFor(f) >= 0);
    if (!actor) this.resetOperation();
    else {
      const site = siteFor(actor);
      if (actor !== this.operator || site !== this.operatingSite) this.progress = 0;
      this.operator = actor;
      this.operatingSite = site;
      this.progress += dt / (active ? RULES.disable : RULES.activate);
      if (this.progress >= 1 - 1e-6) {
        this.resetOperation();
        if (active) return this.end(1, 'Relay disabled');
        this.relay = site;
        this.time = RULES.charge;
      }
    }
    const runners = live.some((f) => f.team === 0);
    const wardens = live.some((f) => f.team === 1);
    if (!wardens && !runners) return this.end(this.relay >= 0 ? 0 : 1, 'Both teams tagged out');
    if (!wardens) return this.end(0, 'Wardens tagged out');
    if (!runners && this.relay < 0) return this.end(1, 'Runners tagged out');
    if (this.time <= 0) return this.relay >= 0 ? this.end(0, 'Relay transmitted') : this.end(1, 'Time expired');
  }

  snapshot(id) {
    return {
      me: this.slot(id)?.id ?? null,
      queue: [...this.waiting.keys()].indexOf(id) + 1,
      round: this.round, score: [...this.score], age: decimal(this.age), time: decimal(this.time),
      phase: this.phase, winner: this.winner, reason: this.reason, relay: this.relay,
      action: this.operator ? { id: this.operator.id, relay: this.operatingSite, progress: decimal(this.progress) } : null,
      fighters: this.fighters.map((f) => ({
        id: f.id, team: f.team, human: !!f.owner, name: f.owner?.name || f.botName,
        pos: point(f.body.pos), vel: point(f.body.vel), grounded: f.body.grounded,
        yaw: decimal(f.yaw), pitch: decimal(f.pitch), hp: f.hp, ammo: f.ammo, reloading: f.reload > 0,
      })),
      traces: [...this.traces],
    };
  }
}
