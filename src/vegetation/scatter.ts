import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3
} from "three";
import type {
  BallObstacleDescriptor,
  FrameUpdatable,
  ScatterClass,
  WorldConfig
} from "../types";
import type { TerrainSystem } from "../world/terrain";
import { createRandom, hashSeed } from "../world/random";
import { streamCenterX } from "../world/terrain";
import { standardMaterial } from "../render/materials/materials";
import { createRockSurfaceMaterial } from "../render/materials/surfaceMaterials";
import {
  createBarkTextures
} from "../render/materials/proceduralTextures";
import {
  createCoupledConiferGeometry,
  createConiferCrownGeometry,
  createConiferNeedleMaterial
} from "./conifer";
import {
  createFernFrondGeometry,
  createFernMaterial,
  createGrassMaterial,
  createGrassTuftGeometry
} from "./groundFoliage";
import {
  createHeightWindLayer,
  updateHeightWindLayers,
  type HeightWindLayer
} from "./heightWind";
import {
  createFlexibleWindLayer,
  recordFlexibleWindInstance,
  updateFlexibleWindLayers,
  type FlexibleWindLayer
} from "./flexibleWind";

export interface ScatterResult extends FrameUpdatable {
  readonly group: Group;
  readonly treeColliders: readonly TreeColliderDescriptor[];
  readonly obstacleColliders: readonly BallObstacleDescriptor[];
  readonly instancesByClass: Readonly<Record<ScatterClass, number>>;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
}

export interface TreeColliderDescriptor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly halfHeight: number;
}

interface WindLayer {
  readonly mesh: InstancedMesh;
  readonly positions: Float32Array;
  readonly quaternions: Float32Array;
  readonly scales: Float32Array;
  readonly phases: Float32Array;
  readonly amplitudes: Float32Array;
  readonly heights: Float32Array;
  readonly maxTilt: number;
  readonly maxOffset: number;
  readonly speed: number;
}

const tempObject = new Object3D();
const tempMatrix = new Matrix4();
const tempQuaternion = new Quaternion();
const tempScale = new Vector3();
const tempPosition = new Vector3();
const tempEuler = new Euler(0, 0, 0, "XYZ");
const windDirection = new Vector3(0.84, 0, 0.54).normalize();
const windTiltAxis = new Vector3(windDirection.z, 0, -windDirection.x).normalize();
const windQuaternion = new Quaternion();
const baseQuaternion = new Quaternion();
const animatedQuaternion = new Quaternion();
const surfaceQuaternion = new Quaternion();
const surfaceYawQuaternion = new Quaternion();
const worldUp = new Vector3(0, 1, 0);

const tau = Math.PI * 2;

export function createScatter(config: WorldConfig, terrain: TerrainSystem): ScatterResult {
  const group = new Group();
  group.name = "LAAS procedural scatter";
  const windLayers: WindLayer[] = [];
  const heightWindLayers: HeightWindLayer[] = [];
  const flexibleWindLayers: FlexibleWindLayer[] = [];
  const obstacleColliders: BallObstacleDescriptor[] = [];

  const density =
    (config.preset === "high" ? 1.85 : 1) *
    (config.thermal === "cool" ? 0.62 : 1);
  const treeCount = Math.round(110 * density);
  const grassCount = Math.round(2400 * density);
  const fernCount = Math.round(980 * density);
  const shrubCount = 0;
  const flowerCount = Math.round(400 * density);
  const cobbleCount = Math.round(1350 * density);
  const twigCount = Math.round(420 * density);
  const leafCount = Math.round(1300 * density);
  const rockCount = Math.round(210 * density);
  let triangleEstimate = 0;
  let drawCallEstimate = 0;

  const treeResult = createTrees(
    config,
    terrain,
    treeCount,
    heightWindLayers
  );
  group.add(treeResult.group);
  triangleEstimate += treeResult.triangles;
  drawCallEstimate += treeResult.drawCalls;

  const grassResult = createGrass(
    config,
    terrain,
    grassCount,
    flexibleWindLayers
  );
  group.add(grassResult.mesh);
  triangleEstimate += grassResult.triangles;
  drawCallEstimate += 1;

  const fernResult = createFerns(
    config,
    terrain,
    fernCount,
    flexibleWindLayers
  );
  group.add(fernResult.group);
  triangleEstimate += fernResult.triangles;
  drawCallEstimate += fernResult.drawCalls;

  const shrubResult = createShrubs(config, terrain, Math.max(1, shrubCount));
  shrubResult.mesh.visible = shrubCount > 0;
  group.add(shrubResult.mesh);
  triangleEstimate += shrubCount > 0 ? shrubResult.triangles : 0;
  drawCallEstimate += shrubCount > 0 ? 1 : 0;

  const flowerResult = createFlowers(config, terrain, flowerCount, windLayers);
  group.add(flowerResult.group);
  triangleEstimate += flowerResult.triangles;
  drawCallEstimate += flowerResult.drawCalls;

  const cobbleResult = createCobbleField(config, terrain, cobbleCount);
  group.add(cobbleResult.mesh);
  obstacleColliders.push(...cobbleResult.obstacleColliders);
  triangleEstimate += cobbleResult.triangles;
  drawCallEstimate += 1;

  const twigResult = createTwigField(config, terrain, twigCount);
  group.add(twigResult.mesh);
  triangleEstimate += twigResult.triangles;
  drawCallEstimate += 1;

  const leafResult = createLeafField(config, terrain, leafCount);
  group.add(leafResult.mesh);
  triangleEstimate += leafResult.triangles;
  drawCallEstimate += 1;

  const rockResult = createRockField(config, terrain, rockCount);
  group.add(rockResult.mesh);
  obstacleColliders.push(...rockResult.obstacleColliders);
  triangleEstimate += rockResult.triangles;
  drawCallEstimate += 1;

  let windFrame = 0;
  return {
    group,
    treeColliders: treeResult.treeColliders,
    obstacleColliders,
    instancesByClass: {
      tree: treeCount,
      grass: grassCount,
      fern: fernCount,
      shrub: shrubCount,
      flower: flowerCount,
      cobble: cobbleCount,
      twig: twigCount,
      leaf: leafCount,
      rock: rockCount
    },
    triangleEstimate,
    drawCallEstimate,
    update(_deltaSeconds: number, elapsedSeconds: number): void {
      windFrame += 1;
      if (config.thermal === "cool" && windFrame % 2 !== 0) {
        return;
      }
      updateWindLayers(windLayers, elapsedSeconds);
      if (windFrame % (config.thermal === "cool" ? 4 : 2) === 0) {
        updateFlexibleWindLayers(flexibleWindLayers, elapsedSeconds);
      }
      updateHeightWindLayers(heightWindLayers, elapsedSeconds);
    }
  };
}

function createTrees(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number,
  heightWindLayers: HeightWindLayer[]
): {
  group: Group;
  treeColliders: readonly TreeColliderDescriptor[];
  triangles: number;
  drawCalls: number;
} {
  const group = new Group();
  const trunkGeometry = new CylinderGeometry(0.3, 0.62, 16.2, 10, 8);
  const crownGeometry = createConiferCrownGeometry({
    levels: 14,
    branches: 10,
    crossed: false
  });
  const treeGeometry = createCoupledConiferGeometry(
    trunkGeometry,
    crownGeometry,
    {
      trunkOffsetY: 8.1,
      crownOffsetY: 8.72,
      crownScale: new Vector3(1.22, 1.08, 1.22)
    }
  );
  const rootGeometry = new CylinderGeometry(0.09, 0.18, 3.8, 6, 2);
  const barkTextures = createBarkTextures(config.seed + 803);
  const trunkMaterial = new MeshStandardMaterial({
    color: 0x76583b,
    map: barkTextures.map,
    normalMap: barkTextures.normalMap,
    normalScale: new Vector2(0.58, 0.82),
    roughnessMap: barkTextures.roughnessMap,
    roughness: 0.84,
    metalness: 0,
    emissive: new Color(0x16110b),
    emissiveIntensity: 0.1
  });
  const crownMaterial = createConiferNeedleMaterial();
  const rootMaterial = new MeshStandardMaterial({
    color: 0x58412b,
    map: barkTextures.map,
    normalMap: barkTextures.normalMap,
    normalScale: new Vector2(0.62, 0.88),
    roughnessMap: barkTextures.roughnessMap,
    roughness: 0.88,
    metalness: 0
  });
  const treeMesh = new InstancedMesh(
    treeGeometry,
    [trunkMaterial, crownMaterial],
    count
  );
  treeMesh.name = "wind-coupled scatter conifers";
  const rootMesh = new InstancedMesh(rootGeometry, rootMaterial, count * 3);
  heightWindLayers.push(
    createHeightWindLayer(
      treeGeometry,
      4.05,
      config.seed * 0.009,
      1.06
    )
  );
  const random = createRandom(config.seed + 10);
  const treeColliders: TreeColliderDescriptor[] = [];

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 14, 86, false);
    const species = hashSeed(config.seed + index * 29) % 4;
    const heightScale = 0.72 + random.next() * 0.72 + species * 0.07;
    const radiusScale = 0.72 + random.next() * 0.5;
    const yaw = random.range(0, Math.PI * 2);

    tempPosition.set(position.x, position.y, position.z);
    tempQuaternion.identity();
    tempScale.set(radiusScale, heightScale, radiusScale);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    treeMesh.setMatrixAt(index, tempMatrix);
    treeColliders.push({
      x: position.x,
      y: position.y,
      z: position.z,
      radius: 0.58 * radiusScale,
      halfHeight: 8.25 * heightScale
    });

    for (let rootIndex = 0; rootIndex < 3; rootIndex += 1) {
      const angle = yaw + (rootIndex / 3) * Math.PI * 2 + random.signed() * 0.24;
      const rootId = index * 3 + rootIndex;
      tempPosition.set(
        position.x + Math.cos(angle) * 1.2,
        position.y + 0.25,
        position.z + Math.sin(angle) * 1.2
      );
      tempQuaternion.setFromEuler(
        tempEuler.set(Math.PI / 2 + random.signed() * 0.2, 0, angle + Math.PI / 2, "XYZ")
      );
      tempScale.set(random.range(0.75, 1.35), random.range(0.8, 1.3), random.range(0.65, 1.05));
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      rootMesh.setMatrixAt(rootId, tempMatrix);
      rootMesh.setColorAt(rootId, new Color().setHSL(0.09, 0.22, random.range(0.18, 0.28)));
    }
  }

  treeMesh.castShadow = true;
  treeMesh.receiveShadow = true;
  treeMesh.frustumCulled = false;
  rootMesh.castShadow = true;
  rootMesh.receiveShadow = true;
  group.add(treeMesh, rootMesh);

  return {
    group,
    treeColliders,
    triangles:
      geometryTriangles(treeGeometry) * count +
      geometryTriangles(rootGeometry) * count * 3,
    drawCalls: 3
  };
}

function createGrass(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number,
  windLayers: FlexibleWindLayer[]
): { mesh: InstancedMesh; triangles: number } {
  const geometry = createGrassTuftGeometry();
  const material = createGrassMaterial();
  const mesh = new InstancedMesh(geometry, material, count);
  const wind = createFlexibleWindLayer(
    mesh,
    count,
    1.18,
    0.3,
    3.75,
    "y"
  );
  const random = createRandom(config.seed + 20);

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 5.5, 84, true);
    const sample = terrain.sample(position.x, position.z);
    const height = random.range(0.35, 1.55);
    composeGroundMatrix(
      position,
      sample.normal,
      random.range(0, tau),
      tempScale.set(random.range(0.72, 1.5), height, random.range(0.72, 1.5)),
      0.018
    );
    mesh.setMatrixAt(index, tempMatrix);
    recordFlexibleWindInstance(
      wind,
      index,
      tempMatrix,
      random.range(0, tau) + position.x * 0.12 + position.z * 0.08,
      random.range(0.82, 1.32)
    );
    mesh.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.25, 0.34),
        random.range(0.04, 0.14),
        random.range(0.78, 0.98)
      )
    );
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  windLayers.push(wind);
  return { mesh, triangles: geometryTriangles(geometry) * count };
}

function createFerns(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number,
  windLayers: FlexibleWindLayer[]
): { group: Group; triangles: number; drawCalls: number } {
  const group = new Group();
  const bladeGeometry = createFernFrondGeometry("field");
  const material = createFernMaterial();
  const leafCount = count * 5;
  const mesh = new InstancedMesh(bladeGeometry, material, leafCount);
  const wind = createFlexibleWindLayer(
    mesh,
    leafCount,
    0.64,
    0.24,
    3.1,
    "z"
  );
  const random = createRandom(config.seed + 30);

  for (let index = 0; index < count; index += 1) {
    const base = findLandPosition(random, terrain, 4, 70, true);
    for (let leaf = 0; leaf < 5; leaf += 1) {
      const id = index * 5 + leaf;
      const angle = (leaf / 5) * Math.PI * 2 + random.signed() * 0.2;
      const x = base.x + Math.cos(angle) * 0.14;
      const z = base.z + Math.sin(angle) * 0.14;
      const sample = terrain.sample(x, z);
      tempPosition.set(
        x,
        sample.height,
        z
      );
      const scale = random.range(0.38, 0.84);
      tempScale.set(scale, scale, scale);
      composeGroundMatrix(
        tempPosition,
        sample.normal,
        angle,
        tempScale,
        0.025
      );
      mesh.setMatrixAt(id, tempMatrix);
      recordFlexibleWindInstance(
        wind,
        id,
        tempMatrix,
        random.range(0, tau) + base.x * 0.08 + base.z * 0.11 + leaf,
        random.range(0.8, 1.35)
      );
      mesh.setColorAt(
        id,
        new Color().setHSL(
          random.range(0.26, 0.35),
          random.range(0.04, 0.16),
          random.range(0.76, 0.98)
        )
      );
    }
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  windLayers.push(wind);
  return { group, triangles: geometryTriangles(bladeGeometry) * leafCount, drawCalls: 1 };
}

function createShrubs(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): { mesh: InstancedMesh; triangles: number } {
  const geometry = new SphereGeometry(0.95, 8, 5);
  const material = standardMaterial(0x35653b, {
    roughness: 0.9,
    emissive: new Color(0x1f3f25),
    emissiveIntensity: 0.24
  });
  const mesh = new InstancedMesh(geometry, material, count);
  const random = createRandom(config.seed + 40);

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 6, 78, true);
    tempObject.position.set(position.x, position.y + 0.72, position.z);
    tempObject.rotation.set(random.signed() * 0.08, random.range(0, Math.PI * 2), random.signed() * 0.08);
    tempObject.scale.set(random.range(0.6, 1.6), random.range(0.35, 1.0), random.range(0.6, 1.5));
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    mesh.setColorAt(index, new Color().setHSL(random.range(0.26, 0.38), random.range(0.34, 0.58), random.range(0.18, 0.33)));
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, triangles: geometryTriangles(geometry) * count };
}

function createFlowers(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number,
  windLayers: WindLayer[]
): { group: Group; triangles: number; drawCalls: number } {
  const group = new Group();
  const stemGeometry = new CylinderGeometry(0.012, 0.018, 0.7, 5, 1);
  const petalGeometry = new SphereGeometry(0.095, 6, 4);
  const stemMaterial = standardMaterial(0x3f6f2a, { roughness: 0.86 });
  const petalMaterial = standardMaterial(0xd579a9, {
    roughness: 0.72,
    emissive: new Color(0x5a1f3c),
    emissiveIntensity: 0.18
  });
  const stemMesh = new InstancedMesh(stemGeometry, stemMaterial, count);
  const petalMesh = new InstancedMesh(petalGeometry, petalMaterial, count);
  const stemWind = createWindLayer(stemMesh, count, 0.56, 0.2, 2.2);
  const petalWind = createWindLayer(petalMesh, count, 0.72, 0.34, 2.35);
  const random = createRandom(config.seed + 50);

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 12, 86, true);
    const height = random.range(0.45, 0.95);
    const phase = random.range(0, tau) + position.x * 0.13 + position.z * 0.07;
    tempObject.position.set(position.x, position.y + height * 0.5, position.z);
    tempObject.rotation.set(random.signed() * 0.12, random.range(0, Math.PI * 2), random.signed() * 0.12);
    tempObject.scale.set(1, height, 1);
    tempObject.updateMatrix();
    stemMesh.setMatrixAt(index, tempObject.matrix);
    recordWindInstance(
      stemWind,
      index,
      tempObject.matrix,
      phase,
      random.range(0.76, 1.32),
      Math.min(1.35, height * 1.35)
    );

    tempObject.position.set(position.x, position.y + height + 0.1, position.z);
    tempObject.rotation.set(0, random.range(0, Math.PI * 2), 0);
    tempObject.scale.set(random.range(0.65, 1.25), random.range(0.55, 0.9), random.range(0.65, 1.25));
    tempObject.updateMatrix();
    petalMesh.setMatrixAt(index, tempObject.matrix);
    recordWindInstance(
      petalWind,
      index,
      tempObject.matrix,
      phase + 0.34,
      random.range(0.92, 1.5),
      Math.min(1.55, height * 1.55)
    );
    petalMesh.setColorAt(index, new Color().setHSL(random.range(0.84, 0.96), random.range(0.42, 0.72), random.range(0.5, 0.72)));
  }

  stemMesh.castShadow = true;
  petalMesh.castShadow = true;
  group.add(stemMesh, petalMesh);
  windLayers.push(stemWind, petalWind);
  return {
    group,
    triangles: (geometryTriangles(stemGeometry) + geometryTriangles(petalGeometry)) * count,
    drawCalls: 2
  };
}

function createWindLayer(
  mesh: InstancedMesh,
  count: number,
  maxTilt: number,
  maxOffset: number,
  speed: number
): WindLayer {
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return {
    mesh,
    positions: new Float32Array(count * 3),
    quaternions: new Float32Array(count * 4),
    scales: new Float32Array(count * 3),
    phases: new Float32Array(count),
    amplitudes: new Float32Array(count),
    heights: new Float32Array(count),
    maxTilt,
    maxOffset,
    speed
  };
}

function recordWindInstance(
  layer: WindLayer,
  index: number,
  matrix: Matrix4,
  phase: number,
  amplitude: number,
  height: number
): void {
  matrix.decompose(tempPosition, tempQuaternion, tempScale);
  const positionOffset = index * 3;
  const quaternionOffset = index * 4;
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
  layer.phases[index] = phase;
  layer.amplitudes[index] = amplitude;
  layer.heights[index] = height;
}

function updateWindLayers(layers: readonly WindLayer[], elapsedSeconds: number): void {
  const gust = stormGust(elapsedSeconds);
  for (const layer of layers) {
    updateWindLayer(layer, elapsedSeconds, gust);
  }
}

function updateWindLayer(
  layer: WindLayer,
  elapsedSeconds: number,
  gust: number
): void {
  const flow = elapsedSeconds * layer.speed;
  const count = layer.phases.length;

  for (let index = 0; index < count; index += 1) {
    const positionOffset = index * 3;
    const quaternionOffset = index * 4;
    const phase = layer.phases[index] ?? 0;
    const amplitude = layer.amplitudes[index] ?? 1;
    const height = layer.heights[index] ?? 1;
    const flutter =
      Math.sin(flow + phase) * 0.48 +
      Math.sin(flow * 1.73 + phase * 1.41) * 0.23 +
      Math.sin(flow * 3.1 + phase * 0.67) * 0.09;
    const heightGain = 0.45 + height * 0.82;
    const lean = (gust * 0.64 + flutter * 0.52) * amplitude * heightGain;
    const tilt = layer.maxTilt * lean;
    const offset = layer.maxOffset * (gust * 0.72 + flutter * 0.28) * amplitude * heightGain;

    tempPosition.set(
      (layer.positions[positionOffset] ?? 0) + windDirection.x * offset,
      (layer.positions[positionOffset + 1] ?? 0) - Math.max(0, tilt) * layer.maxOffset * 0.16,
      (layer.positions[positionOffset + 2] ?? 0) + windDirection.z * offset
    );
    baseQuaternion.set(
      layer.quaternions[quaternionOffset] ?? 0,
      layer.quaternions[quaternionOffset + 1] ?? 0,
      layer.quaternions[quaternionOffset + 2] ?? 0,
      layer.quaternions[quaternionOffset + 3] ?? 1
    );
    windQuaternion.setFromAxisAngle(windTiltAxis, tilt);
    animatedQuaternion.copy(windQuaternion).multiply(baseQuaternion);
    tempScale.set(
      layer.scales[positionOffset] ?? 1,
      layer.scales[positionOffset + 1] ?? 1,
      layer.scales[positionOffset + 2] ?? 1
    );
    tempMatrix.compose(tempPosition, animatedQuaternion, tempScale);
    layer.mesh.setMatrixAt(index, tempMatrix);
  }

  layer.mesh.instanceMatrix.needsUpdate = true;
}

function stormGust(elapsedSeconds: number): number {
  const front = Math.sin(elapsedSeconds * 0.34) * 0.5 + 0.5;
  const pulse = Math.sin(elapsedSeconds * 0.91 + Math.sin(elapsedSeconds * 0.21) * 1.6) * 0.5 + 0.5;
  const rolling = Math.sin(elapsedSeconds * 1.7 + 1.1) * 0.5 + 0.5;
  return 0.58 + smoothstep01(front) * 0.36 + smoothstep01(pulse) * 0.28 + rolling * 0.12;
}

function createCobbleField(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): {
  mesh: InstancedMesh;
  obstacleColliders: readonly BallObstacleDescriptor[];
  triangles: number;
} {
  const geometry = new DodecahedronGeometry(0.34, 1);
  const material = createRockSurfaceMaterial(config.seed + 607, 0.48);
  const mesh = new InstancedMesh(geometry, material, count);
  const random = createRandom(config.seed + 60);
  const obstacleColliders: BallObstacleDescriptor[] = [];

  for (let index = 0; index < count; index += 1) {
    const z = random.range(-70, 76);
    const band = random.next() < 0.72 ? random.range(0.35, 2.4) : random.range(2.4, 7.5);
    const x = streamCenterX(config.seed, z) + random.signed() * band;
    const sample = terrain.sample(x, z);
    tempObject.position.set(x, sample.height + 0.1, z);
    tempObject.rotation.set(random.range(0, Math.PI), random.range(0, Math.PI), random.range(0, Math.PI));
    const xScale = random.range(0.45, 2.15);
    const yScale = random.range(0.16, 0.55);
    const zScale = random.range(0.4, 1.55);
    tempObject.scale.set(xScale, yScale, zScale);
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    const radius = 0.34 * Math.max(xScale, zScale) * 0.78;
    if (radius >= 0.42) {
      obstacleColliders.push({
        x,
        y: sample.height + Math.max(0.16, radius * 0.42),
        z,
        radius
      });
    }
    mesh.setColorAt(
      index,
      new Color().setHSL(
        0,
        0,
        random.range(0.74, 0.98)
      )
    );
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    obstacleColliders,
    triangles: geometryTriangles(geometry) * count
  };
}

function createTwigField(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): { mesh: InstancedMesh; triangles: number } {
  const geometry = new CylinderGeometry(0.025, 0.045, 1.2, 5, 1);
  const material = standardMaterial(0x4b3522, { roughness: 0.95 });
  const mesh = new InstancedMesh(geometry, material, count);
  const random = createRandom(config.seed + 70);

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 8, 82, true);
    tempObject.position.set(position.x, position.y + 0.08, position.z);
    tempObject.rotation.set(Math.PI / 2 + random.signed() * 0.22, random.range(0, Math.PI * 2), random.signed() * 0.25);
    tempObject.scale.set(random.range(0.45, 1.7), random.range(0.5, 1.7), random.range(0.45, 1.25));
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, triangles: geometryTriangles(geometry) * count };
}

function createLeafField(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): { mesh: InstancedMesh; triangles: number } {
  const geometry = new BoxGeometry(0.36, 0.012, 0.18);
  const material = standardMaterial(0x7a5a2c, { roughness: 0.98 });
  const mesh = new InstancedMesh(geometry, material, count);
  const random = createRandom(config.seed + 80);

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 3, 86, true);
    tempObject.position.set(position.x, position.y + 0.025, position.z);
    tempObject.rotation.set(random.signed() * 0.05, random.range(0, Math.PI * 2), random.signed() * 0.04);
    tempObject.scale.set(random.range(0.55, 1.5), random.range(0.5, 1.1), random.range(0.55, 1.3));
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    mesh.setColorAt(index, new Color().setHSL(random.range(0.07, 0.14), random.range(0.32, 0.56), random.range(0.21, 0.38)));
  }

  mesh.receiveShadow = true;
  return { mesh, triangles: geometryTriangles(geometry) * count };
}

function createRockField(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): {
  mesh: InstancedMesh;
  obstacleColliders: readonly BallObstacleDescriptor[];
  triangles: number;
} {
  const geometry = new SphereGeometry(1.4, 22, 14);
  distortGeometry(geometry, config.seed + 977, 0.38);
  const material = createRockSurfaceMaterial(config.seed + 983, 0.06);
  const mesh = new InstancedMesh(geometry, material, count);
  const random = createRandom(config.seed + 90);
  const obstacleColliders: BallObstacleDescriptor[] = [];

  for (let index = 0; index < count; index += 1) {
    const position = findLandPosition(random, terrain, 12, 92, false);
    tempObject.position.set(position.x, position.y + 0.46, position.z);
    tempObject.rotation.set(random.range(0, Math.PI), random.range(0, Math.PI), random.range(0, Math.PI));
    const xScale = random.range(0.35, 1.85);
    const yScale = random.range(0.28, 1.25);
    const zScale = random.range(0.35, 1.65);
    tempObject.scale.set(xScale, yScale, zScale);
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    const radius = 1.4 * Math.max(xScale, zScale) * 0.68;
    if (radius >= 0.72) {
      obstacleColliders.push({
        x: position.x,
        y: position.y + Math.max(0.42, radius * 0.58),
        z: position.z,
        radius
      });
    }
    mesh.setColorAt(
      index,
      new Color().setHSL(
        0,
        0,
        random.range(0.76, 0.99)
      )
    );
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    obstacleColliders,
    triangles: geometryTriangles(geometry) * count
  };
}

function composeGroundMatrix(
  position: Vector3,
  normal: Vector3,
  yaw: number,
  scale: Vector3,
  lift: number
): void {
  tempPosition.copy(position).addScaledVector(normal, lift);
  surfaceQuaternion.setFromUnitVectors(worldUp, normal);
  surfaceYawQuaternion.setFromAxisAngle(normal, yaw);
  tempQuaternion.copy(surfaceYawQuaternion).multiply(surfaceQuaternion);
  tempMatrix.compose(tempPosition, tempQuaternion, scale);
}

function findLandPosition(
  random: ReturnType<typeof createRandom>,
  terrain: TerrainSystem,
  minStreamDistance: number,
  radius: number,
  preferMoist: boolean
): Vector3 {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = random.range(0, Math.PI * 2);
    const distance = Math.sqrt(random.next()) * radius;
    const x = Math.cos(angle) * distance + random.signed() * 6;
    const z = Math.sin(angle) * distance + random.signed() * 8;
    const sample = terrain.sample(x, z);
    const streamOk = sample.streamDistance >= minStreamDistance;
    const slopeOk = sample.slope < 0.74;
    const moistureOk = preferMoist ? sample.moisture > 0.18 : true;

    if (streamOk && slopeOk && moistureOk) {
      return new Vector3(x, sample.height, z);
    }
  }

  const fallbackZ = random.range(-radius, radius);
  const fallbackX = streamCenterX(0, fallbackZ) + minStreamDistance + random.range(2, 8);
  const sample = terrain.sample(fallbackX, fallbackZ);
  return new Vector3(fallbackX, sample.height, fallbackZ);
}

function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return index.count / 3;
  }

  const position = geometry.getAttribute("position");
  return position.count / 3;
}

function distortGeometry(geometry: BufferGeometry, seed: number, amount: number): void {
  const position = geometry.getAttribute("position");
  const phase = (seed % 997) * 0.013;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const wave =
      Math.sin(x * 1.91 + phase) * 0.44 +
      Math.sin(y * 2.73 - phase * 1.7) * 0.31 +
      Math.sin(z * 2.17 + phase * 0.8) * 0.25;
    const scale = 1 + wave * amount;
    position.setXYZ(index, x * scale, y * scale, z * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
