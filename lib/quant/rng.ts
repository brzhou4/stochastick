// Deterministic pseudo-random number generation for reproducible simulations.
// We use mulberry32 (a fast 32-bit generator) plus a Box-Muller transform for
// standard-normal draws. Seeding is deterministic so demo + tests are stable.

export function hashStringToSeed(input: string): number {
  // FNV-1a style hash -> unsigned 32-bit integer.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns a function that yields independent standard-normal variates.
export function gaussianGenerator(seed: number): () => number {
  const uniform = mulberry32(seed);
  let spare: number | null = null;
  return function () {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    // Box-Muller. Guard against log(0).
    let u1 = uniform();
    const u2 = uniform();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    spare = mag * Math.sin(2.0 * Math.PI * u2);
    return mag * Math.cos(2.0 * Math.PI * u2);
  };
}
