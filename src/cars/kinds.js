// The cars a dealership has on its lot, in a table: what each is called, how
// big it is, and how it drives.
//
//   name       what it's called on the lot
//   blurb      what the card in its windscreen says
//   price      what the card asks (there's no money in the forest: it's yours
//              on a handshake)
//   body       its shape (models.js): 'hatch', 'sedan', 'pickup', 'wagon'
//   len, wide, tall   its size (m)
//   base, track       between its front and rear wheels, and its left and right (m)
//   wheel      the wheels' radius (m); clear: how high its floor rides (m)
//   seat       where the driver's hips are: across (left of the middle), up
//              (over the ground), along (ahead of the middle) (m)
//   top        m/s flat out on tarmac
//   accel      m/s² pulling away
//   brake      m/s² braking
//   reverse    m/s backing up, at the most
//   steer      the most the front wheels turn (radians)
//   grip       how hard it can corner before it won't turn any tighter (m/s², on tarmac)
//   rough      how much of `top` it can do off the road (and on gravel, half
//              way between): a car built for the road shakes itself to bits
//   climb      the steepest it can drive up (rise over run)
//   wade       the deepest water it can drive through (m)
//   paints     the colours it comes in
//   sound      its engine: idle and red line (rpm), gears, cylinders

export const KINDS = {
  wren: {
    name: 'Wren',
    blurb: 'a little hatchback: nimble, thrifty, and happiest on tarmac',
    price: 11900,
    body: 'hatch',
    len: 3.7,
    wide: 1.68,
    tall: 1.46,
    base: 2.4,
    track: 1.44,
    wheel: 0.3,
    clear: 0.16,
    seat: { across: 0.36, up: 0.5, along: -0.15 },
    top: 38,
    accel: 4.2,
    brake: 9,
    reverse: 7,
    steer: 0.62,
    grip: 8.5,
    rough: 0.32,
    climb: 0.32,
    wade: 0.3,
    paints: [0xb8312f, 0xe8c547, 0x3f7cac, 0xf2f0e6, 0x5a8f5a],
    sound: { idle: 850, red: 6500, gears: 5, cyl: 4 },
  },
  meridian: {
    name: 'Meridian',
    blurb: 'a roomy saloon that eats up the miles on the open road',
    price: 23400,
    body: 'sedan',
    len: 4.75,
    wide: 1.82,
    tall: 1.45,
    base: 2.8,
    track: 1.56,
    wheel: 0.33,
    clear: 0.15,
    seat: { across: 0.38, up: 0.5, along: -0.25 },
    top: 50,
    accel: 4.8,
    brake: 9.5,
    reverse: 7,
    steer: 0.58,
    grip: 9,
    rough: 0.3,
    climb: 0.3,
    wade: 0.3,
    paints: [0x1f2a3a, 0x7a7d82, 0x5b1e24, 0xd9d6cf, 0x23432f],
    sound: { idle: 750, red: 6200, gears: 6, cyl: 6 },
  },
  ridgeback: {
    name: 'Ridgeback',
    blurb: 'a pickup with a bed for logs, and the legs for a forest track',
    price: 28900,
    body: 'pickup',
    len: 5.3,
    wide: 1.95,
    tall: 1.85,
    base: 3.25,
    track: 1.68,
    wheel: 0.4,
    clear: 0.26,
    seat: { across: 0.4, up: 0.78, along: 0.05 },
    top: 42,
    accel: 4,
    brake: 8.5,
    reverse: 7,
    steer: 0.55,
    grip: 7.8,
    rough: 0.55,
    climb: 0.48,
    wade: 0.6,
    paints: [0x8c2b22, 0x2f4f6f, 0xe0ddd2, 0x3c3c3a, 0x6b6b3a],
    sound: { idle: 650, red: 5200, gears: 5, cyl: 8 },
  },
  bramble: {
    name: 'Bramble',
    blurb: 'a square-rigged four-by-four: slow on the road, and goes almost anywhere off it',
    price: 31500,
    body: 'wagon',
    len: 4.2,
    wide: 1.85,
    tall: 1.95,
    base: 2.55,
    track: 1.58,
    wheel: 0.42,
    clear: 0.3,
    seat: { across: 0.38, up: 0.82, along: -0.05 },
    top: 34,
    accel: 3.6,
    brake: 8,
    reverse: 6,
    steer: 0.6,
    grip: 7,
    rough: 0.75,
    climb: 0.62,
    wade: 0.75,
    paints: [0x4f5d3a, 0xc8b98a, 0x7a2e22, 0x2d3a44, 0xe9e6dc],
    sound: { idle: 700, red: 4600, gears: 5, cyl: 6 },
  },
};
export const KIND_IDS = Object.keys(KINDS);

// A price, the way the card in the windscreen says it.
export const priceOf = (kind) => `$${KINDS[kind].price.toLocaleString('en-US')}`;
