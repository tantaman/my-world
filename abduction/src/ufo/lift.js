// The lift (PLAN.md 5.11), as the original's frames at 55.2 to 58.0 s show
// it: the cow leaves the ground slowly and rises ever faster, upright, legs
// hanging, turning a little but staying three-quarters on to the camera
// (its head toward us, its body angled, at 56.6 and 57.4 s), and slides on
// into the opening without slowing. Up in the bore, the ceiling hides it
// from below; at T.liftEnd it is gone. Before, it stands and grazes.
//
// Its height against the lift's time is s^1.4, fitted to the original's
// (a twentieth of the way at a tenth of the time, half way at 0.6).
import { Vector3 } from 'three/webgpu';
import { COW } from '../set/layout.js';
import { T, clamp, smooth } from '../timeline.js';

const RISE = 1.4;           // the power of its height against time
const FACE_YAW = 1.84;      // radians: facing the camera's stand for the abduction, (-2.4, 14.5)
const TURN_BY = 0.75;       // of the lift, by when it has turned as far as it will
const TURN_SHARE = 0.3;     // of the way round to facing the camera: it ends three-quarters on
const SWAY = 0.05;          // radians it sways about level as it rises
const PAST = 0.9;           // metres past the opening it ends, up behind the bore's ceiling

export function createLift(cow) {
  const ground = new Vector3(COW.x, 0, COW.z);
  const top = new Vector3();
  return {
    // opening: where the hull's opening is now.
    update(t, opening) {
      const o = cow.object;
      o.scale.setScalar(1);
      if (t < T.liftStart) {
        o.visible = true;
        o.position.copy(ground);
        o.rotation.set(0, COW.yaw, 0);
        cow.pose(t, 0);
        return;
      }
      if (t >= T.liftEnd) { o.visible = false; return; }
      const s = clamp((t - T.liftStart) / (T.liftEnd - T.liftStart));
      const e = Math.pow(s, RISE);
      top.copy(opening);
      top.y += PAST;
      o.visible = true;
      o.position.lerpVectors(ground, top, e);
      const turn = smooth(clamp(s / TURN_BY)) * TURN_SHARE;
      o.rotation.set(SWAY * Math.sin(t * 1.3) * e, COW.yaw + (FACE_YAW - COW.yaw) * turn, SWAY * Math.sin(t * 0.9 + 1) * e);
      cow.pose(t, smooth(clamp(s * 4)));
    },
  };
}
