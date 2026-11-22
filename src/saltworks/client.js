// Solo uses the same match locally. In shared worlds only inputs go up to
// the server. Replaying local movement from the last reply keeps it responsive.
import { Match } from './match.js';
import { IDLE, controls, move } from './motion.js';

const PERIOD = 50; // ms between inputs on the live socket
const TIMEOUT = 2500; // ms without a snapshot before showing a reconnect message
const REPLAY = 0.22; // s of local movement to replay after a reply
let sequence = 0;

const copyBody = (f) => ({ pos: { ...f.pos }, vel: { ...f.vel }, grounded: f.grounded });

export class ArenaClient {
  constructor(send, name) {
    this.send = send;
    this.online = !!send;
    this.local = send ? null : new Match();
    this.state = null;
    this.pose = null;
    this.look = { yaw: 0, pitch: 0 };
    this.history = [];
    this.pending = new Map();
    this.lastSend = -Infinity;
    this.lastReply = -Infinity;
    this.epoch = null;
    this.full = false;
    this.queuedJump = false;
    this.queuedFire = false;
    if (this.local) {
      this.local.join('local', name);
      this.apply(this.local.snapshot('local'), 0);
    }
  }

  get me() {
    return this.state?.fighters.find((f) => f.id === this.state.me);
  }

  apply(state, sentAt) {
    const before = this.me;
    const previousRound = this.state?.round;
    this.state = state;
    const me = this.me;
    const reset = previousRound !== state.round || before?.id !== me?.id || (!before?.hp && !!me?.hp);
    this.pose = me ? copyBody(me) : null;
    if (me && reset) {
      this.look.yaw = me.yaw;
      this.look.pitch = me.pitch;
      this.queuedJump = this.queuedFire = false;
    }
    if (!me || !me.hp || reset || state.phase !== 'live' || !this.online) return;
    for (const frame of this.history) {
      if (frame.end <= sentAt) continue;
      const dt = Math.min(frame.dt, (frame.end - sentAt) / 1000);
      move(this.pose, frame.input, dt);
    }
  }

  hear(reply, now) {
    const sentAt = this.pending.get(reply.seq);
    if (sentAt === undefined) return;
    for (const seq of this.pending.keys()) if (seq <= reply.seq) this.pending.delete(seq);
    this.lastReply = now;
    this.full = !!reply.full;
    if (this.full) return;
    if (reply.epoch !== this.epoch) {
      this.state = null;
      this.epoch = reply.epoch;
    }
    this.apply(reply.state, Math.max(sentAt, now - REPLAY * 1000));
  }

  update(dt, now, input) {
    const yours = controls({ ...IDLE, ...input, ...this.look });
    this.look.yaw = yours.yaw;
    this.look.pitch = yours.pitch;
    if (this.local) {
      this.local.input('local', yours);
      this.local.advance(dt);
      this.apply(this.local.snapshot('local'), now);
      return;
    }

    if (now - this.lastReply > TIMEOUT) {
      this.state = null;
      this.pose = null;
      this.full = false;
    }
    this.history.push({ end: now, dt, input: yours });
    while (this.history.length && this.history[0].end < now - REPLAY * 1000) this.history.shift();
    if (this.pose && this.me.hp > 0 && this.state.phase === 'live') move(this.pose, yours, dt);

    this.queuedJump ||= yours.jump;
    this.queuedFire ||= yours.fire;
    if (now - this.lastSend < (this.full ? 500 : PERIOD)) return;
    this.lastSend = now;
    const seq = ++sequence;
    if (this.send({ action: 'input', ...yours, jump: this.queuedJump, fire: this.queuedFire, seq, slot: this.state?.me, round: this.state?.round })) {
      this.pending.set(seq, now);
      this.queuedJump = this.queuedFire = false;
    }
    for (const [id, time] of this.pending) {
      if (time >= now - TIMEOUT) break;
      this.pending.delete(id);
    }
  }
}
