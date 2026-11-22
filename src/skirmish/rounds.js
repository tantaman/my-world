// The rules of a match: rounds, the clock, the score and what each round
// pays.
//
// Two teams of five. One attacks (the Raiders) and one defends (the
// Wardens), and they change over at half time. A round goes:
//
//   freeze    a few seconds at home to buy; nobody can move
//   live      the Raiders have until the clock runs out to set the charge at
//             one of the two sites; the Wardens to stop them
//   planted   the charge is set and its fuse is burning: the Wardens have
//             that long to pull it
//   over      somebody has won the round; a few seconds, then the next
//
// The Raiders win a round by killing every Warden, or by the charge going
// off. The Wardens win by killing every Raider before the charge is set, by
// the clock running out before it is, or by pulling its fuse. First to WIN
// rounds takes the match; all square after twice HALF rounds is a draw.
//
// Money: winning pays, losing pays less but more each time it happens again,
// and that is what the next round's guns are bought with (arms.js).
//
// No three.js in here, and nothing about where anyone is: the match
// (match.js) says how many of each side are standing and when the charge is
// set or pulled, and this keeps the clock and the score.
//
// Emits:
//   'round'  ({ round, attackers })       a round begins (in its freeze)
//   'live'   ()                           the freeze is over
//   'won'    ({ side, team, why, pay })   a round is won: side 'attack' |
//            'defend'; why 'eliminated' | 'time' | 'exploded' | 'defused';
//            pay { attack, defend, keepNothing } in $ (keepNothing: Raiders
//            who sat out the clock alive are paid nothing)
//   'half'   ({ attackers })              the teams change sides
//   'ended'  ({ winner })                 the match is over: a team (0 | 1), or null for a draw
//   'match'  ()                           a new match begins

import { Emitter } from '../core/events.js';

export const RULES = {
  win: 13, // rounds to take the match
  half: 12, // rounds before the teams change sides
  freeze: 8, // s at home before a round goes live
  round: 115, // s to set the charge
  fuse: 40, // s from the charge being set to its going off
  plant: 3.2, // s to set it
  defuse: 10, // s to pull its fuse...
  kitDefuse: 5, // ...with a kit
  buy: 20, // s into a round you can still buy, at home
  after: 6, // s between a round being won and the next
  ended: 15, // s the final score is up before a new match
};

export const PAY = {
  win: 3250,
  charge: 3500, // a round won by the charge going off, or by pulling it
  loss: 1400, // the least a lost round pays...
  again: 500, // ...and more for each lost before it without a win between,
  streak: 4, // up to this many times over
  planted: 800, // more for Raiders who set the charge and lost all the same
  plant: 300, // to whoever sets it
  defuse: 300, // to whoever pulls it
};

export const SIDES = { attack: 'Raiders', defend: 'Wardens' };

export class Rounds extends Emitter {
  constructor(rules = RULES) {
    super();
    this.rules = rules;
    this._reset();
  }

  _reset() {
    this.round = 0;
    this.phase = 'freeze';
    this.left = 0; // s of this phase to go
    this.time = 0; // s since the round went live
    this.score = [0, 0]; // by team
    this.attackers = 0; // the team that attacks
    this.losses = [1, 1]; // rounds each has lost without a win between (a first loss pays as a second)
    this.planted = false;
    this.last = null; // how the last round went: { side, team, why }
    this.winner = undefined; // of the match, once it's over
  }

  sideOf(team) {
    return team === this.attackers ? 'attack' : 'defend';
  }

  teamOf(side) {
    return side === 'attack' ? this.attackers : 1 - this.attackers;
  }

  // Can things be bought now (by someone at home)?
  get buying() {
    return this.phase === 'freeze' || (this.phase === 'live' && this.time < this.rules.buy);
  }

  // Start the first round of a match.
  begin() {
    this._reset();
    this._next();
  }

  _next() {
    this.round++;
    this.phase = 'freeze';
    this.left = this.rules.freeze;
    this.time = 0;
    this.planted = false;
    this.emit('round', { round: this.round, attackers: this.attackers });
  }

  // alive: { attack, defend }, how many of each side are standing.
  update(dt, alive) {
    this.left -= dt;
    if (this.phase === 'freeze') {
      if (this.left <= 0) {
        this.phase = 'live';
        this.left = this.rules.round;
        this.emit('live');
      }
      return;
    }
    if (this.phase === 'live') {
      this.time += dt;
      if (alive.defend === 0) this._won('attack', 'eliminated');
      else if (alive.attack === 0) this._won('defend', 'eliminated');
      else if (this.left <= 0) this._won('defend', 'time');
      return;
    }
    if (this.phase === 'planted') {
      this.time += dt;
      if (alive.defend === 0) this._won('attack', 'eliminated');
      else if (this.left <= 0) this._won('attack', 'exploded');
      return;
    }
    if (this.phase === 'over' && this.left <= 0) {
      const { win, half } = this.rules;
      const top = Math.max(...this.score);
      if (top >= win || this.round >= half * 2) {
        this.phase = 'ended';
        this.left = this.rules.ended;
        this.winner = this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
        this.emit('ended', { winner: this.winner });
        return;
      }
      if (this.round === half) {
        this.attackers = 1 - this.attackers;
        this.losses = [1, 1];
        this.emit('half', { attackers: this.attackers });
      }
      this._next();
      return;
    }
    if (this.phase === 'ended' && this.left <= 0) {
      this.emit('match');
      this.begin();
    }
  }

  // The charge has been set: its fuse is the clock now.
  plant() {
    if (this.phase !== 'live') return false;
    this.phase = 'planted';
    this.planted = true;
    this.left = this.rules.fuse;
    return true;
  }

  // Its fuse has been pulled.
  defuse() {
    if (this.phase !== 'planted') return false;
    this._won('defend', 'defused');
    return true;
  }

  _won(side, why) {
    const team = this.teamOf(side);
    const lost = 1 - team;
    this.score[team]++;
    const streak = Math.min(PAY.streak, this.losses[lost]);
    const consolation = PAY.loss + PAY.again * streak + (side === 'defend' && this.planted ? PAY.planted : 0);
    const prize = why === 'exploded' || why === 'defused' ? PAY.charge : PAY.win;
    this.losses[lost] = Math.min(PAY.streak + 1, this.losses[lost] + 1);
    this.losses[team] = Math.max(0, this.losses[team] - 1);
    this.phase = 'over';
    this.left = this.rules.after;
    this.last = { side, team, why };
    this.emit('won', {
      side,
      team,
      why,
      pay: { attack: side === 'attack' ? prize : consolation, defend: side === 'defend' ? prize : consolation, keepNothing: why === 'time' },
    });
  }
}

// What the HUD says a round was won by.
export const WHY = {
  eliminated: { attack: 'the Wardens are all down', defend: 'the Raiders are all down' },
  time: { defend: 'the Raiders ran out of time' },
  exploded: { attack: 'the charge went off' },
  defused: { defend: 'the charge was pulled' },
};
