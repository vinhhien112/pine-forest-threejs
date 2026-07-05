import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  SphereGeometry
} from "three";
import type { BallObstacleDescriptor, WorldConfig } from "../../types";
import type { TerrainSystem } from "../../world/terrain";
import { createRandom } from "../../world/random";
import { streamCenterX } from "../../world/terrain";
import { standardMaterial } from "../materials/materials";
import {
  createMossSurfaceMaterial,
  createRockSurfaceMaterial
} from "../materials/surfaceMaterials";

export interface HeroDressing {
  readonly group: Group;
  readonly obstacleColliders: readonly BallObstacleDescriptor[];
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  readonly cobbleCount: number;
  readonly rockCount: number;
  readonly twigCount: number;
  readonly leafCount: number;
}

const tempObject = new Object3D();

export function createHeroDressing(
  config: WorldConfig,
  terrain: TerrainSystem
): HeroDressing {
  const group = new Group();
  group.name = "LAAS near-field ecosystem dressing";

  const density =
    (config.preset === "high" ? 1.55 : 1) *
    (config.thermal === "cool" ? 0.74 : 1);
  const cobbleCount = Math.round(2_700 * density);
  const rockCount = Math.round(92 * density);
  const mossCount = 0;
  const logCount = Math.round(46 * density);
  const litter = createForestFloorLitter(config, terrain, density);

  const cobbles = createHeroCobbles(config, terrain, cobbleCount);
  const boulders = createMossyBoulders(config, terrain, rockCount);
  const moss = createMossMats(config, terrain, Math.max(1, mossCount));
  moss.mesh.visible = mossCount > 0;
  const logs = createFallenLogs(config, terrain, logCount);
  group.add(cobbles.group, boulders.rocks, moss.mesh, logs.mesh, litter.group);

  return {
    group,
    obstacleColliders: [
      ...cobbles.obstacleColliders,
      ...boulders.obstacleColliders
    ],
    triangleEstimate:
      cobbles.triangles +
      boulders.triangles +
      (mossCount > 0 ? moss.triangles : 0) +
      logs.triangles +
      litter.triangles,
    drawCallEstimate: (mossCount > 0 ? 6 : 5) + litter.drawCalls,
    cobbleCount,
    rockCount: rockCount + litter.clumpCount,
    twigCount: logCount + litter.twigCount,
    leafCount: litter.leafCount
  };
}

function createHeroCobbles(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): {
  group: Group;
  obstacleColliders: readonly BallObstacleDescriptor[];
  triangles: number;
} {
  const group = new Group();
  group.name = "varied dense stream cobbles";
  const geometries: readonly BufferGeometry[] = [
    new SphereGeometry(0.28, 14, 9),
    new SphereGeometry(0.3, 16, 10),
    new SphereGeometry(0.27, 11, 8)
  ];
  geometries.forEach((geometry, index) => {
    distortGeometry(
      geometry,
      config.seed + 2_011 + index * 137,
      0.24 + index * 0.09
    );
  });
  const material = createRockSurfaceMaterial(config.seed + 1_903, 0.38);
  const obstacleColliders: BallObstacleDescriptor[] = [];
  const meshes = geometries.map((geometry, variant) => {
    const variantCount = Math.floor((count + 2 - variant) / 3);
    const mesh = new InstancedMesh(geometry, material, variantCount);
    mesh.name = `dense rounded stream cobbles variant ${variant + 1}`;
    return mesh;
  });
  const random = createRandom(config.seed + 1_900);

  for (let index = 0; index < count; index += 1) {
    const variant = index % meshes.length;
    const localIndex = Math.floor(index / meshes.length);
    const mesh = meshes[variant];
    if (!mesh) {
      continue;
    }
    const z = random.range(-76, 84);
    const nearCameraBias = random.next() < 0.68;
    const spread = nearCameraBias ? 5.8 : 4.2;
    const inChannel = random.next() < 0.27;
    const side = random.next() < 0.5 ? -1 : 1;
    const lateral = inChannel
      ? random.signed() * 1.72
      : side * random.range(2.15, spread);
    const x = streamCenterX(config.seed, z) + lateral;
    const sample = terrain.sample(x, z);
    const size = inChannel
      ? random.range(0.42, 1.28)
      : random.next() < 0.88
        ? random.range(0.58, 1.55)
        : random.range(1.6, 2.45);

    tempObject.position.set(
      x,
      sample.height + (inChannel ? 0.19 : 0.34) + size * 0.035,
      z
    );
    tempObject.rotation.set(
      random.range(-0.42, 0.42),
      random.range(0, Math.PI * 2),
      random.range(-0.42, 0.42)
    );
    tempObject.scale.set(
      size * random.range(0.72, 1.28),
      size * random.range(inChannel ? 0.18 : 0.25, inChannel ? 0.4 : 0.52),
      size * random.range(0.68, 1.35)
    );
    tempObject.updateMatrix();
    mesh.setMatrixAt(localIndex, tempObject.matrix);
    const radius = 0.3 * Math.max(tempObject.scale.x, tempObject.scale.z) * 0.92;
    if (radius >= 0.36) {
      obstacleColliders.push({
        x,
        y: sample.height + Math.max(0.14, radius * 0.42),
        z,
        radius
      });
    }
    mesh.setColorAt(
      localIndex,
      new Color().setHSL(
        random.range(0.08, 0.18),
        random.range(0.015, 0.055),
        random.range(inChannel ? 0.72 : 0.78, inChannel ? 0.92 : 0.98)
      )
    );
  }

  meshes.forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return {
    group,
    obstacleColliders,
    triangles: geometries.reduce((total, geometry, variant) => {
      const variantCount = Math.floor((count + 2 - variant) / 3);
      return total + geometryTriangleCount(geometry) * variantCount;
    }, 0)
  };
}

function createMossyBoulders(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): {
  rocks: InstancedMesh;
  obstacleColliders: readonly BallObstacleDescriptor[];
  triangles: number;
} {
  const rockGeometry = new SphereGeometry(1.15, 28, 18);
  distortGeometry(rockGeometry, config.seed + 2_123, 0.46);
  const rockMaterial = createRockSurfaceMaterial(config.seed + 2_113, 0.12);
  const rocks = new InstancedMesh(rockGeometry, rockMaterial, count);
  rocks.name = "hero stream boulders";
  const random = createRandom(config.seed + 2_100);
  const obstacleColliders: BallObstacleDescriptor[] = [];

  for (let index = 0; index < count; index += 1) {
    const z = random.range(-66, 74);
    const side = random.next() < 0.5 ? -1 : 1;
    const bankDistance = random.range(4.3, 12.5);
    const x = streamCenterX(config.seed, z) + side * bankDistance;
    const sample = terrain.sample(x, z);
    const scale = random.range(0.38, 1.38);
    const yaw = random.range(0, Math.PI * 2);
    const xScale = scale * random.range(0.72, 1.45);
    const yScale = scale * random.range(0.48, 1.08);
    const zScale = scale * random.range(0.72, 1.5);

    tempObject.position.set(x, sample.height + yScale * 0.56, z);
    tempObject.rotation.set(random.signed() * 0.24, yaw, random.signed() * 0.2);
    tempObject.scale.set(xScale, yScale, zScale);
    tempObject.updateMatrix();
    rocks.setMatrixAt(index, tempObject.matrix);
    const radius = 1.15 * Math.max(xScale, zScale) * 0.82;
    obstacleColliders.push({
      x,
      y: sample.height + Math.max(0.36, radius * 0.55),
      z,
      radius
    });
    rocks.setColorAt(
      index,
      new Color().setHSL(
        0,
        0,
        random.range(0.76, 0.98)
      )
    );
  }

  rocks.castShadow = true;
  rocks.receiveShadow = true;
  return {
    rocks,
    obstacleColliders,
    triangles: geometryTriangleCount(rockGeometry) * count
  };
}

function createMossMats(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): { mesh: InstancedMesh; triangles: number } {
  const geometry = new IcosahedronGeometry(0.82, 1);
  const material = createMossSurfaceMaterial(config.seed + 2_303);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = "bank moss mats";
  const random = createRandom(config.seed + 2_300);

  for (let index = 0; index < count; index += 1) {
    const z = random.range(-78, 82);
    const side = random.next() < 0.5 ? -1 : 1;
    const x = streamCenterX(config.seed, z) + side * random.range(5.8, 19);
    const sample = terrain.sample(x, z);
    const scale = random.range(0.45, 2.35);

    tempObject.position.set(x, sample.height + 0.12, z);
    tempObject.rotation.set(
      random.signed() * 0.08,
      random.range(0, Math.PI * 2),
      random.signed() * 0.08
    );
    tempObject.scale.set(
      scale * random.range(0.7, 1.7),
      scale * random.range(0.035, 0.11),
      scale * random.range(0.7, 1.8)
    );
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    mesh.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.24, 0.38),
        random.range(0.12, 0.3),
        random.range(0.72, 0.96)
      )
    );
  }

  mesh.receiveShadow = true;
  return {
    mesh,
    triangles: geometryTriangleCount(geometry) * count
  };
}

function createForestFloorLitter(
  config: WorldConfig,
  terrain: TerrainSystem,
  density: number
): {
  group: Group;
  triangles: number;
  drawCalls: number;
  twigCount: number;
  leafCount: number;
  clumpCount: number;
} {
  const group = new Group();
  group.name = "thin pine needle and leaf litter over forest floor";
  const needleCount = Math.round(1_850 * density);
  const leafCount = Math.round(820 * density);
  const clumpCount = Math.round(1_250 * density);
  const needleGeometry = new CylinderGeometry(0.008, 0.011, 0.82, 4, 1);
  const leafGeometry = new BoxGeometry(0.32, 0.012, 0.105);
  const clumpGeometry = new DodecahedronGeometry(0.11, 0);
  const needleMaterial = standardMaterial(0x5c4220, {
    roughness: 0.99,
    vertexColors: true
  });
  const leafMaterial = standardMaterial(0x7a5529, {
    roughness: 0.99,
    vertexColors: true
  });
  const clumpMaterial = standardMaterial(0x42382a, {
    roughness: 1,
    vertexColors: true
  });
  const needles = new InstancedMesh(needleGeometry, needleMaterial, needleCount);
  const leaves = new InstancedMesh(leafGeometry, leafMaterial, leafCount);
  const clumps = new InstancedMesh(clumpGeometry, clumpMaterial, clumpCount);
  const random = createRandom(config.seed + 2_620);

  for (let index = 0; index < needleCount; index += 1) {
    const position = findLitterPosition(random, terrain, config.seed);
    const yaw = random.range(0, Math.PI * 2);
    tempObject.position.set(
      position.x,
      position.y + 0.038 + random.next() * 0.014,
      position.z
    );
    tempObject.rotation.set(
      Math.PI / 2 + random.signed() * 0.09,
      yaw,
      random.signed() * 0.11
    );
    tempObject.scale.set(
      random.range(0.55, 1.7),
      random.range(0.5, 1.65),
      random.range(0.52, 1.12)
    );
    tempObject.updateMatrix();
    needles.setMatrixAt(index, tempObject.matrix);
    needles.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.075, 0.13),
        random.range(0.22, 0.42),
        random.range(0.17, 0.34)
      )
    );
  }

  for (let index = 0; index < leafCount; index += 1) {
    const position = findLitterPosition(random, terrain, config.seed);
    tempObject.position.set(
      position.x,
      position.y + 0.03 + random.next() * 0.012,
      position.z
    );
    tempObject.rotation.set(
      random.signed() * 0.045,
      random.range(0, Math.PI * 2),
      random.signed() * 0.045
    );
    tempObject.scale.set(
      random.range(0.45, 1.35),
      random.range(0.42, 1.0),
      random.range(0.38, 1.18)
    );
    tempObject.updateMatrix();
    leaves.setMatrixAt(index, tempObject.matrix);
    leaves.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.055, 0.13),
        random.range(0.28, 0.55),
        random.range(0.18, 0.38)
      )
    );
  }

  for (let index = 0; index < clumpCount; index += 1) {
    const position = findLitterPosition(random, terrain, config.seed);
    tempObject.position.set(
      position.x,
      position.y + 0.025 + random.next() * 0.035,
      position.z
    );
    tempObject.rotation.set(
      random.range(0, Math.PI),
      random.range(0, Math.PI * 2),
      random.range(0, Math.PI)
    );
    const size = random.range(0.36, 1.24);
    tempObject.scale.set(
      size * random.range(0.65, 1.4),
      size * random.range(0.18, 0.52),
      size * random.range(0.65, 1.45)
    );
    tempObject.updateMatrix();
    clumps.setMatrixAt(index, tempObject.matrix);
    clumps.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.07, 0.14),
        random.range(0.08, 0.26),
        random.range(0.13, 0.32)
      )
    );
  }

  needles.receiveShadow = true;
  leaves.receiveShadow = true;
  clumps.receiveShadow = true;
  clumps.castShadow = true;
  group.add(needles, leaves, clumps);

  return {
    group,
    triangles:
      geometryTriangleCount(needleGeometry) * needleCount +
      geometryTriangleCount(leafGeometry) * leafCount +
      geometryTriangleCount(clumpGeometry) * clumpCount,
    drawCalls: 3,
    twigCount: needleCount,
    leafCount,
    clumpCount
  };
}

function findLitterPosition(
  random: ReturnType<typeof createRandom>,
  terrain: TerrainSystem,
  seed: number
): { x: number; y: number; z: number } {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const nearCamera = random.next() < 0.78;
    const z = nearCamera
      ? random.range(-70, 18)
      : random.range(-76, 58);
    const center = streamCenterX(seed, z);
    const side = random.next() < 0.5 ? -1 : 1;
    const distance = nearCamera
      ? random.range(5.6, 21)
      : random.range(18, 44);
    const x =
      center +
      side * distance +
      Math.sin(z * 0.19 + seed * 0.007 + attempt) * random.range(0.2, 2.6);
    const sample = terrain.sample(x, z);

    if (sample.streamDistance > 5.8 && sample.slope < 0.68) {
      return { x, y: sample.height, z };
    }
  }

  const z = random.range(-62, 42);
  const x = streamCenterX(seed, z) + random.range(8, 18);
  const sample = terrain.sample(x, z);
  return { x, y: sample.height, z };
}

function createFallenLogs(
  config: WorldConfig,
  terrain: TerrainSystem,
  count: number
): { mesh: InstancedMesh; triangles: number } {
  const geometry = new CylinderGeometry(0.24, 0.42, 5.5, 10, 4);
  const material = standardMaterial(0x3b2f22, {
    roughness: 0.98,
    emissive: new Color(0x130e09),
    emissiveIntensity: 0.16
  });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = "fallen ravine logs";
  const random = createRandom(config.seed + 2_500);

  for (let index = 0; index < count; index += 1) {
    const z = random.range(-68, 76);
    const side = random.next() < 0.5 ? -1 : 1;
    const x = streamCenterX(config.seed, z) + side * random.range(7.5, 28);
    const sample = terrain.sample(x, z);
    const lengthScale = random.range(0.55, 1.85);

    tempObject.position.set(x, sample.height + 0.34, z);
    tempObject.rotation.set(
      Math.PI / 2 + random.signed() * 0.17,
      random.range(0, Math.PI * 2),
      random.signed() * 0.18
    );
    tempObject.scale.set(
      random.range(0.7, 1.5),
      lengthScale,
      random.range(0.7, 1.5)
    );
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    mesh.setColorAt(
      index,
      new Color().setHSL(
        random.range(0.065, 0.105),
        random.range(0.24, 0.42),
        random.range(0.12, 0.26)
      )
    );
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    triangles: geometryTriangleCount(geometry) * count
  };
}

function geometryTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return index.count / 3;
  }

  return geometry.getAttribute("position").count / 3;
}

function distortGeometry(geometry: BufferGeometry, seed: number, amount: number): void {
  const position = geometry.getAttribute("position");
  const phase = (seed % 991) * 0.017;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const wave =
      Math.sin(x * 2.17 + phase) * 0.43 +
      Math.sin(y * 3.11 - phase) * 0.34 +
      Math.sin(z * 2.63 + phase * 1.3) * 0.23;
    const scale = 1 + wave * amount;
    position.setXYZ(index, x * scale, y * scale, z * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}
