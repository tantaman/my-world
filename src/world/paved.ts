// Ground that something built has paved over, and what it is paved with: a
// city's streets and sidewalks, laid on the ground itself.
//
// Most of what you stand on that isn't the land is solid (world/solids.js),
// and says what it's made of there. Paving laid over graded ground is not:
// the street is drawn a few centimetres above the land and you walk on the
// land, so nothing is in the way to say that it's asphalt and not grass.
// This is where whoever lays it says so, and where anything that asks what
// is underfoot — footsteps, a skateboard's wheels — looks:
//
//   paved.addSource((x, z) => 'tarmac' | 'stone' | … | null)
//   paved.at(x, z)   what the ground is paved with there, or null
//
// The name is one of the surfaces footsteps know (audio/footsteps.js) and
// the wheels roll on (skateboarding/skater.js): 'tarmac', 'stone',
// 'boards', 'gravel', 'marble'. Nothing here has a height: the paving lies
// on the ground, so the ground's height is where you stand.

type Source = (x: number, z: number) => string | null | undefined;

export class Paved {
  sources: Source[] = [];

  // Whoever paves the ground adds one. Asked in the order they were added,
  // and the first answer wins.
  addSource(fn: Source) {
    this.sources.push(fn);
  }

  // What the ground at (x, z) is paved with, or null where it is bare.
  at(x: number, z: number): string | null {
    for (const source of this.sources) {
      const made = source(x, z);
      if (made) return made;
    }
    return null;
  }
}
