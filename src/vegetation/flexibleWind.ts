import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3
} from "three";

export type FlexibleWindAxis = "y" | "z";

export interface FlexibleWindLayer {
  readonly mesh: InstancedMesh;
  readonly positions: Float32Array;
  readonly quaternions: Float32Array;
  readonly scales: Float32Array;
  readonly localWind: Float32Array;
  readonly phases: Float32Array;
  readonly amplitudes: Float32Array;
  readonly maxBend: number;
  readonly compression: number;
  readonly speed: number;
  readonly bendAxis: FlexibleWindAxis;
}

const windDirection = new Vector3(0.84, 0, 0.54).normalize();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const tempQuaternion = new Quaternion();
const inverseQuaternion = new Quaternion();
const baseRotation = new Matrix4();
const deform = new Matrix4();
const scaleMatrix = new Matrix4();
const animatedMatrix = new Matrix4();
const localWind = new Vector3();

export function createFlexibleWindLayer(
  mesh: InstancedMesh,
  count: number,
  maxBend: number,
  compression: number,
  speed: number,
  bendAxis: FlexibleWindAxis
): FlexibleWindLayer {
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return {
    mesh,
    positions: new Float32Array(count * 3),
    quaternions: new Float32Array(count * 4),
    scales: new Float32Array(count * 3),
    localWind: new Float32Array(count * 2),
    phases: new Float32Array(count),
    amplitudes: new Float32Array(count),
    maxBend,
    compression,
    speed,
    bendAxis
  };
}

export function recordFlexibleWindInstance(
  layer: FlexibleWindLayer,
  index: number,
  matrix: Matrix4,
  phase: number,
  amplitude: number
): void {
  matrix.decompose(tempPosition, tempQuaternion, tempScale);
  const positionOffset = index * 3;
  const quaternionOffset = index * 4;
  const windOffset = index * 2;

  layer.positions[positionOffset] = tempPosition.x;
  layer.positions[positionOffset + 1] = tempPosition.y;
  layer.positions[positionOffset + 2] = tempPosition.z;
  layer.quaternions[quaternionOffset] = tempQuaternion.x;
  layer.quaternions[quaternionOffset + 1] = tempQuaternion.y;
  layer.quaternions[quaternionOffset + 2] = tempQuaternion.z;
  layer.quaternions[quaternionOffset + 3] = tempQuaternion.w;
  layer.scales[positionOffset] = tempScale.x;
  layer.scales[positionOffset + 1] = tempScale.y;
  layer.scales[positionOffset + 2] = tempScale.z;

  inverseQuaternion.copy(tempQuaternion).invert();
  localWind.copy(windDirection).applyQuaternion(inverseQuaternion);
  localWind.y = 0;
  if (localWind.lengthSq() < 0.0001) {
    localWind.set(1, 0, 0);
  } else {
    localWind.normalize();
  }
  layer.localWind[windOffset] = localWind.x;
  layer.localWind[windOffset + 1] = localWind.z;
  layer.phases[index] = phase;
  layer.amplitudes[index] = amplitude;
}

export function updateFlexibleWindLayers(
  layers: readonly FlexibleWindLayer[],
  elapsedSeconds: number
): void {
  const gust = stormGust(elapsedSeconds);
  for (const layer of layers) {
    updateFlexibleWindLayer(layer, elapsedSeconds, gust);
  }
}

function updateFlexibleWindLayer(
  layer: FlexibleWindLayer,
  elapsedSeconds: number,
  gust: number
): void {
  const flow = elapsedSeconds * layer.speed;

  for (let index = 0; index < layer.phases.length; index += 1) {
    const positionOffset = index * 3;
    const quaternionOffset = index * 4;
    const windOffset = index * 2;
    const phase = layer.phases[index] ?? 0;
    const amplitude = layer.amplitudes[index] ?? 1;
    const flutter =
      Math.sin(flow + phase) * 0.34 +
      Math.sin(flow * 2.37 + phase * 1.31) * 0.18 +
      Math.sin(flow * 5.2 + phase * 0.73) * 0.075;
    const bend = Math.min(
      layer.maxBend * 1.55,
      layer.maxBend * (gust + flutter) * amplitude
    );
    const windX = layer.localWind[windOffset] ?? 1;
    const windZ = layer.localWind[windOffset + 1] ?? 0;

    tempPosition.set(
      layer.positions[positionOffset] ?? 0,
      layer.positions[positionOffset + 1] ?? 0,
      layer.positions[positionOffset + 2] ?? 0
    );
    tempQuaternion.set(
      layer.quaternions[quaternionOffset] ?? 0,
      layer.quaternions[quaternionOffset + 1] ?? 0,
      layer.quaternions[quaternionOffset + 2] ?? 0,
      layer.quaternions[quaternionOffset + 3] ?? 1
    );
    tempScale.set(
      layer.scales[positionOffset] ?? 1,
      layer.scales[positionOffset + 1] ?? 1,
      layer.scales[positionOffset + 2] ?? 1
    );

    baseRotation.makeRotationFromQuaternion(tempQuaternion);
    baseRotation.setPosition(tempPosition);
    scaleMatrix.makeScale(tempScale.x, tempScale.y, tempScale.z);

    if (layer.bendAxis === "y") {
      const verticalCompression = Math.max(
        0.46,
        1 - Math.abs(bend) * layer.compression
      );
      deform.set(
        1, windX * bend, 0, 0,
        0, verticalCompression, 0, 0,
        0, windZ * bend, 1, 0,
        0, 0, 0, 1
      );
    } else {
      const sag = Math.min(0.48, Math.abs(bend) * layer.compression);
      deform.set(
        1, 0, windX * bend, 0,
        0, 1, -sag, 0,
        0, 0, 1 + windZ * bend * 0.22, 0,
        0, 0, 0, 1
      );
    }

    animatedMatrix
      .copy(baseRotation)
      .multiply(deform)
      .multiply(scaleMatrix);
    layer.mesh.setMatrixAt(index, animatedMatrix);
  }

  layer.mesh.instanceMatrix.needsUpdate = true;
}

function stormGust(elapsedSeconds: number): number {
  const front = Math.sin(elapsedSeconds * 0.28) * 0.5 + 0.5;
  const hammer =
    Math.sin(elapsedSeconds * 0.83 + Math.sin(elapsedSeconds * 0.17) * 2.1) *
      0.5 +
    0.5;
  const turbulence = Math.sin(elapsedSeconds * 1.93 + 0.8) * 0.5 + 0.5;
  return (
    0.92 +
    smoothstep01(front) * 0.42 +
    smoothstep01(hammer) * 0.38 +
    turbulence * 0.16
  );
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
