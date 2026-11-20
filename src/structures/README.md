# Structures

Over time we'll also add hand-made **structures**: places to keep thoughts and
ideas, and places to explore. There are none yet.

## Adding a structure

Structures are registered in [`index.js`](index.js),
which explains the format in full. In short, each one gives a position, a
clearing radius and a `build()` function that returns a three.js object. The
world then:

- flattens a pad at that spot, blending smoothly into the surrounding ground
- keeps trees, rocks, logs and undergrowth out of the clearing, and water
  away from it
- places your object there, with shadows on

```js
// src/structures/thinkingHut.js
export const thinkingHut = {
  id: 'thinking-hut',
  name: 'The Thinking Hut',
  x: 120, z: -40, radius: 9,
  build({ THREE }) {
    const g = new THREE.Group();
    // ...meshes...
    return g;
  },
};
```

## Files

```
index.js              register structures here
loader.js             places structures on their pads
```
