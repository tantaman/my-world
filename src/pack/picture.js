// Pictures: what the things in your pack look like, as pixel art written in
// code. A feature draws its own, beside what it gives you or what it does
// (a pictures.js of its own), as a block of letters, one letter a pixel, and
// hands it over as a string:
//
//   export const CANOE = `
//     ................
//     .t............t.
//     .wt..........tw.
//     .wwtttTTTTtttww.
//     ..wwwwwwwwwwww..
//     ...WWWWWWWWWW...
//     ................
//   `;
//
// Rows are as long as each other (16 is the usual size, and what the pack is
// laid out for); leading space on a line is ignored. '.' is nothing, and each
// other letter is a colour from PALETTE: lower case the colour, upper case
// its shade, and '#' the dark of the outline, for a line inside the picture.
// They are the only colours, so that what every feature draws looks as if it
// came out of the same pack. The outline round the outside is drawn for you:
// leave a pixel clear round the edge for it.
//
// Nothing here knows any feature: the pack reads pictures off what it is
// handed (a command's `icon`, a thing's `icon`) and draws them with these.
//
//   parse(art)   -> { w, h, rows: ['..#w#..', …] } with the outline drawn
//                   round it, or throws saying what's wrong
//   svg(art)     -> the picture as an SVG document (a string)
//   url(art)     -> ...as a data: URL, for an <img>; made once per picture
//   tag(art)     -> a small number that is the same for the same picture

export const PALETTE = {
  '#': '#17150f', // the outline
  w: '#b5813f', W: '#744a24', // wood
  t: '#e3c48e', T: '#b08a57', // tan: hewn timber, sand, skin, paper
  e: '#8b6a45', E: '#53391f', // earth, leather
  s: '#aeaca3', S: '#6c6b64', // stone
  m: '#a9bac4', M: '#5f6f7b', // metal
  k: '#4a4c4f', K: '#2b2c2e', // iron, rubber, the dark
  g: '#7cbc52', G: '#3f7233', // green
  b: '#62a3e6', B: '#2f5f9f', // blue: water, sky
  c: '#6cd2bd', C: '#2c8c7a', // teal
  r: '#e0583f', R: '#93301f', // red
  o: '#f2a446', O: '#b8661e', // orange: flame
  y: '#f4d46c', Y: '#c49b32', // yellow, gold
  p: '#ec9a8e', P: '#b05c52', // pink: meat
  v: '#ad84dc', V: '#6b4899', // violet
  l: '#f4f2e6', L: '#c4c1b1', // light
};

const parsed = new Map(); // art -> { w, h, rows }
const urls = new Map(); // art -> data: URL
const tags = new Map(); // art -> number

export function parse(art) {
  let p = parsed.get(art);
  if (p) return p;
  if (typeof art !== 'string') throw new Error('a picture is a string of rows of letters');
  const rows = art
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r);
  if (!rows.length) throw new Error('a picture with no rows');
  const w = rows[0].length;
  rows.forEach((r, y) => {
    if (r.length !== w) throw new Error(`row ${y + 1} of a picture is ${r.length} long, not ${w}: "${r}"`);
    for (const ch of r) if (ch !== '.' && !(ch in PALETTE)) throw new Error(`"${ch}" in row ${y + 1} of a picture is not a colour (picture.js)`);
  });
  p = { w, h: rows.length, rows: outlined(rows, w) };
  parsed.set(art, p);
  return p;
}

// Each clear pixel beside one of the picture (above, below or to the side:
// not corner to corner, which rounds the corners off) is outline.
function outlined(rows, w) {
  const h = rows.length;
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '.';
  return rows.map((r, y) => {
    let out = '';
    for (let x = 0; x < w; x++) out += r[x] !== '.' || !(at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ? r[x] : '#';
    return out;
  });
}

// One rectangle for each run of a colour along a row, so a picture is a few
// dozen of them rather than a few hundred squares.
export function svg(art) {
  const { w, h, rows } = parse(art);
  let rects = '';
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    for (let x = 0; x < w; ) {
      const ch = r[x];
      let n = 1;
      while (x + n < w && r[x + n] === ch) n++;
      if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PALETTE[ch]}"/>`;
      x += n;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${rects}</svg>`;
}

export function url(art) {
  let u = urls.get(art);
  if (!u) urls.set(art, (u = `data:image/svg+xml,${encodeURIComponent(svg(art))}`));
  return u;
}

export function tag(art) {
  let t = tags.get(art);
  if (t === undefined) tags.set(art, (t = tags.size + 1));
  return t;
}
