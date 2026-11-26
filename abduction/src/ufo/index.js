// The abduction, put together: the saucer on its flight, its trails, the
// beam, and the cow it takes.
import { Group, Vector3 } from 'three/webgpu';
import { createSaucer } from './saucer.js';
import { flightAt, createFlightState } from './flight.js';
import { createTrails } from './trails.js';
import { createBeam } from './beam.js';
import { createLift } from './lift.js';
import { createCow } from '../props/cow.js';

export function createUfo(ctx) {
  const group = new Group();
  const saucer = createSaucer();
  const trails = createTrails(ctx);
  const beam = createBeam(ctx);
  const cow = createCow();
  const lift = createLift(cow);
  group.add(saucer.object, trails.object, beam.object, cow.object);
  const state = createFlightState();
  const opening = new Vector3();
  return {
    object: group,
    state,
    update(t) {
      flightAt(t, state);
      saucer.object.visible = state.visible;
      saucer.object.position.copy(state.position);
      saucer.object.rotation.copy(state.rotation);
      saucer.object.updateMatrixWorld();
      saucer.update(t);
      opening.set(0, 0.05, 0).applyMatrix4(saucer.object.matrixWorld);
      trails.update(t);
      beam.update(t, opening, state.visible);
      lift.update(t, opening);
    },
  };
}
