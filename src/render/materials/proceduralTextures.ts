import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace
} from "three";

export interface ProceduralTextureSet {
  readonly map: DataTexture;
  readonly normalMap: DataTexture;
  readonly roughnessMap: DataTexture;
}

type SurfaceKind = "terrain" | "rock" | "bark" | "water" | "foliage";

const textureCache = new Map<string, ProceduralTextureSet>();
const textureSize = 256;

export function createTerrainTextures(seed: number): ProceduralTextureSet {
  return createTextureSet("terrain", seed, 26, 26);
}

export function createRockTextures(seed: number): ProceduralTextureSet {
  return createTextureSet("rock", seed + 71, 2.6, 2.6);
}

export function createBarkTextures(seed: number): ProceduralTextureSet {
  return createTextureSet("bark", seed + 149, 2, 7);
}

export function createWaterTextures(seed: number): ProceduralTextureSet {
  return createTextureSet("water", seed + 263, 7, 32);
}

export function createFoliageTextures(seed: number): ProceduralTextureSet {
  return createTextureSet("foliage", seed + 347, 1, 5);
}

function createTextureSet(
  kind: SurfaceKind,
  seed: number,
  repeatX: number,
  repeatY: number
): ProceduralTextureSet {
  const key = `${kind}:${seed}:${repeatX}:${repeatY}`;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const length = textureSize * textureSize;
  const height = new Float32Array(length);
  const albedo = new Uint8Array(length * 4);
  const normal = new Uint8Array(length * 4);
  const roughness = new Uint8Array(length * 4);
  const phase = (seed % 10_007) * 0.0137;

  for (let y = 0; y < textureSize; y += 1) {
    for (let x = 0; x < textureSize; x += 1) {
      const u = x / textureSize;
      const v = y / textureSize;
      const index = y * textureSize + x;
      const value = surfaceHeight(kind, u, v, phase);
      height[index] = value;

      const [red, green, blue] = surfaceColor(kind, u, v, value, phase);
      const offset = index * 4;
      albedo[offset] = toByte(red);
      albedo[offset + 1] = toByte(green);
      albedo[offset + 2] = toByte(blue);
      albedo[offset + 3] = 255;

      const rough = surfaceRoughness(kind, value, u, v, phase);
      const roughByte = toByte(rough);
      roughness[offset] = roughByte;
      roughness[offset + 1] = roughByte;
      roughness[offset + 2] = roughByte;
      roughness[offset + 3] = 255;
    }
  }

  const normalStrength =
    kind === "bark"
      ? 4.4
      : kind === "water"
        ? 2.6
        : kind === "foliage"
          ? 2.1
          : kind === "terrain"
            ? 5.6
            : 3.2;
  for (let y = 0; y < textureSize; y += 1) {
    for (let x = 0; x < textureSize; x += 1) {
      const left = height[y * textureSize + wrapIndex(x - 1)] ?? 0;
      const right = height[y * textureSize + wrapIndex(x + 1)] ?? 0;
      const down = height[wrapIndex(y - 1) * textureSize + x] ?? 0;
      const up = height[wrapIndex(y + 1) * textureSize + x] ?? 0;
      const dx = (left - right) * normalStrength;
      const dy = (down - up) * normalStrength;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      const offset = (y * textureSize + x) * 4;
      normal[offset] = toByte(dx * inverseLength * 0.5 + 0.5);
      normal[offset + 1] = toByte(dy * inverseLength * 0.5 + 0.5);
      normal[offset + 2] = toByte(inverseLength * 0.5 + 0.5);
      normal[offset + 3] = 255;
    }
  }

  const set: ProceduralTextureSet = {
    map: makeTexture(albedo, repeatX, repeatY, true),
    normalMap: makeTexture(normal, repeatX, repeatY, false),
    roughnessMap: makeTexture(roughness, repeatX, repeatY, false)
  };
  textureCache.set(key, set);
  return set;
}

function surfaceHeight(
  kind: SurfaceKind,
  u: number,
  v: number,
  phase: number
): number {
  const tau = Math.PI * 2;
  const micro =
    Math.sin(u * tau * 37 + phase * 2.3) *
    Math.cos(v * tau * 41 - phase * 1.1) *
    0.035;

  if (kind === "bark") {
    const noiseSeed = Math.floor(phase * 10_000);
    const warp = periodicFbm(u, v, 3, 4, noiseSeed + 97) - 0.5;
    const fibers = periodicFbm(u, v, 8, 3, noiseSeed + 181) - 0.5;
    const grooves = Math.abs(
      Math.sin(
        (u * 17 + warp * 1.4 + fibers * 0.45 + Math.sin(v * tau * 2) * 0.18) *
          tau
      )
    );
    const fissures = (1 - grooves) ** 3.2;
    const knotDistance = periodicWorley(u, v, 5, noiseSeed + 313);
    const knots = clamp01((0.24 - knotDistance) / 0.24);
    return clamp01(
      0.22 +
        grooves * 0.5 +
        warp * 0.14 +
        knots * knots * 0.13 -
        fissures * 0.16 +
        micro * 0.7
    );
  }

  if (kind === "water") {
    const noiseSeed = Math.floor(phase * 10_000);
    const slick =
      smoothRange(0.54, 0.88, periodicFbm(u, v, 2, 4, noiseSeed + 4_607)) *
      0.68;
    const flow =
      Math.sin(v * tau * 22 + Math.sin(u * tau * 5.5 + phase) * 0.92) *
        0.14 +
      Math.sin(v * tau * 44 - u * tau * 4.2 - phase) * 0.082;
    const crossRipple =
      Math.sin((u * 12 + v * 21) * tau + phase * 0.7) *
      Math.sin((u * 17 - v * 9) * tau - phase) *
      0.054;
    const capillary =
      Math.max(
        0,
        Math.sin((u * 31 + v * 58) * tau + Math.sin(v * tau * 6 + phase))
      ) **
        3.8 *
      0.052;
    const brokenCrests =
      Math.max(
        0,
        Math.sin(v * tau * 54 + Math.sin(u * tau * 18 + phase) * 0.6)
      ) ** 5 *
      0.14;
    const rippleDrag = 1 - slick;
    const syrupShear =
      Math.sin((u * 3.4 - v * 2.2) * tau + phase * 0.18) *
      0.035 *
      slick;
    return clamp01(
      0.5 +
        flow * (0.74 + rippleDrag * 0.26) +
        (crossRipple + capillary + brokenCrests + micro * 0.38) * rippleDrag +
        syrupShear
    );
  }

  if (kind === "foliage") {
    const noiseSeed = Math.floor(phase * 10_000);
    const mottle = periodicFbm(u, v, 6, 4, noiseSeed + 2_603);
    const centralVein = Math.exp(-Math.abs(u - 0.5) * 34);
    const secondaryVeins =
      Math.max(
        0,
        Math.cos(
          (v * 10 + Math.abs(u - 0.5) * 17 + (mottle - 0.5) * 0.4) *
            Math.PI
        )
      ) **
        5 *
      (1 - Math.min(1, Math.abs(u - 0.5) * 1.8));
    return clamp01(
      0.34 +
        mottle * 0.26 +
        centralVein * 0.26 +
        secondaryVeins * 0.12 +
        micro * 0.35
    );
  }

  if (kind === "rock") {
    const noiseSeed = Math.floor(phase * 10_000);
    const macro = periodicFbm(u, v, 2, 5, noiseSeed);
    const detail = periodicFbm(u, v, 7, 4, noiseSeed + 191);
    const warp = periodicFbm(u, v, 3, 3, noiseSeed + 337) - 0.5;
    const strata =
      Math.sin((v * 5 + u * 2 + warp * 0.62) * tau) * 0.075;
    const cellDistance = periodicWorley(u, v, 13, noiseSeed + 521);
    const pits = clamp01((0.18 - cellDistance) / 0.18) ** 2.4;
    return clamp01(
      0.28 + macro * 0.38 + detail * 0.18 + strata - pits * 0.15
    );
  }

  const noiseSeed = Math.floor(phase * 10_000);
  const soil = periodicFbm(u, v, 2, 5, noiseSeed);
  const clumps = periodicFbm(u, v, 8, 4, noiseSeed + 263);
  const grit = periodicFbm(u, v, 24, 3, noiseSeed + 419);
  const litter = clamp01((grit - 0.67) * 4.5);
  const pebbleDistance = periodicWorley(u, v, 38, noiseSeed + 631);
  const pebbles = clamp01((0.18 - pebbleDistance) / 0.18) ** 1.7;
  const needleFiber =
    Math.max(
      0,
      Math.sin((u * 17 + v * 7) * Math.PI * 2 + phase * 0.73)
    ) ** 18;
  return clamp01(
    0.13 +
      soil * 0.38 +
      clumps * 0.21 +
      (grit - 0.5) * 0.17 +
      litter * 0.08 +
      pebbles * 0.16 +
      needleFiber * 0.055
  );
}

function surfaceColor(
  kind: SurfaceKind,
  u: number,
  v: number,
  height: number,
  phase: number
): readonly [number, number, number] {
  if (kind === "rock") {
    const noiseSeed = Math.floor(phase * 10_000);
    const macro = periodicFbm(u, v, 2, 5, noiseSeed);
    const mineral = periodicFbm(u, v, 11, 3, noiseSeed + 701);
    const lichenNoise = periodicFbm(u, v, 5, 4, noiseSeed + 887);
    const lichen = clamp01((lichenNoise - 0.62) * 3.2);
    const vein = clamp01(
      (0.085 -
        Math.abs(
          Math.sin(
            (u * 3 + v * 7 + (macro - 0.5) * 0.8) * Math.PI * 2
          )
        )) /
        0.085
    );
    const cellDistance = periodicWorley(u, v, 13, noiseSeed + 521);
    const pit = clamp01((0.18 - cellDistance) / 0.18) ** 2;
    const base = 0.2 + height * 0.5 + (mineral - 0.5) * 0.12;
    return [
      base * 0.91 + vein * 0.13 + lichen * 0.035 - pit * 0.1,
      base * 0.98 + vein * 0.1 + lichen * 0.1 - pit * 0.1,
      base + vein * 0.075 + lichen * 0.045 - pit * 0.09
    ];
  }

  if (kind === "bark") {
    const noiseSeed = Math.floor(phase * 10_000);
    const age = periodicFbm(u, v, 3, 4, noiseSeed + 1_907);
    const fissure = clamp01((0.34 - height) * 3.2);
    return [
      0.105 + height * 0.27 + age * 0.055 - fissure * 0.05,
      0.062 + height * 0.14 + age * 0.035 - fissure * 0.035,
      0.038 + height * 0.07 + age * 0.018 - fissure * 0.02
    ];
  }

  if (kind === "water") {
    return [
      0.46 + height * 0.1,
      0.68 + height * 0.12,
      0.66 + height * 0.14
    ];
  }

  if (kind === "foliage") {
    const noiseSeed = Math.floor(phase * 10_000);
    const mottle = periodicFbm(u, v, 5, 4, noiseSeed + 2_809);
    const speckle = periodicFbm(u, v, 21, 3, noiseSeed + 3_017);
    const centralVein = Math.exp(-Math.abs(u - 0.5) * 30);
    const light = 0.7 + height * 0.22 + (mottle - 0.5) * 0.16;
    return [
      light * 0.83 + centralVein * 0.08 - speckle * 0.025,
      light * 0.98 + centralVein * 0.11,
      light * 0.76 + centralVein * 0.045 - speckle * 0.02
    ];
  }

  const noiseSeed = Math.floor(phase * 10_000);
  const soil = periodicFbm(u, v, 2, 5, noiseSeed);
  const mossNoise = periodicFbm(u, v, 7, 4, noiseSeed + 1_103);
  const grit = periodicFbm(u, v, 23, 3, noiseSeed + 1_277);
  const humus = periodicFbm(u, v, 11, 3, noiseSeed + 1_441);
  const pebbleDistance = periodicWorley(u, v, 38, noiseSeed + 1_619);
  const moss = clamp01((mossNoise - 0.64) * 2.8);
  const litter = clamp01((grit - 0.58) * 3.2);
  const pebble = clamp01((0.17 - pebbleDistance) / 0.17) ** 1.6;
  const pores = clamp01((0.42 - humus) * 2.8);
  const needleFiber =
    Math.max(
      0,
      Math.sin((u * 17 + v * 7) * Math.PI * 2 + phase * 0.73)
    ) ** 18;
  const soilLight = 0.2 + soil * 0.25 + humus * 0.075;
  return [
    soilLight * 0.76 +
      litter * 0.19 +
      pebble * 0.15 +
      needleFiber * 0.14 -
      moss * 0.04 -
      pores * 0.055,
    soilLight * 0.67 +
      litter * 0.12 +
      pebble * 0.13 +
      needleFiber * 0.09 +
      moss * 0.085 -
      pores * 0.05,
    soilLight * 0.49 +
      litter * 0.06 +
      pebble * 0.1 +
      needleFiber * 0.035 -
      moss * 0.02 -
      pores * 0.045
  ];
}

function surfaceRoughness(
  kind: SurfaceKind,
  height: number,
  u: number,
  v: number,
  phase: number
): number {
  const variation = Math.sin(u * 73 + v * 61 + phase) * 0.055;
  if (kind === "water") {
    const noiseSeed = Math.floor(phase * 10_000);
    const slick =
      smoothRange(0.55, 0.86, periodicFbm(u, v, 2, 4, noiseSeed + 4_811)) *
      0.42;
    return clamp01(0.2 + height * 0.15 + variation * 0.42 - slick);
  }
  if (kind === "foliage") {
    const noiseSeed = Math.floor(phase * 10_000);
    const waxVariation = periodicFbm(u, v, 9, 3, noiseSeed + 3_211);
    return clamp01(0.61 + height * 0.16 + (waxVariation - 0.5) * 0.18);
  }
  if (kind === "rock") {
    const noiseSeed = Math.floor(phase * 10_000);
    const mineral = periodicFbm(u, v, 12, 3, noiseSeed + 1_409);
    return clamp01(0.61 + height * 0.24 + (mineral - 0.5) * 0.16);
  }
  if (kind === "bark") {
    return clamp01(0.72 + height * 0.22 + variation);
  }
  const noiseSeed = Math.floor(phase * 10_000);
  const grit = periodicFbm(u, v, 20, 3, noiseSeed + 1_579);
  return clamp01(0.84 + height * 0.12 + (grit - 0.5) * 0.1);
}

function periodicFbm(
  u: number,
  v: number,
  baseCells: number,
  octaves: number,
  seed: number
): number {
  let value = 0;
  let amplitude = 0.5;
  let amplitudeSum = 0;
  let cells = baseCells;

  for (let octave = 0; octave < octaves; octave += 1) {
    value += periodicValueNoise(u, v, cells, seed + octave * 1_013) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    cells *= 2;
  }

  return value / amplitudeSum;
}

function periodicValueNoise(
  u: number,
  v: number,
  cells: number,
  seed: number
): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = hashGrid(mod(x0, cells), mod(y0, cells), seed);
  const b = hashGrid(mod(x0 + 1, cells), mod(y0, cells), seed);
  const c = hashGrid(mod(x0, cells), mod(y0 + 1, cells), seed);
  const d = hashGrid(mod(x0 + 1, cells), mod(y0 + 1, cells), seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function periodicWorley(
  u: number,
  v: number,
  cells: number,
  seed: number
): number {
  const x = u * cells;
  const y = v * cells;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let minimum = Number.POSITIVE_INFINITY;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const gridX = cellX + offsetX;
      const gridY = cellY + offsetY;
      const wrappedX = mod(gridX, cells);
      const wrappedY = mod(gridY, cells);
      const pointX =
        gridX + hashGrid(wrappedX, wrappedY, seed + 1_811);
      const pointY =
        gridY + hashGrid(wrappedX, wrappedY, seed + 2_357);
      minimum = Math.min(minimum, Math.hypot(pointX - x, pointY - y));
    }
  }

  return Math.min(1, minimum);
}

function hashGrid(x: number, y: number, seed: number): number {
  let hash =
    Math.imul(x + 37, 374_761_393) ^
    Math.imul(y + 91, 668_265_263) ^
    Math.imul(seed + 17, 362_437);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295;
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function smoothRange(edge0: number, edge1: number, value: number): number {
  return smoothCurve(clamp01((value - edge0) / (edge1 - edge0)));
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function makeTexture(
  bytes: Uint8Array,
  repeatX: number,
  repeatY: number,
  srgb: boolean
): DataTexture {
  const texture = new DataTexture(bytes, textureSize, textureSize, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  if (srgb) {
    texture.colorSpace = SRGBColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

function wrapIndex(value: number): number {
  return (value + textureSize) % textureSize;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}
