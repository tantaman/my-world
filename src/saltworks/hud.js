import { NAME, RELAYS, TEAMS, relayAt } from './layout.js';
import { RULES } from './match.js';
import './saltworks.css';

const clock = (time) => {
  const seconds = Math.ceil(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export class SaltworksHud {
  constructor(leave) {
    const root = this.root = document.createElement('section');
    root.id = 'saltworks-hud';
    root.setAttribute('aria-label', NAME);
    root.hidden = true;
    root.innerHTML = `
      <div class="sw-score">
        <div class="sw-team sw-runners"><span>Runners</span><strong data-runners>0</strong><small data-runners-up></small></div>
        <div class="sw-clock"><small data-round></small><strong data-time>–</strong></div>
        <div class="sw-team sw-wardens"><strong data-wardens>0</strong><span>Wardens</span><small data-wardens-up></small></div>
      </div>
      <div class="sw-crosshair" aria-hidden="true" hidden></div>
      <div class="sw-notice" hidden><strong data-status></strong><small data-detail></small></div>
      <div class="sw-play" hidden>
        <div class="sw-player"><span data-team></span><strong data-hp></strong></div>
        <div class="sw-task"><span data-task></span><progress value="0" max="1" aria-label="Relay progress" hidden></progress></div>
        <div class="sw-ammo"><span data-weapon>Pulse marker</span><strong data-ammo></strong></div>
      </div>
      <button type="button" class="sw-exit">Leave arena</button>`;
    document.body.append(root);
    const fields = ['runners', 'wardens', 'runners-up', 'wardens-up', 'round', 'time', 'status', 'detail', 'team', 'hp', 'task', 'weapon', 'ammo'];
    this.text = Object.fromEntries(fields.map((field) => {
      const node = root.querySelector(`[data-${field}]`);
      return [Object.keys(node.dataset)[0], node];
    }));
    this.notice = root.querySelector('.sw-notice');
    this.play = root.querySelector('.sw-play');
    this.cross = root.querySelector('.sw-crosshair');
    this.progress = root.querySelector('progress');
    this.exit = root.querySelector('.sw-exit');
    this.exit.addEventListener('click', leave);
  }

  update(client, input) {
    const { state, full } = client;
    const me = client.me;
    const write = (key, text) => {
      const element = this.text[key];
      if (element.textContent !== text) element.textContent = text;
    };
    const active = !!me?.hp;
    this.play.hidden = !active;
    this.cross.hidden = !active;
    write('runners', String(state?.score[0] ?? 0));
    write('wardens', String(state?.score[1] ?? 0));
    const finished = state?.winner != null;
    const round = state ? state.score[0] + state.score[1] + (finished ? 0 : 1) : 0;
    write('round', state ? `Round ${round} · First to ${RULES.wins}` : NAME);
    write('time', state ? clock(state.time) : '–');
    for (const [team, key] of ['runnersUp', 'wardensUp'].entries()) {
      const fighters = state?.fighters.filter((f) => f.team === team) || [];
      const alive = fighters.filter((f) => f.hp > 0).length;
      const people = fighters.filter((f) => f.human).length;
      write(key, state ? `${alive} up · ${people} human` : '');
    }

    let title = '';
    let detail = '';
    if (!state) {
      title = full ? 'Arena queue full' : 'Connecting to Saltworks';
      detail = full ? 'Waiting for space in the queue' : 'Waiting for the shared match';
    } else if (state.phase === 'match' || state.phase === 'between') {
      title = `${TEAMS[state.winner]} win the ${state.phase === 'match' ? 'match' : 'round'}`;
      detail = state.reason;
    } else if (!me) {
      title = 'Waiting for a slot';
      detail = `Queue position ${state.queue} · watching the match`;
    } else if (!me.hp) {
      title = 'Tagged out';
      detail = 'Back in the next round';
    } else if (state.phase === 'ready') {
      title = TEAMS[me.team];
      detail = me.team === 0 ? 'Activate either relay' : 'Keep the relays offline';
    }
    this.notice.hidden = !title;
    write('status', title);
    write('detail', detail);
    if (!active) return;

    const use = input.padInUse ? input.pads.name('PadLT') : input.isTouch ? 'Alt' : 'E';
    const at = relayAt(client.pose.pos);
    const relay = state.relay;
    const operating = state.action !== null;
    this.progress.hidden = !operating;
    this.progress.value = state.action?.progress ?? 0;
    let objective;
    if (relay >= 0) {
      if (operating) objective = `Disabling relay ${RELAYS[relay].label}`;
      else if (me.team === 1 && at === relay) objective = `Hold ${use} to disable relay ${RELAYS[relay].label}`;
      else objective = me.team === 1 ? `Disable relay ${RELAYS[relay].label}` : `Defend relay ${RELAYS[relay].label} while it transmits`;
    } else if (operating) objective = `Activating relay ${RELAYS[state.action.relay].label}`;
    else if (me.team === 0 && at >= 0) objective = `Hold ${use} to activate relay ${RELAYS[at].label}`;
    else objective = me.team === 0 ? 'Reach relay A or B' : 'Defend relays A and B';

    this.play.dataset.team = String(me.team);
    write('team', TEAMS[me.team]);
    write('hp', `${me.hp} HP`);
    write('task', objective);
    write('weapon', me.reloading ? 'Recharging' : 'Pulse marker');
    write('ammo', `${me.ammo} / ${RULES.magazine}`);
  }

  show(on, input) {
    this.root.hidden = !on;
    if (on) {
      const key = input.padInUse ? input.pads.name('PadDown') : input.isTouch ? '' : 'Backspace';
      const label = key ? `Leave arena · ${key}` : 'Leave arena';
      if (label !== this.exit.textContent) this.exit.textContent = label;
    }
  }

  dispose() {
    this.root.remove();
  }
}
