// Looking through the rifle's scope: the round field of view with the dark
// all round it and fine cross hairs, over the picture, under the HUD.
// (The view itself, from the eye and magnified, is the player's: player.sight.)

const RING = 38; // the scope's round view: its radius, in % of the shorter side of the screen
const LINE = 'rgba(10, 10, 10, 0.85)';

export class ScopeView {
  // parent: where the overlay goes (#hud: under the prompt and the tool bar)
  constructor(parent) {
    const el = document.createElement('div');
    el.id = 'scope';
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      background: `radial-gradient(circle at 50% 50%, transparent 0, transparent ${RING}vmin, rgba(0, 0, 0, 0.55) ${RING + 0.4}vmin, rgba(0, 0, 0, 0.94) ${RING + 3}vmin)`,
    });
    // the cross hairs: thin toward the middle, heavier out at the edge
    const hair = (style) => {
      const h = document.createElement('div');
      Object.assign(h.style, { position: 'absolute', background: LINE, ...style });
      el.appendChild(h);
    };
    hair({ left: '50%', top: `calc(50% - ${RING}vmin)`, width: '1px', height: `${RING * 2}vmin`, marginLeft: '-0.5px' });
    hair({ top: '50%', left: `calc(50% - ${RING}vmin)`, height: '1px', width: `${RING * 2}vmin`, marginTop: '-0.5px' });
    for (const [x, y] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const across = x === 0;
      hair({
        left: `calc(50% + ${x * RING * 0.62}vmin)`,
        top: `calc(50% + ${y * RING * 0.62}vmin)`,
        width: across ? '4px' : `${RING * 0.76}vmin`,
        height: across ? `${RING * 0.76}vmin` : '4px',
        transform: 'translate(-50%, -50%)',
      });
    }
    parent.prepend(el);
    this.el = el;
  }

  show(on) {
    this.el.hidden = !on;
  }
}
