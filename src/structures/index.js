// ─────────────────────────────────────────────────────────────────────────────
//  Structures
//
//  This is where the places we build over time will live: huts for thoughts,
//  towers for big ideas, little shrines for half-finished notes.
//
//  There are none yet. To add one, create a module in this folder and register
//  it below. Each structure describes:
//
//    id       unique string
//    name     shown to the visitor
//    x, z     world position (the HUD shows your coordinates; walk somewhere
//             you like and note them down)
//    radius   meters of clearing to make around it. Trees, rocks and grass are
//             kept out and the ground is gently flattened to the height at x,z.
//    build(ctx) -> THREE.Object3D
//             ctx = { THREE, groundY, materials, world }
//             Return an object positioned relative to (0, 0, 0) = the centre of
//             the flattened pad. It is placed in the world for you.
//
//  Example:
//
//    import { thinkingHut } from './thinkingHut.js';
//    export const STRUCTURES = [thinkingHut];
//
//  where thinkingHut.js is:
//
//    export const thinkingHut = {
//      id: 'thinking-hut',
//      name: 'The Thinking Hut',
//      x: 120, z: -40, radius: 9,
//      build({ THREE }) {
//        const g = new THREE.Group();
//        // ...meshes...
//        return g;
//      },
//    };
// ─────────────────────────────────────────────────────────────────────────────

export const STRUCTURES = [];
