import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage
} from "three";

export interface HeightWindLayer {
  readonly geometry: BufferGeometry;
  readonly position: BufferAttribute;
  readonly basePositions: Float32Array;
  readonly minY: number;
  readonly heightRange: number;
  readonly maxBend: number;
  readonly phase: number;
  readonly speed: number;
}

const windX = 0.8407;
const windZ = 0.5400;

export function createHeightWindLayer(
  geometry: BufferGeometry,
  maxBend: number,
  phase: number,
  speed: number
): HeightWindLayer {
  const position = geometry.getAttribute("position");
  if (!(position instanceof BufferAttribute)) {
    throw new Error("Height wind requires a non-interleaved position attribute.");
  }
  position.setUsage(DynamicDrawUsage);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) {
    geometry.boundingSphere.radius += maxBend * 1.3;
  }

  return {
    geometry,
    position,
    basePositions: new Float32Array(position.array),
    minY,
    heightRange: Math.max(0.001, maxY - minY),
    maxBend,
    phase,
    speed
  };
}

export function updateHeightWindLayers(
  layers: readonly HeightWindLayer[],
  elapsedSeconds: number
): void {
  const gust = stormGust(elapsedSeconds);

  for (const layer of layers) {
    const flow = elapsedSeconds * layer.speed + layer.phase;
    for (let index = 0; index < layer.position.count; index += 1) {
      const offset = index * 3;
      const baseX = layer.basePositions[offset] ?? 0;
      const baseY = layer.basePositions[offset + 1] ?? 0;
      const baseZ = layer.basePositions[offset + 2] ?? 0;
      const heightT = clamp01((baseY - layer.minY) / layer.heightRange);
      const bendWeight = heightT ** 2.18;
      const trunkWave =
        Math.sin(flow + baseY * 0.085) * 0.2 +
        Math.sin(flow * 1.83 + baseY * 0.17 + layer.phase) * 0.09;
      const bend = layer.maxBend * bendWeight * (gust + trunkWave);
      const torsion =
        Math.sin(flow * 1.37 + baseY * 0.21 + layer.phase) *
        layer.maxBend *
        bendWeight *
        0.08;

      layer.position.setXYZ(
        index,
        baseX + windX * bend + windZ * torsion,
        baseY - Math.abs(bend) * heightT * 0.055,
        baseZ + windZ * bend - windX * torsion
      );
    }

    layer.position.needsUpdate = true;
  }
}

function stormGust(elapsedSeconds: number): number {
  const front = Math.sin(elapsedSeconds * 0.34) * 0.5 + 0.5;
  const pulse =
    Math.sin(
      elapsedSeconds * 0.91 +
        Math.sin(elapsedSeconds * 0.21) * 1.6
    ) *
      0.5 +
    0.5;
  const rolling = Math.sin(elapsedSeconds * 1.7 + 1.1) * 0.5 + 0.5;
  return (
    0.82 +
    smoothstep01(front) * 0.48 +
    smoothstep01(pulse) * 0.38 +
    rolling * 0.18
  );
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
