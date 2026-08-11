/**
 * Every series gets its own colour and artwork, derived from its topic string.
 * Same topic always yields the same cover — no storage, no image generation.
 */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — deterministic per seed, so artwork never shifts between loads */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The gradient stops, plus the hue the rest of the UI should accent with.
 * Single source of truth: the accent is the gradient's middle stop, because
 * that is what the eye reads as the cover's colour — deriving it separately
 * from the base hue leaves a crimson cover with an amber progress bar.
 *
 * Returns the live rng so the caller can keep drawing from the same sequence.
 */
export function seriesPalette(seed: string) {
  const base = hashString(seed) % 360;
  const rand = rng(hashString(seed));

  const flip = rand() > 0.5 ? 1 : -1;
  const h2 = (base + flip * (34 + Math.floor(rand() * 26)) + 360) % 360;
  const h3 = (base + flip * (72 + Math.floor(rand() * 44)) + 360) % 360;

  return {
    c1: `hsl(${base} 92% ${60 + Math.floor(rand() * 8)}%)`,
    c2: `hsl(${h2} 82% ${46 + Math.floor(rand() * 8)}%)`,
    c3: `hsl(${h3} 76% ${26 + Math.floor(rand() * 10)}%)`,
    accentHue: h2,
    rand,
  };
}

/** Hue for UI accents tied to a series — matches the cover's dominant tone. */
export function seriesHue(seed: string): number {
  return seriesPalette(seed).accentHue;
}
