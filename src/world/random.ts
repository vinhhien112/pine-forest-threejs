export interface RandomSource {
  next(): number;
  range(min: number, max: number): number;
  integer(min: number, maxExclusive: number): number;
  signed(): number;
}

export function hashSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function createRandom(seed: number): RandomSource {
  let state = hashSeed(seed) || 0x9e3779b9;

  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    range(min: number, max: number): number {
      return min + (max - min) * next();
    },
    integer(min: number, maxExclusive: number): number {
      return Math.floor(min + (maxExclusive - min) * next());
    },
    signed(): number {
      return next() * 2 - 1;
    }
  };
}

export function valueNoise2(seed: number, x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = smoothstep(x - xi);
  const tz = smoothstep(z - zi);

  const a = lattice(seed, xi, zi);
  const b = lattice(seed, xi + 1, zi);
  const c = lattice(seed, xi, zi + 1);
  const d = lattice(seed, xi + 1, zi + 1);

  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}

export function fbm(seed: number, x: number, z: number, octaves: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2(seed + octave * 1013, x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / norm;
}

function lattice(seed: number, x: number, z: number): number {
  let value = Math.imul(x, 374_761_393) ^ Math.imul(z, 668_265_263) ^ seed;
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 1_274_126_177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
