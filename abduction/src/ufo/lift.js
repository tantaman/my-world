// The lift (PLAN.md 5.11): the cow starts 0.4 s after the beam lands, eases
// in, climbs to the hull in 4.2 s turning about 40 degrees, and shrinks and
// whitens into the opening. Before, it stands and grazes; after, it is gone.
import { Vector3 } from 'three/webgpu';
import { COW } from '../set/layout.js';
import { T, clamp, smooth } from '../timeline.js';

const TURN = 0.7;     // radians it turns on the way up

export function createLift(cow) {
  const ground = new Vector3(COW.x, 0, COW.z);
  return {
    // opening: where the hull's opening is now.
    update(t, opening) {
      const o = cow.object;
      if (t < T.liftStart) {
        o.visible = true;
        o.position.copy(ground);
        o.rotation.set(0, COW.yaw, 0);
        o.scale.setScalar(1);
        cow.pose(t, 0);
        return;
      }
      if (t >= T.liftEnd) { o.visible = false; return; }
      const s = clamp((t - T.liftStart) / (T.liftEnd - T.liftStart));
      // Slow to start, then steady, slowing into the hull.
      const e = s < 0.25 ? 2 * s * s * 4 * 0.25 : smooth(s);
      o.visible = true;
      o.position.lerpVectors(ground, opening, e);
      o.position.y = Math.min(o.position.y, opening.y - 0.4 * (1 - s));
      o.position.y -= 0.9 * (1 - e) * (s > 0 ? 0 : 1);
      o.rotation.set(0.15 * Math.sin(t * 1.3) * e, COW.yaw + TURN * e, 0.12 * Math.sin(t * 0.9) * e);
      const shrink = 1 - 0.85 * smooth(clamp((s - 0.85) / 0.15));
      o.scale.setScalar(shrink);
      cow.pose(t, smooth(clamp(s * 4)));
    },
  };
}
