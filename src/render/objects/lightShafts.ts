import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  Vector3
} from "three";
import type { WorldConfig } from "../../types";
import type { TerrainSystem } from "../../world/terrain";
import { createRandom } from "../../world/random";
import { streamCenterX } from "../../world/terrain";

export interface LightShafts {
  readonly group: Group;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
}

const sunDirection = new Vector3(0.46, -0.84, 0.29).normalize();

export function createLightShafts(
  config: WorldConfig,
  terrain: TerrainSystem
): LightShafts {
  const group = new Group();
  group.name = "LAAS illuminated canopy motes";
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const material = new PointsMaterial({
    color: 0xffd69b,
    size: 0.17,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const random = createRandom(config.seed + 4_100);
  const coolMode = config.thermal === "cool";
  const shaftCount = config.preset === "high" && !coolMode ? 10 : coolMode ? 4 : 7;
  const motesPerShaft = config.preset === "high" && !coolMode ? 360 : coolMode ? 110 : 250;

  for (let index = 0; index < shaftCount; index += 1) {
    const z = random.range(-20, 66);
    const x = streamCenterX(config.seed, z) + random.range(-15, 19);
    const ground = terrain.sample(x, z);
    const length = random.range(30, 48);
    const startX = x - sunDirection.x * length;
    const startY = ground.height - sunDirection.y * length;
    const startZ = z - sunDirection.z * length;

    for (let moteIndex = 0; moteIndex < motesPerShaft; moteIndex += 1) {
      const t = random.next();
      const radius = random.range(0.1, 1.15) * (0.7 + (1 - t) * 0.7);
      positions.push(
        startX + sunDirection.x * length * t + random.signed() * radius,
        startY + sunDirection.y * length * t + random.signed() * radius * 0.35,
        startZ + sunDirection.z * length * t + random.signed() * radius
      );
    }
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const motes = new Points(geometry, material);
  motes.name = "pollen columns tracing canopy light";
  motes.renderOrder = 3;
  group.add(motes);

  return {
    group,
    triangleEstimate: 0,
    drawCallEstimate: 1
  };
}
