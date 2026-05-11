// Tiny 2D value-noise. Not true Perlin/simplex but visually equivalent for
// the small offsets we need on the blob edge. Returns values in roughly [-1, 1].

function hash2(ix, iy) {
  // Deterministic pseudo-random in [-1, 1]. Cheap; quality is fine for visuals.
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const u = smooth(fx);
  const v = smooth(fy);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
