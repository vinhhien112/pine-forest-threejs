import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DodecahedronGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  Points,
  PointsMaterial,
  Vector3
} from "three";
import type {
  BallObstacleDescriptor,
  BallWaterState,
  FrameUpdatable,
  WorldConfig
} from "../../types";
import type { MeshPhysicalNodeMaterial } from "three/webgpu";
import type { TerrainSystem } from "../../world/terrain";
import { createRandom } from "../../world/random";
import { streamCenterX } from "../../world/terrain";
import {
  streamBedMaterial,
  waterSurfaceMaterial,
  wetBankMaterial
} from "../materials/materials";
import { createRockSurfaceMaterial } from "../materials/surfaceMaterials";

export interface WaterSystem extends FrameUpdatable {
  readonly group: Group;
  readonly obstacleColliders: readonly BallObstacleDescriptor[];
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  setBallDisturbance(state: BallWaterState): void;
}

interface StreamPath {
  readonly zMin: number;
  readonly zMax: number;
  readonly segments: number;
  readonly centerX: Float32Array;
  readonly surfaceY: Float32Array;
}

interface MutablePathSample {
  x: number;
  y: number;
}

interface Breaker {
  readonly x: number;
  readonly z: number;
  readonly lateral: number;
  readonly scale: number;
}

interface ParticleLayer {
  readonly points: Points<BufferGeometry, PointsMaterial>;
  readonly position: BufferAttribute;
  readonly baseZ: Float32Array;
  readonly lateral: Float32Array;
  readonly phase: Float32Array;
  readonly speed?: Float32Array;
}

interface BallWakeLayer extends ParticleLayer {
  splashAge: number;
}

export const waterStreamStart = -72;
export const waterStreamEnd = 80;
export const waterSurfaceLift = 1.34;
const streamStart = waterStreamStart;
const streamEnd = waterStreamEnd;
const surfaceLift = waterSurfaceLift;
const tempObject = new Object3D();

export function createWater(config: WorldConfig, terrain: TerrainSystem): WaterSystem {
  const group = new Group();
  group.name = "LAAS layered shallow stream";

  const coolMode = config.thermal === "cool";
  const highQuality = config.preset === "high" && !coolMode;
  const lengthSegments = highQuality ? 224 : coolMode ? 124 : 168;
  const widthSegments = highQuality ? 18 : coolMode ? 8 : 12;
  const path = createStreamPath(config, terrain, lengthSegments);

  const bed = createStreamBed(config, terrain, path, highQuality ? 18 : coolMode ? 10 : 14);
  bed.mesh.renderOrder = 1;
  group.add(bed.mesh);

  const wetBanks = createWetBanks(config, terrain, path);
  wetBanks.mesh.renderOrder = 2;
  group.add(wetBanks.mesh);

  const caustics = createCausticLayer(
    config,
    path,
    highQuality ? 300 : coolMode ? 32 : 78
  );
  caustics.points.renderOrder = 3;
  group.add(caustics.points);

  const breakers = createBreakers(
    config,
    path,
    highQuality ? 72 : coolMode ? 30 : 52
  );
  breakers.mesh.renderOrder = 4;
  group.add(breakers.mesh);

  const surface = createWaterSurface(config, path, widthSegments);
  surface.mesh.renderOrder = 5;
  group.add(surface.mesh);

  const foam = createFoamLayer(
    config,
    path,
    breakers.breakers,
    highQuality ? 132 : coolMode ? 30 : 68
  );
  foam.points.renderOrder = 6;
  group.add(foam.points);

  const flow = createFlowHighlights(
    config,
    path,
    highQuality ? 116 : coolMode ? 26 : 66
  );
  flow.points.renderOrder = 7;
  group.add(flow.points);

  const ripples = createRippleLayer(
    config,
    path,
    highQuality ? 260 : coolMode ? 72 : 168
  );
  ripples.points.renderOrder = 8;
  group.add(ripples.points);

  const ballWake = createBallWakeLayer(coolMode ? 36 : 64);
  ballWake.points.renderOrder = 9;
  group.add(ballWake.points);

  const sample: MutablePathSample = { x: 0, y: 0 };
  const ballDisturbance: BallWaterState = {
    active: false,
    position: new Vector3(),
    velocity: new Vector3(),
    speed: 0,
    immersion: 0,
    enteredWater: false
  };
  let normalFrame = 0;

  return {
    group,
    obstacleColliders: breakers.obstacleColliders,
    triangleEstimate:
      bed.triangles +
      wetBanks.triangles +
      surface.triangles +
      breakers.triangles,
    drawCallEstimate: 9,
    setBallDisturbance(state: BallWaterState): void {
      ballDisturbance.active = state.active;
      ballDisturbance.position.copy(state.position);
      ballDisturbance.velocity.copy(state.velocity);
      ballDisturbance.speed = state.speed;
      ballDisturbance.immersion = state.immersion;
      ballDisturbance.enteredWater = state.enteredWater;
    },
    update(deltaSeconds: number, elapsedSeconds: number): void {
      updateSurface(
        surface.geometry,
        surface.basePositions,
        elapsedSeconds,
        ballDisturbance
      );
      updateWaterTextureFlow(surface.material, elapsedSeconds);
      normalFrame += 1;
      if (normalFrame % (coolMode ? 4 : 2) === 0) {
        surface.geometry.computeVertexNormals();
      }

      updateFoamLayer(foam, path, elapsedSeconds, sample);
      updateFlowLayer(flow, path, elapsedSeconds, sample);
      updateRippleLayer(ripples, path, elapsedSeconds, sample);
      updateBallWakeLayer(
        ballWake,
        path,
        deltaSeconds,
        elapsedSeconds,
        ballDisturbance,
        sample
      );
      updateCausticLayer(caustics, path, elapsedSeconds, sample);
    }
  };
}

function createStreamPath(
  config: WorldConfig,
  terrain: TerrainSystem,
  segments: number
): StreamPath {
  const centerX = new Float32Array(segments + 1);
  const surfaceY = new Float32Array(segments + 1);

  for (let index = 0; index <= segments; index += 1) {
    const z = streamStart + (index / segments) * (streamEnd - streamStart);
    const x = streamCenterX(config.seed, z);
    centerX[index] = x;
    surfaceY[index] = terrain.sample(x, z).height + surfaceLift;
  }

  return {
    zMin: streamStart,
    zMax: streamEnd,
    segments,
    centerX,
    surfaceY
  };
}

function createWaterSurface(
  config: WorldConfig,
  path: StreamPath,
  widthSegments: number
): {
  mesh: Mesh;
  geometry: BufferGeometry;
  material: MeshPhysicalNodeMaterial;
  basePositions: Float32Array;
  triangles: number;
} {
  const vertices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const bankColor = new Color(0x8bcfc1);
  const channelColor = new Color(0x147d93);
  const color = new Color();

  for (let zIndex = 0; zIndex <= path.segments; zIndex += 1) {
    const v = zIndex / path.segments;
    const z = path.zMin + v * (path.zMax - path.zMin);
    const endTaper = smoothstep01(Math.min(v, 1 - v) / 0.12);
    const halfWidth = waterHalfWidth(config.seed, z) * (0.74 + endTaper * 0.26);
    for (let xIndex = 0; xIndex <= widthSegments; xIndex += 1) {
      const u = xIndex / widthSegments;
      const lateral = u * 2 - 1;
      const side = lateral < 0 ? -1 : 1;
      const edgeWeight = Math.abs(lateral) ** 1.55;
      const centerWeight = 1 - Math.abs(lateral);
      const convexFlow =
        Math.sin(z * 0.19 + config.seed * 0.031 + lateral * 1.6) * 0.024;
      const bankWobble =
        (Math.sin(z * 0.39 + config.seed * 0.041 + side * 1.7) * 0.34 +
          Math.sin(z * 1.13 - config.seed * 0.019 + side * 2.9) * 0.16) *
        edgeWeight *
        endTaper;
      const edgeVariation =
        Math.sin(z * 0.72 + config.seed * 0.019 + lateral * 2.4) *
        0.24 *
        edgeWeight *
        endTaper;
      const edgeSink = edgeWeight * 0.07 + (1 - endTaper) * 0.32;
      vertices.push(
        (path.centerX[zIndex] ?? 0) +
          lateral * (halfWidth + bankWobble) +
          edgeVariation,
        (path.surfaceY[zIndex] ?? 0) + convexFlow * centerWeight - edgeSink,
        z
      );
      uvs.push(u, v);
      color.lerpColors(bankColor, channelColor, centerWeight ** 0.72);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = widthSegments + 1;
  for (let zIndex = 0; zIndex < path.segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < widthSegments; xIndex += 1) {
      const a = zIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  const position = new Float32BufferAttribute(vertices, 3);
  position.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = waterSurfaceMaterial(config.seed);
  const mesh = new Mesh(geometry, material);
  mesh.name = "transparent multi-frequency water surface";
  mesh.receiveShadow = true;

  return {
    mesh,
    geometry,
    material,
    basePositions: new Float32Array(position.array),
    triangles: indices.length / 3
  };
}

function createStreamBed(
  config: WorldConfig,
  terrain: TerrainSystem,
  path: StreamPath,
  widthSegments: number
): { mesh: Mesh; triangles: number } {
  const halfWidth = 6.55;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const channelColor = new Color(0x15282a);
  const bankColor = new Color(0x32382f);
  const color = new Color();

  for (let zIndex = 0; zIndex <= path.segments; zIndex += 1) {
    const z = path.zMin + (zIndex / path.segments) * (path.zMax - path.zMin);
    for (let xIndex = 0; xIndex <= widthSegments; xIndex += 1) {
      const lateral = (xIndex / widthSegments) * 2 - 1;
      const x = (path.centerX[zIndex] ?? 0) + lateral * halfWidth;
      const ground = terrain.sample(x, z);
      vertices.push(x, ground.height + 0.075, z);
      color.lerpColors(channelColor, bankColor, Math.abs(lateral) ** 1.4);
      const variation = Math.sin(z * 0.31 + lateral * 7.1 + config.seed) * 0.035;
      color.offsetHSL(variation * 0.12, 0, variation);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = widthSegments + 1;
  for (let zIndex = 0; zIndex < path.segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < widthSegments; xIndex += 1) {
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const mesh = new Mesh(geometry, streamBedMaterial());
  mesh.name = "damp contoured stream bed";
  mesh.receiveShadow = true;
  return { mesh, triangles: indices.length / 3 };
}

function createWetBanks(
  config: WorldConfig,
  terrain: TerrainSystem,
  path: StreamPath
): { mesh: Mesh; triangles: number } {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const innerColor = new Color(0x132820);
  const outerColor = new Color(0x30442e);
  const sides = [-1, 1] as const;

  sides.forEach((side, sideIndex) => {
    const baseVertex = sideIndex * (path.segments + 1) * 2;
    for (let zIndex = 0; zIndex <= path.segments; zIndex += 1) {
      const z = path.zMin + (zIndex / path.segments) * (path.zMax - path.zMin);
      const center = path.centerX[zIndex] ?? 0;
      const localHalfWidth = waterHalfWidth(config.seed, z);
      const innerDistance = Math.max(1.4, localHalfWidth - 0.12);
      const outerDistance = localHalfWidth + 2.65;
      const innerX = center + side * innerDistance;
      const outerX = center + side * outerDistance;
      const innerHeight = Math.max(
        (path.surfaceY[zIndex] ?? 0) - 0.025,
        terrain.sample(innerX, z).height + 0.065
      );
      const outerHeight = terrain.sample(outerX, z).height + 0.07;
      vertices.push(innerX, innerHeight, z, outerX, outerHeight, z);
      colors.push(
        innerColor.r,
        innerColor.g,
        innerColor.b,
        outerColor.r,
        outerColor.g,
        outerColor.b
      );
    }

    for (let zIndex = 0; zIndex < path.segments; zIndex += 1) {
      const a = baseVertex + zIndex * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side < 0) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const mesh = new Mesh(geometry, wetBankMaterial());
  mesh.name = "glossy wet stream margins";
  mesh.receiveShadow = true;
  return { mesh, triangles: indices.length / 3 };
}

function createBreakers(
  config: WorldConfig,
  path: StreamPath,
  count: number
): {
  mesh: InstancedMesh;
  breakers: readonly Breaker[];
  obstacleColliders: readonly BallObstacleDescriptor[];
  triangles: number;
} {
  const geometry = new DodecahedronGeometry(0.48, 1);
  distortGeometry(geometry, config.seed + 5_211, 0.16);
  const material = createRockSurfaceMaterial(config.seed + 5_219, 0.78);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = "partially submerged flow breaker stones";
  const random = createRandom(config.seed + 5_100);
  const breakers: Breaker[] = [];
  const obstacleColliders: BallObstacleDescriptor[] = [];
  const sample: MutablePathSample = { x: 0, y: 0 };

  for (let index = 0; index < count; index += 1) {
    const z = random.range(path.zMin + 5, path.zMax - 5);
    const lateral = random.range(-2.25, 2.25);
    const scale = random.range(0.48, 1.35);
    samplePath(path, z, sample);
    const x = sample.x + lateral;

    const y = sample.y - scale * 0.13;
    tempObject.position.set(x, y, z);
    tempObject.rotation.set(
      random.signed() * 0.28,
      random.range(0, Math.PI * 2),
      random.signed() * 0.24
    );
    const xScale = scale * random.range(0.75, 1.42);
    const yScale = scale * random.range(0.38, 0.78);
    const zScale = scale * random.range(0.72, 1.38);
    tempObject.scale.set(xScale, yScale, zScale);
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    obstacleColliders.push({
      x,
      y: y + Math.max(0.16, scale * 0.18),
      z,
      radius: 0.48 * Math.max(xScale, zScale) * 0.86
    });
    mesh.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.38, 0.5),
        random.range(0.04, 0.15),
        random.range(0.25, 0.43)
      )
    );
    breakers.push({ x, z, lateral, scale });
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    breakers,
    obstacleColliders,
    triangles: geometryTriangleCount(geometry) * count
  };
}

function createFoamLayer(
  config: WorldConfig,
  path: StreamPath,
  breakers: readonly Breaker[],
  count: number
): ParticleLayer {
  const random = createRandom(config.seed + 5_400);
  const positions = new Float32Array(count * 3);
  const baseZ = new Float32Array(count);
  const lateral = new Float32Array(count);
  const phase = new Float32Array(count);
  const sample: MutablePathSample = { x: 0, y: 0 };

  for (let index = 0; index < count; index += 1) {
    const breaker = breakers[index % breakers.length];
    if (!breaker) {
      continue;
    }
    const scatter = breaker.scale * random.range(0.28, 1.15);
    const z = breaker.z - random.range(0.08, scatter * 1.45);
    const lateralOffset =
      breaker.lateral +
      random.signed() * scatter * 0.78 +
      Math.sin(index * 2.31) * breaker.scale * 0.2;
    baseZ[index] = z;
    lateral[index] = lateralOffset;
    phase[index] = random.range(0, Math.PI * 2);
    samplePath(path, z, sample);
    positions[index * 3] = sample.x + lateralOffset;
    positions[index * 3 + 1] = sample.y + 0.045;
    positions[index * 3 + 2] = z;
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
    color: 0xd9fff2,
    map: createParticleTexture("foam"),
    size: 0.085,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.105,
    alphaTest: 0.08,
    depthWrite: false
  });
  const points = new Points(geometry, material);
  points.name = "foam gathered around breaker stones";
  points.frustumCulled = false;

  return {
    points,
    position,
    baseZ,
    lateral,
    phase
  };
}

function createFlowHighlights(
  config: WorldConfig,
  path: StreamPath,
  count: number
): ParticleLayer {
  const random = createRandom(config.seed + 5_700);
  const positions = new Float32Array(count * 3);
  const baseZ = new Float32Array(count);
  const lateral = new Float32Array(count);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const sample: MutablePathSample = { x: 0, y: 0 };

  for (let index = 0; index < count; index += 1) {
    const z = random.range(path.zMin, path.zMax);
    const lateralOffset = random.range(-3.25, 3.25);
    baseZ[index] = z;
    lateral[index] = lateralOffset;
    phase[index] = random.range(0, Math.PI * 2);
    speed[index] = random.range(0.2, 0.58);
    samplePath(path, z, sample);
    positions[index * 3] = sample.x + lateralOffset;
    positions[index * 3 + 1] = sample.y + 0.06;
    positions[index * 3 + 2] = z;
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
    color: 0xf3fff7,
    map: createParticleTexture("glint"),
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.12,
    alphaTest: 0.04,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const points = new Points(geometry, material);
  points.name = "slow viscous reflection glints";
  points.frustumCulled = false;

  return {
    points,
    position,
    baseZ,
    lateral,
    phase,
    speed
  };
}

function createRippleLayer(
  config: WorldConfig,
  path: StreamPath,
  count: number
): ParticleLayer {
  const random = createRandom(config.seed + 5_760);
  const positions = new Float32Array(count * 3);
  const baseZ = new Float32Array(count);
  const lateral = new Float32Array(count);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const sample: MutablePathSample = { x: 0, y: 0 };

  for (let index = 0; index < count; index += 1) {
    const z = random.range(path.zMin, path.zMax);
    const lateralOffset = random.range(-3.65, 3.65);
    baseZ[index] = z;
    lateral[index] = lateralOffset;
    phase[index] = random.range(0, Math.PI * 2);
    speed[index] = random.range(0.82, 1.82);
    samplePath(path, z, sample);
    positions[index * 3] = sample.x + lateralOffset;
    positions[index * 3 + 1] = sample.y + 0.082;
    positions[index * 3 + 2] = z;
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
    color: 0xd7fff4,
    map: createParticleTexture("ripple"),
    size: 0.34,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.2,
    alphaTest: 0.035,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const points = new Points(geometry, material);
  points.name = "capillary ripple arcs on water surface";
  points.frustumCulled = false;

  return {
    points,
    position,
    baseZ,
    lateral,
    phase,
    speed
  };
}

function createBallWakeLayer(count: number): BallWakeLayer {
  const positions = new Float32Array(count * 3);
  const baseZ = new Float32Array(count);
  const lateral = new Float32Array(count);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    baseZ[index] = 0;
    lateral[index] = index % 2 === 0 ? -1 : 1;
    phase[index] = (index * 12.9898) % (Math.PI * 2);
    speed[index] = 0.7 + ((index * 17.13) % 1) * 1.4;
    positions[index * 3] = 0;
    positions[index * 3 + 1] = -1000;
    positions[index * 3 + 2] = 0;
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
    color: 0xeafff9,
    map: createParticleTexture("ripple"),
    size: 0.48,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    alphaTest: 0.025,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const points = new Points(geometry, material);
  points.name = "player ball water wake and splash";
  points.frustumCulled = false;

  return {
    points,
    position,
    baseZ,
    lateral,
    phase,
    speed,
    splashAge: 99
  };
}

function createCausticLayer(
  config: WorldConfig,
  path: StreamPath,
  count: number
): ParticleLayer {
  const random = createRandom(config.seed + 5_900);
  const positions = new Float32Array(count * 3);
  const baseZ = new Float32Array(count);
  const lateral = new Float32Array(count);
  const phase = new Float32Array(count);
  const sample: MutablePathSample = { x: 0, y: 0 };

  for (let index = 0; index < count; index += 1) {
    const z = random.range(path.zMin, path.zMax);
    const lateralOffset = random.range(-2.25, 2.25);
    baseZ[index] = z;
    lateral[index] = lateralOffset;
    phase[index] = random.range(0, Math.PI * 2);
    samplePath(path, z, sample);
    positions[index * 3] = sample.x + lateralOffset;
    positions[index * 3 + 1] = sample.y - 0.15;
    positions[index * 3 + 2] = z;
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
    color: 0x74bfb7,
    map: createParticleTexture("caustic"),
    size: 0.105,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.052,
    alphaTest: 0.018,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const points = new Points(geometry, material);
  points.name = "submerged streambed caustic flecks";
  points.frustumCulled = false;

  return {
    points,
    position,
    baseZ,
    lateral,
    phase
  };
}

function updateSurface(
  geometry: BufferGeometry,
  basePositions: Float32Array,
  elapsedSeconds: number,
  ballWaterState: BallWaterState
): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");

  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    const x = basePositions[offset];
    const baseY = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    if (x === undefined || baseY === undefined || z === undefined) {
      continue;
    }
    const bankFade = Math.sin(Math.PI * uv.getX(index)) ** 0.64;
    const streamCore = Math.sin(Math.PI * uv.getX(index)) ** 1.34;
    const slickRaw =
      Math.sin(x * 0.32 + z * 0.19 + elapsedSeconds * 0.16) +
      Math.sin(x * 0.11 - z * 0.29 - elapsedSeconds * 0.1) * 0.72 +
      Math.sin((x + z) * 0.075 + elapsedSeconds * 0.055) * 0.48;
    const slickMask = smoothstep01((slickRaw - 0.18) / 1.32) * streamCore;
    const rippleDrag = 1 - slickMask * 0.72;
    const longWave = Math.sin(z * 0.24 - elapsedSeconds * 0.9 + x * 0.16) * 0.032;
    const crossWave =
      Math.sin(x * 1.72 + z * 0.74 - elapsedSeconds * 1.45) *
      (0.018 + rippleDrag * 0.012);
    const travelingRipple =
      Math.sin(x * 4.6 - z * 2.35 + elapsedSeconds * 3.2) *
      0.016 *
      rippleDrag;
    const capillaryRipple =
      (Math.sin((x + z * 0.58) * 9.6 - elapsedSeconds * 5.6) * 0.007 +
        Math.sin((x * 1.6 - z) * 14.2 + elapsedSeconds * 7.25) * 0.0045) *
      rippleDrag;
    const brokenCrest =
      Math.max(
        0,
        Math.sin(z * 3.85 - elapsedSeconds * 4.75 + x * 2.1)
      ) **
        3.2 *
      0.018 *
      (1 - slickMask * 0.86);
    const viscousEddy =
      Math.sin(x * 0.58 - z * 0.24 + elapsedSeconds * 0.38) *
      0.017 *
      slickMask;
    const shoreLap =
      Math.sin(z * 2.4 - elapsedSeconds * 2.2 + Math.sign(uv.getX(index) - 0.5) * 1.1) *
      0.006 *
      (1 - streamCore);
    const ballWake = sampleBallWake(x, z, elapsedSeconds, ballWaterState);
    position.setY(
      index,
      baseY +
        (longWave + crossWave + travelingRipple + capillaryRipple + brokenCrest) *
          bankFade +
        viscousEddy +
        shoreLap +
        ballWake
    );
  }

  position.needsUpdate = true;
}

function sampleBallWake(
  x: number,
  z: number,
  elapsedSeconds: number,
  state: BallWaterState
): number {
  if (!state.active) {
    return 0;
  }

  const dx = x - state.position.x;
  const dz = z - state.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 9.8) {
    return 0;
  }

  const speed = Math.max(0.1, state.speed);
  const dirX = state.velocity.x / speed;
  const dirZ = state.velocity.z / speed;
  const speedGain = Math.min(1.15, state.speed / 9.2);
  const immersion = state.immersion;
  const localFade = Math.max(0, 1 - distance / 9.8);
  const circular =
    Math.sin(distance * 4.6 - elapsedSeconds * 8.4) *
    localFade *
    localFade *
    0.105;

  const backward = Math.max(0, -(dx * dirX + dz * dirZ));
  const sideDistance = Math.abs(dx * dirZ - dz * dirX);
  const vWake =
    Math.sin(backward * 4.2 - elapsedSeconds * 7.2 + sideDistance * 1.35) *
    Math.exp(-sideDistance * 0.5) *
    Math.min(1, backward / 6.2) *
    Math.exp(-distance * 0.13) *
    0.17;
  const entryPulse = state.enteredWater
    ? Math.sin(distance * 7.8 - elapsedSeconds * 13.5) *
      Math.max(0, 1 - distance / 4.2) *
      0.085
    : 0;

  return (circular + vWake * speedGain + entryPulse) * immersion;
}

function updateWaterTextureFlow(
  material: MeshPhysicalNodeMaterial,
  elapsedSeconds: number
): void {
  if (material.map) {
    material.map.offset.set(
      Math.sin(elapsedSeconds * 0.085) * 0.034,
      -elapsedSeconds * 0.083
    );
  }
  if (material.normalMap) {
    material.normalMap.offset.set(
      Math.sin(elapsedSeconds * 0.12) * 0.092,
      -elapsedSeconds * 0.22
    );
  }
  if (material.roughnessMap) {
    material.roughnessMap.offset.set(
      Math.sin(elapsedSeconds * 0.13) * 0.072,
      -elapsedSeconds * 0.13
    );
  }
}

function updateFoamLayer(
  layer: ParticleLayer,
  path: StreamPath,
  elapsedSeconds: number,
  sample: MutablePathSample
): void {
  for (let index = 0; index < layer.position.count; index += 1) {
    const phase = layer.phase[index] ?? 0;
    const z = (layer.baseZ[index] ?? 0) + Math.sin(elapsedSeconds * 0.58 + phase) * 0.08;
    samplePath(path, z, sample);
    const x =
      sample.x +
      (layer.lateral[index] ?? 0) +
      Math.cos(elapsedSeconds * 0.86 + phase) * 0.07;
    layer.position.setXYZ(
      index,
      x,
      sample.y + 0.055 + Math.sin(elapsedSeconds * 2.2 + phase) * 0.01,
      z
    );
  }
  layer.position.needsUpdate = true;
}

function updateFlowLayer(
  layer: ParticleLayer,
  path: StreamPath,
  elapsedSeconds: number,
  sample: MutablePathSample
): void {
  for (let index = 0; index < layer.position.count; index += 1) {
    const phase = layer.phase[index] ?? 0;
    const z = wrapRange(
      (layer.baseZ[index] ?? 0) - elapsedSeconds * (layer.speed?.[index] ?? 1),
      path.zMin,
      path.zMax
    );
    samplePath(path, z, sample);
    const lateral =
      (layer.lateral[index] ?? 0) +
      Math.sin(z * 0.7 + elapsedSeconds * 1.3 + phase) * 0.08;
    layer.position.setXYZ(
      index,
      sample.x + lateral,
      sample.y + 0.065 + Math.sin(z * 1.4 + elapsedSeconds * 3.6 + phase) * 0.01,
      z
    );
  }
  layer.position.needsUpdate = true;
}

function updateRippleLayer(
  layer: ParticleLayer,
  path: StreamPath,
  elapsedSeconds: number,
  sample: MutablePathSample
): void {
  for (let index = 0; index < layer.position.count; index += 1) {
    const phase = layer.phase[index] ?? 0;
    const z = wrapRange(
      (layer.baseZ[index] ?? 0) -
        elapsedSeconds * (layer.speed?.[index] ?? 1) +
        Math.sin(elapsedSeconds * 0.72 + phase) * 0.28,
      path.zMin,
      path.zMax
    );
    samplePath(path, z, sample);
    const lateral =
      (layer.lateral[index] ?? 0) +
      Math.sin(z * 0.92 + elapsedSeconds * 1.65 + phase) * 0.16;
    layer.position.setXYZ(
      index,
      sample.x + lateral,
      sample.y + 0.088 + Math.sin(z * 3.3 + elapsedSeconds * 4.1 + phase) * 0.018,
      z
    );
  }
  layer.points.material.size = 0.34 + Math.sin(elapsedSeconds * 1.7) * 0.035;
  layer.points.material.opacity = 0.15 + Math.sin(elapsedSeconds * 2.1) * 0.035;
  layer.position.needsUpdate = true;
}

function updateBallWakeLayer(
  layer: BallWakeLayer,
  path: StreamPath,
  deltaSeconds: number,
  elapsedSeconds: number,
  state: BallWaterState,
  sample: MutablePathSample
): void {
  if (state.enteredWater) {
    layer.splashAge = 0;
  } else {
    layer.splashAge += deltaSeconds;
  }

  const splash = Math.max(0, 1 - layer.splashAge / 0.72);
  if (!state.active && splash <= 0) {
    for (let index = 0; index < layer.position.count; index += 1) {
      layer.position.setXYZ(index, 0, -1000, 0);
    }
    layer.points.material.opacity = 0;
    layer.position.needsUpdate = true;
    return;
  }

  const speed = Math.max(0.1, state.speed);
  const dirX = speed > 0.2 ? state.velocity.x / speed : 0;
  const dirZ = speed > 0.2 ? state.velocity.z / speed : -1;
  const sideX = dirZ;
  const sideZ = -dirX;
  const wakeStrength = state.immersion * Math.min(1.1, state.speed / 8.2);

  for (let index = 0; index < layer.position.count; index += 1) {
    const phase = layer.phase[index] ?? 0;
    const laneSide = layer.lateral[index] ?? 1;
    const speedJitter = layer.speed?.[index] ?? 1;
    const laneT = (elapsedSeconds * (0.32 + speedJitter * 0.08) + phase) % 1;
    const trail = laneT * (5.0 + wakeStrength * 6.2);
    const sideSpread =
      laneSide *
      (0.42 + trail * 0.31 + Math.sin(elapsedSeconds * 2.7 + phase) * 0.16);
    const splashRing = index < layer.position.count * 0.45 ? splash : 0;
    const splashAngle = phase + elapsedSeconds * 1.5;
    const splashRadius = splashRing * (0.72 + (index % 9) * 0.28);
    const x =
      state.position.x -
      dirX * trail +
      sideX * sideSpread +
      Math.cos(splashAngle) * splashRadius;
    const z =
      state.position.z -
      dirZ * trail +
      sideZ * sideSpread +
      Math.sin(splashAngle) * splashRadius;

    samplePath(path, z, sample);
    const y =
      sample.y +
      0.11 +
      Math.sin(elapsedSeconds * 5.3 + phase + trail) * 0.052 +
      splashRing * (0.16 + (index % 4) * 0.045);
    layer.position.setXYZ(index, x, y, z);
  }

  layer.points.material.opacity = Math.min(
    0.46,
    state.immersion * 0.22 + wakeStrength * 0.18 + splash * 0.28
  );
  layer.points.material.size = 0.42 + wakeStrength * 0.32 + splash * 0.24;
  layer.position.needsUpdate = true;
}

function updateCausticLayer(
  layer: ParticleLayer,
  path: StreamPath,
  elapsedSeconds: number,
  sample: MutablePathSample
): void {
  for (let index = 0; index < layer.position.count; index += 1) {
    const phase = layer.phase[index] ?? 0;
    const z = (layer.baseZ[index] ?? 0) + Math.sin(elapsedSeconds * 0.35 + phase) * 0.16;
    samplePath(path, z, sample);
    layer.position.setXYZ(
      index,
      sample.x +
        (layer.lateral[index] ?? 0) +
        Math.cos(elapsedSeconds * 0.48 + phase) * 0.08,
      sample.y - 0.15,
      z
    );
  }
  layer.points.material.opacity =
    0.04 + Math.sin(elapsedSeconds * 1.6) * 0.01;
  layer.position.needsUpdate = true;
}

function samplePath(
  path: StreamPath,
  z: number,
  target: MutablePathSample
): void {
  const clampedZ = Math.max(path.zMin, Math.min(path.zMax, z));
  const normalized = (clampedZ - path.zMin) / (path.zMax - path.zMin);
  const scaled = normalized * path.segments;
  const index = Math.min(path.segments - 1, Math.floor(scaled));
  const fraction = scaled - index;
  const nextIndex = index + 1;
  const x0 = path.centerX[index] ?? 0;
  const x1 = path.centerX[nextIndex] ?? x0;
  const y0 = path.surfaceY[index] ?? 0;
  const y1 = path.surfaceY[nextIndex] ?? y0;
  target.x = x0 + (x1 - x0) * fraction;
  target.y = y0 + (y1 - y0) * fraction;
}

function createParticleTexture(
  kind: "foam" | "glint" | "caustic" | "ripple"
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    return new CanvasTexture(canvas);
  }

  context.clearRect(0, 0, 64, 64);
  if (kind === "glint") {
    const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.16, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.52, "rgba(255,255,255,0.2)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  } else if (kind === "caustic") {
    context.strokeStyle = "rgba(255,255,255,0.88)";
    context.lineWidth = 7;
    context.lineCap = "round";
    context.beginPath();
    context.arc(33, 34, 18, 0.25, 2.1);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,0.38)";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(27, 29, 11, 3.1, 5.55);
    context.stroke();
  } else if (kind === "ripple") {
    context.strokeStyle = "rgba(255,255,255,0.82)";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.beginPath();
    context.arc(32, 36, 24, 3.7, 5.42);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,0.34)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(34, 36, 13, 3.85, 5.27);
    context.stroke();
    context.strokeStyle = "rgba(200,255,245,0.2)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(30, 38, 18, 3.95, 4.8);
    context.stroke();
  } else {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 29);
    gradient.addColorStop(0, "rgba(255,255,255,0.94)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function geometryTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return index ? index.count / 3 : geometry.getAttribute("position").count / 3;
}

function distortGeometry(geometry: BufferGeometry, seed: number, amount: number): void {
  const position = geometry.getAttribute("position");
  const phase = (seed % 983) * 0.019;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const wave =
      Math.sin(x * 2.3 + phase) * 0.46 +
      Math.sin(y * 3.4 - phase) * 0.31 +
      Math.sin(z * 2.8 + phase * 1.2) * 0.23;
    const scale = 1 + wave * amount;
    position.setXYZ(index, x * scale, y * scale, z * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function wrapRange(value: number, min: number, max: number): number {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

export function waterHalfWidth(seed: number, z: number): number {
  const broad = Math.sin(z * 0.105 + seed * 0.013) * 0.56;
  const detail = Math.sin(z * 0.37 - seed * 0.007) * 0.22;
  return 4.42 + broad + detail;
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
