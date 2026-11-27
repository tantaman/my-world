// The sun where it really is (src/world/sky.js): by latitude, time of year
// and the sun's own hour, set against what an almanac says.

import test from 'node:test';
import assert from 'node:assert/strict';

const { realSunDir, storySunDir } = await import('../src/world/sky.js');
const v = () => ({
  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  },
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z);
    return this.set(this.x / l, this.y / l, this.z / l);
  },
});
const up = (d) => (Math.asin(d.y) * 180) / Math.PI;
// compass bearing, clockwise from north (-z), of a direction (x east, z south)
const bearing = (d) => ((Math.atan2(d.x, -d.z) * 180) / Math.PI + 360) % 360;

test('at noon on midsummer’s day in the Hoh (47.85° N) it stands 65.6° up, due south', () => {
  const d = realSunDir(12, 47.85, 172, v());
  assert.ok(Math.abs(up(d) - 65.6) < 0.6, `${up(d).toFixed(1)}°`);
  assert.ok(Math.abs(bearing(d) - 180) < 0.5, `bearing ${bearing(d).toFixed(1)}`);
});

test('in summer it rises in the north-east and sets in the north-west; at the equinox, east and west', () => {
  const rise = (lat, day) => {
    for (let h = 0; h < 12; h += 0.01) {
      const d = realSunDir(h, lat, day, v());
      if (d.y > 0) return bearing(d);
    }
    return NaN;
  };
  assert.ok(rise(47.85, 172) > 45 && rise(47.85, 172) < 60, `midsummer: ${rise(47.85, 172).toFixed(0)}°`);
  assert.ok(Math.abs(rise(47.85, 80) - 90) < 3, `equinox: ${rise(47.85, 80).toFixed(0)}°`);
  const set = realSunDir(19.5, 47.85, 172, v());
  assert.ok(bearing(set) > 290 && bearing(set) < 320, `setting: ${bearing(set).toFixed(0)}°`);
});

test('Zion (37.27° N) at 8 by the sun in late April: 30° up, a little south of east', () => {
  const d = realSunDir(8, 37.27, 110, v());
  assert.ok(Math.abs(up(d) - 30) < 3, `${up(d).toFixed(1)}°`);
  assert.ok(bearing(d) > 85 && bearing(d) < 105, `bearing ${bearing(d).toFixed(0)}°`);
});

test('a land made in code keeps the made-up sun: up at 6, down at 18, highest at noon', () => {
  assert.ok(Math.abs(storySunDir(6, v()).y) < 0.06 && Math.abs(storySunDir(18, v()).y) < 0.06);
  assert.ok(storySunDir(12, v()).y > storySunDir(9, v()).y);
});
