import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Uint32BufferAttribute,
  Vector3
} from "three";
import type { BiomeId, WorldConfig } from "../types";
import { fbm } from "./random";

export interface TerrainSample {
  readonly height: number;
  readonly moisture: number;
  readonly slope: number;
  readonly normal: Vector3;
  readonly biome: BiomeId;
  readonly streamDistance: number;
}

export interface TerrainSystem {
  readonly geometry: BufferGeometry;
  readonly size: number;
  readonly resolution: number;
  readonly triangleCount: number;
  sample(x: number, z: number): TerrainSample;
  heightAt(x: number, z: number): number;
}

export function createTerrain(config: WorldConfig): TerrainSystem {
  const resolution =
    config.preset === "high" && config.thermal !== "cool"
      ? 176
      : config.thermal === "cool"
        ? 112
        : 148;
  const size = 190 * config.worldScale;
  const seed = config.seed;
  const vertices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const color = new Color();

  for (let zIndex = 0; zIndex <= resolution; zIndex += 1) {
    const z = ((zIndex / resolution) - 0.5) * size;
    for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
      const x = ((xIndex / resolution) - 0.5) * size;
      const sample = sampleTerrain(seed, x, z);
      vertices.push(x, sample.height, z);
      uvs.push(xIndex / resolution, zIndex / resolution);

      colorForSample(sample, color);
      colors.push(color.r, color.g, color.b);
    }
  }

  erodeTerrainGrid(
    vertices,
    resolution,
    size,
    seed,
    config.thermal === "cool" ? 8 : config.preset === "high" ? 16 : 12
  );

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const row = resolution + 1;
      const a = zIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return {
    geometry,
    size,
    resolution,
    triangleCount: indices.length / 3,
    sample(x: number, z: number): TerrainSample {
      const analytic = sampleTerrain(seed, x, z);
      const height = sampleHeightGrid(vertices, resolution, size, x, z);
      const normal = sampleNormalGrid(vertices, resolution, size, x, z);
      const slope = 1 - Math.max(0, normal.y);
      return {
        ...analytic,
        height,
        normal,
        slope,
        biome: classifyBiome(
          height,
          analytic.moisture,
          slope,
          analytic.streamDistance
        )
      };
    },
    heightAt(x: number, z: number): number {
      return sampleHeightGrid(vertices, resolution, size, x, z);
    }
  };
}

export function sampleTerrain(seed: number, x: number, z: number): TerrainSample {
  const streamDistance = Math.abs(streamCenterX(seed, z) - x);
  const valleyMask = Math.exp(-(streamDistance * streamDistance) / 390);
  const ridge = ridged(seed, x * 0.011, z * 0.011, 5);
  const macro = fbm(seed + 91, x * 0.006, z * 0.006, 5);
  const meso = fbm(seed + 303, x * 0.038, z * 0.038, 4);
  const alpineRise = Math.max(0, (Math.abs(x) - 56) * 0.17 + (z - 28) * 0.12);
  const channel = Math.exp(-(streamDistance * streamDistance) / 30);
  const groundRelief = groundMicroRelief(seed, x, z, streamDistance);
  const height =
    (macro - 0.44) * 18 +
    ridge * 22 +
    meso * 2.6 +
    alpineRise -
    valleyMask * 10.5 -
    channel * 2.35 +
    groundRelief;
  const moisture = Math.max(0, 1 - streamDistance / 42) * 0.68 + (1 - macro) * 0.32;
  const normal = estimateNormal(seed, x, z);
  const slope = 1 - Math.max(0, normal.y);
  const biome = classifyBiome(height, moisture, slope, streamDistance);

  return {
    height,
    moisture,
    slope,
    normal,
    biome,
    streamDistance
  };
}

export function streamCenterX(seed: number, z: number): number {
  const wide = Math.sin(z * 0.037 + seed * 0.003) * 6.8;
  const detail = Math.sin(z * 0.117 + seed * 0.011) * 2.2;
  return wide + detail;
}

function classifyBiome(
  height: number,
  moisture: number,
  slope: number,
  streamDistance: number
): BiomeId {
  if (streamDistance < 5.2) {
    return "wetland";
  }

  if (height > 29 && streamDistance > 30) {
    return "alpine";
  }

  if (slope > 0.82 && height > 18 && streamDistance > 42) {
    return "alpine";
  }

  if (moisture > 0.55 || height < 7) {
    return "ravine";
  }

  if (moisture < 0.25) {
    return "meadow";
  }

  return "forest";
}

function colorForSample(sample: TerrainSample, color: Color): void {
  if (sample.streamDistance < 4.8) {
    color.setRGB(0.09, 0.1, 0.075);
    return;
  }

  if (sample.streamDistance < 12) {
    const damp = 1 - sample.streamDistance / 12;
    color.setRGB(0.13 + damp * 0.015, 0.14 + damp * 0.015, 0.09 + damp * 0.01);
    return;
  }

  if (sample.biome === "wetland") {
    color.setRGB(0.12, 0.15, 0.095);
    return;
  }

  if (sample.biome === "alpine") {
    const snow = Math.max(0, sample.height - 27) / 28;
    color.setRGB(0.18 + snow * 0.36, 0.22 + snow * 0.4, 0.24 + snow * 0.46);
    return;
  }

  if (sample.biome === "meadow") {
    color.setRGB(0.24, 0.25, 0.13);
    return;
  }

  if (sample.biome === "ravine") {
    color.setRGB(0.17, 0.18, 0.105);
    return;
  }

  color.setRGB(0.18, 0.2, 0.12);
}

function estimateNormal(seed: number, x: number, z: number): Vector3 {
  const step = 0.7;
  const left = sampleHeight(seed, x - step, z);
  const right = sampleHeight(seed, x + step, z);
  const down = sampleHeight(seed, x, z - step);
  const up = sampleHeight(seed, x, z + step);
  return new Vector3(left - right, step * 2, down - up).normalize();
}

function sampleHeight(seed: number, x: number, z: number): number {
  const streamDistance = Math.abs(streamCenterX(seed, z) - x);
  const valleyMask = Math.exp(-(streamDistance * streamDistance) / 390);
  const ridge = ridged(seed, x * 0.011, z * 0.011, 5);
  const macro = fbm(seed + 91, x * 0.006, z * 0.006, 5);
  const meso = fbm(seed + 303, x * 0.038, z * 0.038, 4);
  const alpineRise = Math.max(0, (Math.abs(x) - 56) * 0.17 + (z - 28) * 0.12);
  const channel = Math.exp(-(streamDistance * streamDistance) / 30);
  return (
    (macro - 0.44) * 18 +
    ridge * 22 +
    meso * 2.6 +
    alpineRise -
    valleyMask * 10.5 -
    channel * 2.35 +
    groundMicroRelief(seed, x, z, streamDistance)
  );
}

function groundMicroRelief(
  seed: number,
  x: number,
  z: number,
  streamDistance: number
): number {
  const bankT = Math.max(0, Math.min(1, (streamDistance - 5.4) / 10.5));
  const bankMask = bankT * bankT * (3 - 2 * bankT);
  const warpX =
    (fbm(seed + 1_109, x * 0.024, z * 0.024, 3) - 0.5) * 9;
  const warpZ =
    (fbm(seed + 1_193, x * 0.024, z * 0.024, 3) - 0.5) * 9;
  const hummocks =
    (fbm(
      seed + 1_277,
      (x + warpX) * 0.072,
      (z + warpZ) * 0.072,
      5
    ) -
      0.5) *
    1.35;
  const softClods =
    (fbm(
      seed + 1_699,
      (x - warpZ * 0.35) * 0.16,
      (z + warpX * 0.35) * 0.16,
      4
    ) -
      0.5) *
    0.46;
  return (hummocks + softClods) * bankMask;
}

function erodeTerrainGrid(
  vertices: number[],
  resolution: number,
  size: number,
  seed: number,
  iterations: number
): void {
  const row = resolution + 1;
  const count = row * row;
  const heights = new Float32Array(count);
  const deltas = new Float32Array(count);
  const cellSize = size / resolution;
  const talus = cellSize * 0.58;
  const neighbors = [
    -row - 1,
    -row,
    -row + 1,
    -1,
    1,
    row - 1,
    row,
    row + 1
  ] as const;

  for (let index = 0; index < count; index += 1) {
    heights[index] = vertices[index * 3 + 1] ?? 0;
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    deltas.fill(0);
    for (let zIndex = 1; zIndex < resolution; zIndex += 1) {
      const z = (zIndex / resolution - 0.5) * size;
      for (let xIndex = 1; xIndex < resolution; xIndex += 1) {
        const x = (xIndex / resolution - 0.5) * size;
        const mobility = erosionMobility(seed, x, z);
        if (mobility <= 0.001) {
          continue;
        }

        const index = zIndex * row + xIndex;
        const height = heights[index] ?? 0;
        let lowestIndex = index;
        let lowestHeight = height;
        for (const offset of neighbors) {
          const neighborIndex = index + offset;
          const neighborHeight = heights[neighborIndex] ?? height;
          if (neighborHeight < lowestHeight) {
            lowestHeight = neighborHeight;
            lowestIndex = neighborIndex;
          }
        }

        const excess = height - lowestHeight - talus;
        if (excess <= 0) {
          continue;
        }
        const transfer =
          Math.min(cellSize * 0.14, excess * 0.22) * mobility;
        deltas[index] = (deltas[index] ?? 0) - transfer;
        deltas[lowestIndex] =
          (deltas[lowestIndex] ?? 0) + transfer;
      }
    }

    for (let index = 0; index < count; index += 1) {
      heights[index] = (heights[index] ?? 0) + (deltas[index] ?? 0);
    }
  }

  const relaxed = new Float32Array(count);
  for (let pass = 0; pass < 2; pass += 1) {
    relaxed.set(heights);
    for (let zIndex = 1; zIndex < resolution; zIndex += 1) {
      const z = (zIndex / resolution - 0.5) * size;
      for (let xIndex = 1; xIndex < resolution; xIndex += 1) {
        const x = (xIndex / resolution - 0.5) * size;
        const mobility = erosionMobility(seed, x, z);
        const index = zIndex * row + xIndex;
        const height = heights[index] ?? 0;
        let weightedHeight = height;
        let totalWeight = 1;

        for (const offset of neighbors) {
          const neighborHeight = heights[index + offset] ?? height;
          const difference = Math.abs(neighborHeight - height);
          const weight = Math.max(0, 1 - difference / (cellSize * 2.2));
          weightedHeight += neighborHeight * weight;
          totalWeight += weight;
        }

        const average = weightedHeight / totalWeight;
        relaxed[index] =
          height + (average - height) * 0.24 * mobility;
      }
    }
    heights.set(relaxed);
  }

  for (let index = 0; index < count; index += 1) {
    vertices[index * 3 + 1] = heights[index] ?? 0;
  }
}

function erosionMobility(seed: number, x: number, z: number): number {
  const streamDistance = Math.abs(streamCenterX(seed, z) - x);
  const t = Math.max(0, Math.min(1, (streamDistance - 5.8) / 10));
  return t * t * (3 - 2 * t);
}

function sampleHeightGrid(
  vertices: readonly number[],
  resolution: number,
  size: number,
  x: number,
  z: number
): number {
  const gridX = Math.max(
    0,
    Math.min(resolution, (x / size + 0.5) * resolution)
  );
  const gridZ = Math.max(
    0,
    Math.min(resolution, (z / size + 0.5) * resolution)
  );
  const x0 = Math.min(resolution - 1, Math.floor(gridX));
  const z0 = Math.min(resolution - 1, Math.floor(gridZ));
  const tx = gridX - x0;
  const tz = gridZ - z0;
  const row = resolution + 1;
  const y00 = vertices[(z0 * row + x0) * 3 + 1] ?? 0;
  const y10 = vertices[(z0 * row + x0 + 1) * 3 + 1] ?? y00;
  const y01 = vertices[((z0 + 1) * row + x0) * 3 + 1] ?? y00;
  const y11 = vertices[((z0 + 1) * row + x0 + 1) * 3 + 1] ?? y00;
  const lower = y00 + (y10 - y00) * tx;
  const upper = y01 + (y11 - y01) * tx;
  return lower + (upper - lower) * tz;
}

function sampleNormalGrid(
  vertices: readonly number[],
  resolution: number,
  size: number,
  x: number,
  z: number
): Vector3 {
  const step = size / resolution;
  const left = sampleHeightGrid(vertices, resolution, size, x - step, z);
  const right = sampleHeightGrid(vertices, resolution, size, x + step, z);
  const down = sampleHeightGrid(vertices, resolution, size, x, z - step);
  const up = sampleHeightGrid(vertices, resolution, size, x, z + step);
  return new Vector3(left - right, step * 2, down - up).normalize();
}

function ridged(seed: number, x: number, z: number, octaves: number): number {
  const base = fbm(seed + 707, x, z, octaves);
  return (1 - Math.abs(base * 2 - 1)) ** 1.7;
}
