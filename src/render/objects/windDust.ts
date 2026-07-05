import {
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  Vector3
} from "three";
import type { FrameUpdatable, WorldConfig } from "../../types";
import type { TerrainSystem } from "../../world/terrain";
import { createRandom } from "../../world/random";
import { streamCenterX } from "../../world/terrain";

export interface WindDustSystem extends FrameUpdatable {
  readonly group: Group;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
}

const windDirection = new Vector3(0.84, 0, 0.54).normalize();

export function createWindDust(
  config: WorldConfig,
  terrain: TerrainSystem
): WindDustSystem {
  const group = new Group();
  group.name = "wind storm dust and leaf flecks";

  const coolMode = config.thermal === "cool";
  const count = Math.round(
    (config.preset === "high" ? 760 : 430) * (coolMode ? 0.46 : 1)
  );
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const lifts = new Float32Array(count);
  const random = createRandom(config.seed + 8_800);

  for (let index = 0; index < count; index += 1) {
    resetDustParticle(index, config, terrain, random, positions, speeds, phases, lifts, true);
  }

  const geometry = new BufferGeometry();
  const position = new Float32BufferAttribute(positions, 3);
  position.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(new Float32Array(count * 2).fill(0.5), 2)
  );
  geometry.computeBoundingSphere();

  const material = new PointsMaterial({
    color: 0xd2b37c,
    map: createDustTexture(),
    size: coolMode ? 0.32 : 0.38,
    sizeAttenuation: true,
    transparent: true,
    opacity: coolMode ? 0.18 : 0.24,
    alphaTest: 0.025,
    depthWrite: false
  });
  const points = new Points(geometry, material);
  points.name = "strong wind dust flecks";
  points.frustumCulled = false;
  points.renderOrder = 12;
  group.add(points);

  return {
    group,
    triangleEstimate: 0,
    drawCallEstimate: 1,
    update(deltaSeconds: number, elapsedSeconds: number): void {
      const gust = stormGust(elapsedSeconds);
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        const phase = phases[index] ?? 0;
        const speed = speeds[index] ?? 1;
        const x = positions[offset] ?? 0;
        const z = positions[offset + 2] ?? 0;
        const cross =
          Math.sin(elapsedSeconds * 1.4 + phase) * 0.42 +
          Math.sin(elapsedSeconds * 3.2 + phase * 1.7) * 0.16;
        const nextX =
          x +
          windDirection.x * speed * gust * deltaSeconds +
          windDirection.z * cross * deltaSeconds;
        const nextZ =
          z +
          windDirection.z * speed * gust * deltaSeconds -
          windDirection.x * cross * deltaSeconds;

        if (nextX > 82 || nextZ > 96 || nextX < -82 || nextZ < -86) {
          resetDustParticle(index, config, terrain, random, positions, speeds, phases, lifts, false);
          continue;
        }

        const ground = terrain.heightAt(nextX, nextZ);
        const lift = lifts[index] ?? 0.5;
        positions[offset] = nextX;
        positions[offset + 1] =
          ground +
          lift +
          Math.sin(elapsedSeconds * 4.4 + phase) * 0.16 +
          gust * 0.18;
        positions[offset + 2] = nextZ;
      }

      position.needsUpdate = true;
    }
  };
}

function resetDustParticle(
  index: number,
  config: WorldConfig,
  terrain: TerrainSystem,
  random: ReturnType<typeof createRandom>,
  positions: Float32Array,
  speeds: Float32Array,
  phases: Float32Array,
  lifts: Float32Array,
  anywhere: boolean
): void {
  const z = anywhere ? random.range(-78, 86) : random.range(-78, 22);
  const center = streamCenterX(config.seed, z);
  const side = random.next() < 0.5 ? -1 : 1;
  const x = anywhere
    ? center + side * random.range(4, 44)
    : center - windDirection.x * random.range(42, 74) + random.signed() * 18;
  const sample = terrain.sample(x, z);
  const offset = index * 3;
  positions[offset] = x;
  positions[offset + 1] = sample.height + random.range(0.2, 3.2);
  positions[offset + 2] = z - windDirection.z * (anywhere ? 0 : random.range(18, 46));
  speeds[index] = random.range(7.5, 17.5);
  phases[index] = random.range(0, Math.PI * 2);
  lifts[index] = random.range(0.16, 2.65);
}

function createDustTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    return new CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,239,190,0.95)");
  gradient.addColorStop(0.18, "rgba(235,199,132,0.74)");
  gradient.addColorStop(0.52, "rgba(166,119,62,0.22)");
  gradient.addColorStop(1, "rgba(128,82,42,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function stormGust(elapsedSeconds: number): number {
  const front = Math.sin(elapsedSeconds * 0.34) * 0.5 + 0.5;
  const pulse = Math.sin(elapsedSeconds * 0.91 + Math.sin(elapsedSeconds * 0.21) * 1.6) * 0.5 + 0.5;
  const rolling = Math.sin(elapsedSeconds * 1.7 + 1.1) * 0.5 + 0.5;
  return 0.68 + smoothstep01(front) * 0.42 + smoothstep01(pulse) * 0.3 + rolling * 0.18;
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
