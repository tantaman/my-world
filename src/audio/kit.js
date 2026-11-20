// The raw materials every sound here is made from: noise, an impulse to
// convolve with, and an envelope to shape a gain.

export const SILENT = 0.0001;

// A buffer of 'white', 'pink' or 'brown' noise.
export function makeNoise(ctx, kind, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // pink (Paul Kellet)
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

// Diffuse forest reverb: decaying noise whose high end dies away faster.
export function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.08 + 0.85 * t; // one-pole lowpass that closes over time
      lp += (Math.random() * 2 - 1 - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.004 ? i / (ctx.sampleRate * 0.004) : 1);
    }
  }
  return buf;
}

// Exponential attack/decay envelope on a gain param.
export function envelope(param, t, attack, peak, decay) {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay);
}

export function setPos(node, x, y, z) {
  if (node.positionX) {
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else node.setPosition(x, y, z);
}

// Run a source through a chain of filters: [[type, frequency, Q?], ...].
// -> the last node of the chain. Every filter made is pushed onto `nodes`.
export function filtered(ctx, source, filters, nodes, detune = () => 1) {
  let node = source;
  for (const f of filters) {
    const b = ctx.createBiquadFilter();
    b.type = f[0];
    b.frequency.value = f[1] * detune();
    if (f[2]) b.Q.value = f[2];
    node.connect(b);
    node = b;
    nodes.push(b);
  }
  return node;
}
