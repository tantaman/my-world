// The skateboard, made from boxes and cylinders like the hiker: a maple deck
// with a kicked-up nose and tail, grip tape on top and a painted underside,
// two trucks, and four wheels that turn as it rolls. Made once and put under
// the hiker's feet (Character.stance), and once more to go off on its own
// when you bail.
//
// Its frame: its length along x (the nose at +x), its top at y = 0, where
// the soles stand, and its wheels' bottoms DECK below. Whoever has it turns
// and flips `turn`, which pivots about the board's middle, halfway down.

import * as THREE from 'three';
import { DECK } from './skater.js';

// m: the deck's length, width and thickness; how long the nose and tail are
// and how far (radians) they kick up; where the trucks are from the middle,
// how far apart the wheels are across, and the wheels themselves.
export const BOARD = { length: 0.8, width: 0.205, thick: 0.013, tail: 0.14, kick: 0.3, truck: 0.205, track: 0.08, wheel: 0.027, wheelW: 0.032 };
// The middle of the board, halfway down from its top to the ground: what it
// turns about.
export const MID = DECK / 2;
const AXLE = -(DECK - BOARD.wheel); // m below the top
// What the underside is painted, by a number handed in (a different board
// for whoever rides it).
const PAINT = [0xe0583f, 0x2f8fd0, 0xf2a446, 0x6cbf5a, 0xad84dc];

const M = (hex, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
const shadowed = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// -> { object (put this under the feet, or in the world), turn (turn and
// flip this), roll(m) (the wheels turn as it goes this far) }
export function makeBoard(paint = 0) {
  const grip = M(0x1e1e20, 0.95);
  const ply = M(0xd9b27c, 0.7);
  const under = M(PAINT[Math.abs(paint) % PAINT.length], 0.5);
  const steel = M(0xaeb4ba, 0.35, 0.6);
  const urethane = M(0xf0ead6, 0.55);
  // a box's faces: right, left, top, bottom, front, back
  const deckFaces = [ply, ply, grip, under, ply, ply];

  const object = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.order = 'YXZ';
  turn.position.y = -MID;
  object.add(turn);
  const body = new THREE.Group();
  body.position.y = MID;
  turn.add(body);

  // the deck: flat between the trucks, kicked up at each end and rounded off
  const flat = BOARD.length - 2 * BOARD.tail;
  const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(flat, BOARD.thick, BOARD.width), deckFaces));
  deck.position.y = -BOARD.thick / 2;
  body.add(deck);
  for (const s of [1, -1]) {
    const end = new THREE.Group();
    end.position.set((s * flat) / 2, 0, 0);
    end.rotation.z = s * BOARD.kick;
    body.add(end);
    const kick = shadowed(new THREE.Mesh(new THREE.BoxGeometry(BOARD.tail - BOARD.width / 2, BOARD.thick, BOARD.width), deckFaces));
    kick.position.set((s * (BOARD.tail - BOARD.width / 2)) / 2, -BOARD.thick / 2, 0);
    end.add(kick);
    const round = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(BOARD.width / 2, BOARD.width / 2, BOARD.thick, 12, 1, false, s > 0 ? 0 : Math.PI, Math.PI), [ply, grip, under]));
    round.position.set(s * (BOARD.tail - BOARD.width / 2), -BOARD.thick / 2, 0);
    end.add(round);
  }

  // the trucks: a baseplate, the hanger across, the axle, and a wheel each end
  const wheels = [];
  for (const s of [1, -1]) {
    const x = s * BOARD.truck;
    const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, 0.055), steel));
    plate.position.set(x, -BOARD.thick - 0.006, 0);
    body.add(plate);
    const hanger = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 2 * BOARD.track - 0.03), steel));
    hanger.position.set(x - s * 0.008, AXLE + 0.008, 0);
    body.add(hanger);
    const king = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, -AXLE - BOARD.thick, 6), steel);
    king.position.set(x + s * 0.012, (AXLE - BOARD.thick) / 2, 0);
    body.add(king);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 2 * BOARD.track + BOARD.wheelW, 6), steel);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(x, AXLE, 0);
    body.add(axle);
    for (const side of [1, -1]) {
      const hub = new THREE.Group();
      hub.position.set(x, AXLE, side * BOARD.track);
      body.add(hub);
      const w = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(BOARD.wheel, BOARD.wheel, BOARD.wheelW, 12), urethane));
      w.rotation.x = Math.PI / 2;
      hub.add(w);
      // a mark on it, to see it turn
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, BOARD.wheelW + 0.002), grip);
      dot.position.y = BOARD.wheel * 0.6;
      hub.add(dot);
      wheels.push(hub);
    }
  }

  let spun = 0;
  return {
    object,
    turn,
    // the wheels turn as it rolls m along (forward, toward the nose: + m)
    roll(m) {
      spun = (spun - m / BOARD.wheel) % (Math.PI * 2);
      for (const w of wheels) w.rotation.z = spun;
    },
  };
}
