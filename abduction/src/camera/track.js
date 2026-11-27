// A smooth curve through keyed values: monotone cubic (Fritsch-Carlson), so
// a value held between two keys stays held, and nothing overshoots a key.
// Keys are [t, v0, v1, ...]; sample(t, out) fills out with v0, v1, ...

export function createTrack(keys) {
  const n = keys.length;
  const dims = keys[0].length - 1;
  const ts = keys.map((k) => k[0]);
  // Tangents per key and channel.
  const m = keys.map(() => new Float64Array(dims));
  for (let d = 0; d < dims; d++) {
    const slope = [];
    for (let i = 0; i < n - 1; i++) slope.push((keys[i + 1][d + 1] - keys[i][d + 1]) / (ts[i + 1] - ts[i]));
    for (let i = 0; i < n; i++) {
      if (i === 0) m[i][d] = slope[0] ?? 0;
      else if (i === n - 1) m[i][d] = slope[n - 2];
      else if (slope[i - 1] * slope[i] <= 0) m[i][d] = 0;
      else {
        // Weighted harmonic mean keeps the curve monotone between keys.
        const h0 = ts[i] - ts[i - 1];
        const h1 = ts[i + 1] - ts[i];
        const w0 = 2 * h1 + h0;
        const w1 = h1 + 2 * h0;
        m[i][d] = (w0 + w1) / (w0 / slope[i - 1] + w1 / slope[i]);
      }
    }
  }
  return {
    keys,
    sample(t, out) {
      if (t <= ts[0]) { for (let d = 0; d < dims; d++) out[d] = keys[0][d + 1]; return out; }
      if (t >= ts[n - 1]) { for (let d = 0; d < dims; d++) out[d] = keys[n - 1][d + 1]; return out; }
      let i = 0;
      while (t >= ts[i + 1]) i++;
      const h = ts[i + 1] - ts[i];
      const s = (t - ts[i]) / h;
      const s2 = s * s;
      const s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1;
      const h10 = s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2;
      const h11 = s3 - s2;
      for (let d = 0; d < dims; d++) {
        out[d] = h00 * keys[i][d + 1] + h10 * h * m[i][d] + h01 * keys[i + 1][d + 1] + h11 * h * m[i + 1][d];
      }
      return out;
    },
  };
}
