import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Vector2,
  Vector3
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {
  CinematicCameraCue,
  FrameUpdatable,
  WorldConfig
} from "../../types";
import type { TerrainSystem } from "../../world/terrain";
import { createRandom } from "../../world/random";
import { streamCenterX } from "../../world/terrain";
import {
  createBarkTextures
} from "../materials/proceduralTextures";
import {
  createCoupledConiferGeometry,
  createConiferCrownGeometry,
  createConiferNeedleMaterial
} from "../../vegetation/conifer";
import {
  createFernFrondGeometry,
  createFernMaterial
} from "../../vegetation/groundFoliage";
import {
  createHeightWindLayer,
  updateHeightWindLayers,
  type HeightWindLayer
} from "../../vegetation/heightWind";
import {
  createFlexibleWindLayer,
  recordFlexibleWindInstance,
  updateFlexibleWindLayers,
  type FlexibleWindLayer
} from "../../vegetation/flexibleWind";

export interface QualityResetDressing extends FrameUpdatable {
  readonly group: Group;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  setPlayerBallPosition(position: Vector3): void;
  getCinematicCameraCue(): CinematicCameraCue | undefined;
}

interface HeroTreeBase {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

interface BridgeLogStrike extends FrameUpdatable {
  readonly group: Group;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  setPlayerBallPosition(position: Vector3): void;
  getCinematicCameraCue(): CinematicCameraCue | undefined;
}

const tempObject = new Object3D();
const up = new Vector3(0, 1, 0);
const surfaceQuaternion = new Quaternion();
const surfaceYawQuaternion = new Quaternion();

export function createQualityResetDressing(
  config: WorldConfig,
  terrain: TerrainSystem
): QualityResetDressing {
  const group = new Group();
  group.name = "LAAS procedural quality reset hero composition";
  const heightWindLayers: HeightWindLayer[] = [];
  const flexibleWindLayers: FlexibleWindLayer[] = [];

  const mountains = createMountainBackdrop(config);
  const clouds = createCloudBank(config);
  const conifers = createMidgroundConifers(
    config,
    terrain,
    heightWindLayers
  );
  const trees = createHeroTrees(config, terrain, heightWindLayers);
  const ferns = createHeroFerns(config, terrain, flexibleWindLayers);
  const bridgeLog = createHeroFallenLog(config, terrain);

  group.add(
    mountains.mesh,
    clouds.points,
    conifers.group,
    trees.group,
    ferns.mesh,
    bridgeLog.group
  );

  let flexibleWindFrame = 0;
  return {
    group,
    triangleEstimate:
      mountains.triangles +
      conifers.triangles +
      trees.triangles +
      ferns.triangles +
      bridgeLog.triangleEstimate,
    drawCallEstimate:
      1 +
      1 +
      conifers.drawCalls +
      trees.drawCalls +
      1 +
      bridgeLog.drawCallEstimate,
    setPlayerBallPosition(position: Vector3): void {
      bridgeLog.setPlayerBallPosition(position);
    },
    getCinematicCameraCue(): CinematicCameraCue | undefined {
      return bridgeLog.getCinematicCameraCue();
    },
    update(_deltaSeconds: number, elapsedSeconds: number): void {
      flexibleWindFrame += 1;
      updateHeightWindLayers(heightWindLayers, elapsedSeconds);
      if (flexibleWindFrame % 2 === 0) {
        updateFlexibleWindLayers(flexibleWindLayers, elapsedSeconds);
      }
      bridgeLog.update(_deltaSeconds, elapsedSeconds);
    }
  };
}

function createMountainBackdrop(config: WorldConfig): {
  mesh: Mesh;
  triangles: number;
} {
  const xSegments = 160;
  const rows = 18;
  const width = 205;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const shadowRock = new Color(0x1b2930);
  const litRock = new Color(0x3d5058);
  const snow = new Color(0x91a4ad);
  const color = new Color();
  const phase = config.seed * 0.0017;

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const rowT = rowIndex / (rows - 1);
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const x = (xIndex / xSegments - 0.5) * width;
      const ridge = mountainRidge(x, phase);
      const serration =
        Math.abs(Math.sin(x * 0.19 + phase * 3.1)) * 3 +
        Math.abs(Math.sin(x * 0.47 - phase)) * 1.25;
      const topY = 29 + ridge * 0.86 + serration;
      const bottomY = 7 + Math.sin(x * 0.045 + phase) * 4;
      const y = bottomY + (topY - bottomY) * rowT;
      const z =
        154 -
        rowT * 7 +
        Math.sin(x * 0.055 + rowT * 3.2 + phase) * 4.5;
      vertices.push(x, y, z);
      if (rowT > 0.91) {
        color.lerpColors(litRock, snow, smoothstep01((rowT - 0.91) / 0.09));
      } else {
        color.lerpColors(shadowRock, litRock, rowT / 0.91);
      }
      color.multiplyScalar(0.68 + Math.sin(x * 0.14 + rowT * 4.1) * 0.18);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = xSegments + 1;
  for (let rowIndex = 0; rowIndex < rows - 1; rowIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = rowIndex * row + xIndex;
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

  const material = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    emissive: new Color(0x11191d),
    emissiveIntensity: 0.03,
    flatShading: true,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "serrated procedural alpine backdrop";
  mesh.receiveShadow = true;
  return { mesh, triangles: indices.length / 3 };
}

function createCloudBank(config: WorldConfig): {
  points: Points<BufferGeometry, PointsMaterial>;
} {
  const random = createRandom(config.seed + 7_020);
  const positions: number[] = [];
  const cloudBands = 8;

  for (let band = 0; band < cloudBands; band += 1) {
    const bandX = random.range(-72, 72);
    const bandY = random.range(28, 51);
    const bandZ = random.range(104, 174);
    for (let particle = 0; particle < 16; particle += 1) {
      positions.push(
        bandX + random.signed() * 23,
        bandY + random.signed() * 5.5,
        bandZ + random.signed() * 20
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      new Float32Array((positions.length / 3) * 2).fill(0.5),
      2
    )
  );
  geometry.computeBoundingSphere();
  const material = new PointsMaterial({
    color: 0xe9eff0,
    map: createSoftCloudTexture(),
    size: 14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.26,
    alphaTest: 0.01,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const points = new Points(geometry, material);
  points.name = "soft cloud bank among mountain peaks";
  points.frustumCulled = false;
  points.renderOrder = -1;
  return { points };
}

function createMidgroundConifers(
  config: WorldConfig,
  terrain: TerrainSystem,
  heightWindLayers: HeightWindLayer[]
): {
  group: Group;
  triangles: number;
  drawCalls: number;
} {
  const group = new Group();
  group.name = "slender midground conifer forest";
  const count =
    (config.preset === "high" ? 105 : 64) *
    (config.thermal === "cool" ? 0.66 : 1);
  const trunkGeometry = new CylinderGeometry(0.13, 0.28, 13.4, 10, 6);
  const crownGeometry = createConiferCrownGeometry({
    levels: 12,
    branches: 10,
    crossed: false
  });
  const treeGeometry = createCoupledConiferGeometry(
    trunkGeometry,
    crownGeometry,
    {
      trunkOffsetY: 6.7,
      crownOffsetY: 7.65,
      crownScale: new Vector3(1.43, 1.14, 1.43)
    }
  );
  heightWindLayers.push(
    createHeightWindLayer(
      treeGeometry,
      3.55,
      config.seed * 0.011 + 0.8,
      1.12
    )
  );
  const bark = createBarkTextures(config.seed + 7_100);
  const trunkMaterial = new MeshStandardMaterial({
    color: 0x62442d,
    map: bark.map,
    normalMap: bark.normalMap,
    normalScale: new Vector2(0.55, 0.8),
    roughnessMap: bark.roughnessMap,
    roughness: 0.86,
    metalness: 0
  });
  const crownMaterial = createConiferNeedleMaterial();
  const instanceCount = Math.round(count);
  const trees = new InstancedMesh(
    treeGeometry,
    [trunkMaterial, crownMaterial],
    instanceCount
  );
  trees.name = "wind-coupled midground conifers";
  const random = createRandom(config.seed + 7_120);

  for (let index = 0; index < instanceCount; index += 1) {
    const z = random.range(32, 104);
    const side = random.next() < 0.5 ? -1 : 1;
    const center = streamCenterX(config.seed, z);
    const x = center + side * random.range(8.5, 48);
    const sample = terrain.sample(x, z);
    const height = random.range(0.72, 1.65);
    const radius = random.range(0.62, 1.18);
    tempObject.position.set(x, sample.height, z);
    tempObject.quaternion.identity();
    tempObject.scale.set(radius, height, radius);
    tempObject.updateMatrix();
    trees.setMatrixAt(index, tempObject.matrix);
  }

  trees.castShadow = true;
  trees.receiveShadow = true;
  trees.frustumCulled = false;
  group.add(trees);
  return {
    group,
    triangles: geometryTriangles(treeGeometry) * instanceCount,
    drawCalls: 2
  };
}

function createHeroTrees(
  config: WorldConfig,
  terrain: TerrainSystem,
  heightWindLayers: HeightWindLayer[]
): {
  group: Group;
  triangles: number;
  drawCalls: number;
} {
  const group = new Group();
  group.name = "hero bark trunks with exposed root systems";
  const trunkGeometry = new CylinderGeometry(1.15, 1.82, 30, 24, 12);
  distortTrunkGeometry(trunkGeometry, config.seed + 7_500);
  const crownGeometry = createConiferCrownGeometry({
    levels: 19,
    branches: 13,
    crossed: true
  });
  const treeGeometry = createCoupledConiferGeometry(
    trunkGeometry,
    crownGeometry,
    {
      trunkOffsetY: 15,
      crownOffsetY: 20.85,
      crownScale: new Vector3(1.74, 1.76, 1.74)
    }
  );
  heightWindLayers.push(
    createHeightWindLayer(
      treeGeometry,
      5.35,
      config.seed * 0.013 + 1.4,
      0.96
    )
  );
  const bark = createBarkTextures(config.seed + 7_500);
  const material = new MeshStandardMaterial({
    color: 0x5f3c24,
    map: bark.map,
    normalMap: bark.normalMap,
    normalScale: new Vector2(0.78, 1.15),
    roughnessMap: bark.roughnessMap,
    roughness: 0.82,
    metalness: 0,
    emissive: new Color(0x100904),
    emissiveIntensity: 0.08
  });
  const definitions = [
    { z: 3, side: 1, distance: 22, radius: 1.05, height: 1.08 }
  ] as const;
  const trees = new InstancedMesh(
    treeGeometry,
    [material, createConiferNeedleMaterial()],
    definitions.length
  );
  trees.name = "wind-coupled hero conifers";
  const bases: HeroTreeBase[] = [];

  definitions.forEach((definition, index) => {
    const center = streamCenterX(config.seed, definition.z);
    const x = center + definition.side * definition.distance;
    const sample = terrain.sample(x, definition.z);
    tempObject.position.set(x, sample.height, definition.z);
    tempObject.quaternion.identity();
    tempObject.scale.set(
      definition.radius,
      definition.height,
      definition.radius
    );
    tempObject.updateMatrix();
    trees.setMatrixAt(index, tempObject.matrix);
    bases.push({
      x,
      y: sample.height + 0.08,
      z: definition.z,
      radius: definition.radius * 1.82
    });
  });

  trees.castShadow = true;
  trees.receiveShadow = true;
  trees.frustumCulled = false;
  group.add(trees);

  const roots = createMergedRoots(config, terrain, bases);
  const rootMesh = new Mesh(roots.geometry, material);
  rootMesh.name = "merged tapering hero roots";
  rootMesh.castShadow = true;
  rootMesh.receiveShadow = true;
  group.add(rootMesh);

  return {
    group,
    triangles:
      geometryTriangles(treeGeometry) * definitions.length +
      roots.triangles,
    drawCalls: 3
  };
}

function createMergedRoots(
  config: WorldConfig,
  terrain: TerrainSystem,
  bases: readonly HeroTreeBase[]
): { geometry: BufferGeometry; triangles: number } {
  const random = createRandom(config.seed + 7_580);
  const segments: BufferGeometry[] = [];

  bases.forEach((base, treeIndex) => {
    const rootCount = treeIndex === 0 ? 11 : 8;
    for (let root = 0; root < rootCount; root += 1) {
      const angle =
        (root / rootCount) * Math.PI * 2 +
        random.signed() * 0.22 +
        (treeIndex === 0 ? Math.PI * 0.12 : 0);
      const rootLength = random.range(4.2, treeIndex === 0 ? 10.5 : 7.4);
      const points = 5;
      let previous = new Vector3(base.x, base.y + base.radius * 0.48, base.z);

      for (let point = 1; point < points; point += 1) {
        const t = point / (points - 1);
        const distance = rootLength * t;
        const x =
          base.x +
          Math.cos(angle) * distance +
          Math.sin(t * Math.PI * 2 + root) * 0.28;
        const z =
          base.z +
          Math.sin(angle) * distance +
          Math.cos(t * Math.PI * 1.7 + root) * 0.24;
        const ground = terrain.sample(x, z).height;
        const y = Math.max(
          ground + 0.16,
          base.y + base.radius * (0.48 * (1 - t)) + Math.sin(t * Math.PI) * 0.3
        );
        const next = new Vector3(x, y, z);
        const radiusStart =
          base.radius * 0.34 * (1 - (point - 1) / points) + 0.06;
        const radiusEnd = base.radius * 0.3 * (1 - point / points) + 0.035;
        segments.push(createTaperedSegment(previous, next, radiusStart, radiusEnd));
        previous = next;
      }
    }
  });

  const geometry = mergeGeometries(segments, false);
  if (!geometry) {
    throw new Error("Unable to merge generated hero root geometry.");
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const triangles = geometryTriangles(geometry);
  segments.forEach((segment) => segment.dispose());
  return { geometry, triangles };
}

function createHeroFerns(
  config: WorldConfig,
  terrain: TerrainSystem,
  windLayers: FlexibleWindLayer[]
): { mesh: InstancedMesh; triangles: number } {
  const frondGeometry = createFernFrondGeometry("hero");
  const material = createFernMaterial();
  const plantCount = Math.round(
    (config.preset === "high" ? 146 : 110) *
      (config.thermal === "cool" ? 0.72 : 1)
  );
  const frondsPerPlant = 7;
  const count = plantCount * frondsPerPlant;
  const mesh = new InstancedMesh(frondGeometry, material, count);
  mesh.name = "hero fern fronds with modeled leaflets";
  const wind = createFlexibleWindLayer(
    mesh,
    count,
    0.72,
    0.26,
    3.25,
    "z"
  );
  const random = createRandom(config.seed + 7_700);

  for (let plant = 0; plant < plantCount; plant += 1) {
    const isHeroPlant = plant < 32;
    const z = isHeroPlant
      ? -48 + Math.floor(plant / 4) * 4.1
      : random.range(-42, 44);
    const side = isHeroPlant
      ? plant % 2 === 0 ? -1 : 1
      : random.next() < 0.53 ? -1 : 1;
    const center = streamCenterX(config.seed, z);
    const distance = isHeroPlant
      ? random.range(3.9, 8.6)
      : random.range(6.5, z < -18 ? 18 : 23);
    const x = center + side * distance;
    const plantScale = isHeroPlant
      ? random.range(1.18, 1.72)
      : random.range(0.48, z < -20 ? 1.06 : 0.94);
    const baseYaw = random.range(0, Math.PI * 2);

    for (let frond = 0; frond < frondsPerPlant; frond += 1) {
      const id = plant * frondsPerPlant + frond;
      const angle = baseYaw + (frond / frondsPerPlant) * Math.PI * 2;
      const scale = plantScale * random.range(0.78, 1.18);
      const frondX = x + Math.cos(angle) * 0.16;
      const frondZ = z + Math.sin(angle) * 0.16;
      const frondSample = terrain.sample(frondX, frondZ);
      tempObject.position.set(
        frondX,
        frondSample.height,
        frondZ
      );
      tempObject.position.addScaledVector(frondSample.normal, 0.035);
      surfaceQuaternion.setFromUnitVectors(up, frondSample.normal);
      surfaceYawQuaternion.setFromAxisAngle(frondSample.normal, angle);
      tempObject.quaternion
        .copy(surfaceYawQuaternion)
        .multiply(surfaceQuaternion);
      tempObject.scale.set(scale, scale, scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(id, tempObject.matrix);
      recordFlexibleWindInstance(
        wind,
        id,
        tempObject.matrix,
        random.range(0, Math.PI * 2) + x * 0.09 + z * 0.12 + frond,
        random.range(0.82, 1.38)
      );
      mesh.setColorAt(
        id,
        new Color().setHSL(
          random.range(0.26, 0.34),
          random.range(0.04, 0.16),
          random.range(0.76, 0.98)
        )
      );
    }
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  windLayers.push(wind);
  return {
    mesh,
    triangles: geometryTriangles(frondGeometry) * count
  };
}

function createHeroFallenLog(
  config: WorldConfig,
  terrain: TerrainSystem
): BridgeLogStrike {
  const group = new Group();
  group.name = "bridge log lightning fracture trigger";
  const geometry = new CylinderGeometry(0.62, 0.86, 16, 16, 8);
  distortTrunkGeometry(geometry, config.seed + 7_890);
  const halfLength = 7.55;
  const halfGeometry = new CylinderGeometry(0.58, 0.82, halfLength, 16, 8);
  distortTrunkGeometry(halfGeometry, config.seed + 7_891);
  const fractureDiskGeometry = new CircleGeometry(0.84, 18);
  const splinterGeometry = new ConeGeometry(0.09, 0.82, 5);
  const bark = createBarkTextures(config.seed + 7_890);
  const material = new MeshStandardMaterial({
    color: 0x4d321f,
    map: bark.map,
    normalMap: bark.normalMap,
    normalScale: new Vector2(0.72, 1.1),
    roughnessMap: bark.roughnessMap,
    roughness: 0.88,
    metalness: 0
  });
  const fractureMaterial = new MeshStandardMaterial({
    color: 0xb7834f,
    roughness: 0.96,
    metalness: 0,
    side: DoubleSide,
    emissive: new Color(0x1d0b04),
    emissiveIntensity: 0.1
  });
  const charMaterial = new MeshStandardMaterial({
    color: 0x0d0805,
    roughness: 0.98,
    metalness: 0,
    emissive: new Color(0x160500),
    emissiveIntensity: 0.16
  });
  const z = 30;
  const center = streamCenterX(config.seed, z);
  const sample = terrain.sample(center, z);
  const logCenter = new Vector3(center - 0.8, sample.height + 5.2, z);
  const logFrame = new Object3D();
  logFrame.rotation.set(0.05, 0.18, Math.PI / 2 - 0.08);
  const logQuaternion = logFrame.quaternion.clone();
  const logAxis = new Vector3(0, 1, 0).applyQuaternion(logQuaternion).normalize();
  const tumbleAxis = new Vector3().crossVectors(logAxis, up).normalize();
  if (tumbleAxis.lengthSq() < 0.001) {
    tumbleAxis.set(1, 0, 0);
  }

  const intact = new Mesh(geometry, material);
  intact.name = "composed fallen log across ravine intact";
  intact.position.copy(logCenter);
  intact.quaternion.copy(logQuaternion);
  intact.castShadow = true;
  intact.receiveShadow = true;
  group.add(intact);

  const leftHalf = createBrokenLogHalf(
    halfGeometry,
    material,
    fractureDiskGeometry,
    fractureMaterial,
    charMaterial,
    halfLength,
    1
  );
  leftHalf.name = "left broken bridge log half";
  const rightHalf = createBrokenLogHalf(
    halfGeometry,
    material,
    fractureDiskGeometry,
    fractureMaterial,
    charMaterial,
    halfLength,
    -1
  );
  rightHalf.name = "right broken bridge log half";
  leftHalf.visible = false;
  rightHalf.visible = false;
  group.add(leftHalf, rightHalf);

  const splinters = createBridgeLogSplinters(
    splinterGeometry,
    fractureMaterial,
    logCenter,
    logAxis,
    config.seed + 7_905
  );
  splinters.visible = false;
  group.add(splinters);

  const boltGeometry = createBridgeBoltGeometry(config.seed + 7_920);
  const boltMaterial = new LineBasicMaterial({
    color: 0xedffff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const bolt = new LineSegments(boltGeometry, boltMaterial);
  bolt.name = "automatic bridge log lightning bolt";
  bolt.position.copy(logCenter);
  bolt.visible = false;
  group.add(bolt);

  const flash = new PointLight(0xccf4ff, 0, 110, 1.25);
  flash.name = "bridge log lightning flash light";
  flash.position.copy(logCenter).add(new Vector3(0, 7, 0));
  group.add(flash);

  const sparkCount = config.thermal === "cool" ? 22 : 42;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkVelocities = new Float32Array(sparkCount * 3);
  const sparkPosition = new Float32BufferAttribute(sparkPositions, 3);
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute("position", sparkPosition);
  sparkGeometry.setAttribute(
    "uv",
    new Float32BufferAttribute(new Float32Array(sparkCount * 2).fill(0.5), 2)
  );
  const sparkMaterial = new PointsMaterial({
    color: 0xffcf8a,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const sparks = new Points(sparkGeometry, sparkMaterial);
  sparks.name = "bridge log fracture sparks";
  sparks.visible = false;
  group.add(sparks);

  let state: "intact" | "striking" | "settled" = "intact";
  let elapsed = 0;
  let fractured = false;
  let leftSettled = false;
  let rightSettled = false;
  const leftVelocity = new Vector3();
  const rightVelocity = new Vector3();
  const triggerRadius = 14.5;
  const cameraCue: CinematicCameraCue = {
    active: false,
    target: logCenter.clone(),
    strength: 0,
    distanceBoost: 15.5,
    heightBoost: 11.5,
    targetLift: 3.8
  };

  const resetHalfTransforms = (): void => {
    leftHalf.position.copy(logCenter).addScaledVector(logAxis, -halfLength * 0.52);
    rightHalf.position.copy(logCenter).addScaledVector(logAxis, halfLength * 0.52);
    leftHalf.quaternion.copy(logQuaternion);
    rightHalf.quaternion.copy(logQuaternion);
  };

  resetHalfTransforms();

  const fracture = (): void => {
    if (fractured) {
      return;
    }
    fractured = true;
    intact.visible = false;
    leftHalf.visible = true;
    rightHalf.visible = true;
    splinters.visible = true;
    resetHalfTransforms();
    leftVelocity
      .copy(logAxis)
      .multiplyScalar(-1.75)
      .add(new Vector3(-0.24, -0.28, 0.18));
    rightVelocity
      .copy(logAxis)
      .multiplyScalar(1.75)
      .add(new Vector3(0.28, -0.26, -0.14));
    leftSettled = false;
    rightSettled = false;
    resetBridgeLogSparks(
      sparkPosition,
      sparkVelocities,
      logCenter,
      logAxis,
      config.seed + 7_940
    );
    sparks.visible = true;
  };

  const trigger = (): void => {
    if (state !== "intact") {
      return;
    }
    state = "striking";
    elapsed = 0;
    fractured = false;
    bolt.visible = true;
    boltMaterial.opacity = 1;
    flash.intensity = 0;
    splinters.visible = false;
  };

  return {
    group,
    triangleEstimate:
      geometryTriangles(geometry) +
      geometryTriangles(halfGeometry) * 2 +
      geometryTriangles(fractureDiskGeometry) * 4 +
      geometryTriangles(splinterGeometry) * splinters.count,
    drawCallEstimate: 7,
    setPlayerBallPosition(position: Vector3): void {
      if (state !== "intact") {
        return;
      }
      const dx = position.x - logCenter.x;
      const dz = position.z - logCenter.z;
      if (dx * dx + dz * dz <= triggerRadius * triggerRadius) {
        trigger();
      }
    },
    getCinematicCameraCue(): CinematicCameraCue | undefined {
      if (state === "intact") {
        cameraCue.active = false;
        cameraCue.strength = 0;
        return undefined;
      }
      const fadeIn = smoothstep01(elapsed / 0.48);
      const fadeOut = 1 - smoothstep01((elapsed - 6.45) / 1.35);
      const strength = Math.max(0, Math.min(1, fadeIn * fadeOut));
      cameraCue.active = strength > 0.015;
      cameraCue.strength = strength;
      return cameraCue.active ? cameraCue : undefined;
    },
    update(deltaSeconds: number): void {
      if (state === "intact") {
        return;
      }

      elapsed += deltaSeconds;
      const electricPulse =
        elapsed < 0.84
          ? Math.max(0, 1 - elapsed / 0.84 + Math.sin(elapsed * 132) * 0.16)
          : 0;
      boltMaterial.opacity = electricPulse;
      flash.intensity = electricPulse * 190;

      if (elapsed >= 0.42 && !fractured) {
        fracture();
      }

      if (elapsed > 0.9) {
        bolt.visible = false;
      }

      if (fractured) {
        splinters.visible = elapsed < 1.85;
        leftSettled = updateFallingBridgeLogHalf(
          leftHalf,
          leftVelocity,
          tumbleAxis,
          -1,
          terrain,
          deltaSeconds,
          leftSettled
        );
        rightSettled = updateFallingBridgeLogHalf(
          rightHalf,
          rightVelocity,
          tumbleAxis,
          1,
          terrain,
          deltaSeconds,
          rightSettled
        );
        updateBridgeLogSparks(
          sparkPosition,
          sparkVelocities,
          sparkMaterial,
          terrain,
          deltaSeconds,
          elapsed
        );
      }

      if (elapsed > 7.2 && leftSettled && rightSettled) {
        state = "settled";
        flash.intensity = 0;
        sparks.visible = false;
        splinters.visible = false;
      }
    }
  };
}

function createBrokenLogHalf(
  geometry: BufferGeometry,
  barkMaterial: MeshStandardMaterial,
  fractureDiskGeometry: BufferGeometry,
  fractureMaterial: MeshStandardMaterial,
  charMaterial: MeshStandardMaterial,
  halfLength: number,
  innerSign: number
): Group {
  const group = new Group();
  const log = new Mesh(geometry, barkMaterial);
  log.name = "fractured bridge log cylinder";
  log.castShadow = true;
  log.receiveShadow = true;
  group.add(log);

  const cap = new Mesh(fractureDiskGeometry, fractureMaterial);
  cap.name = "fresh broken bridge log heartwood";
  cap.position.y = innerSign * halfLength * 0.5;
  cap.rotation.x = -Math.PI / 2;
  cap.castShadow = true;
  group.add(cap);

  const char = new Mesh(fractureDiskGeometry, charMaterial);
  char.name = "charred lightning rim on bridge log";
  char.position.y = innerSign * halfLength * 0.5 - innerSign * 0.018;
  char.rotation.x = -Math.PI / 2;
  char.scale.setScalar(0.78);
  group.add(char);

  return group;
}

function createBridgeLogSplinters(
  geometry: ConeGeometry,
  material: MeshStandardMaterial,
  origin: Vector3,
  logAxis: Vector3,
  seed: number
): InstancedMesh {
  const count = 24;
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = "static bridge log fracture splinters";
  const random = createRandom(seed);
  const radialA = new Vector3().crossVectors(logAxis, up).normalize();
  if (radialA.lengthSq() < 0.001) {
    radialA.set(1, 0, 0);
  }
  const radialB = new Vector3().crossVectors(logAxis, radialA).normalize();

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + random.signed() * 0.22;
    const radius = random.range(0.22, 0.82);
    const offset = new Vector3()
      .addScaledVector(radialA, Math.cos(angle) * radius)
      .addScaledVector(radialB, Math.sin(angle) * radius)
      .addScaledVector(logAxis, random.signed() * 0.52);
    tempObject.position.copy(origin).add(offset);
    tempObject.quaternion.setFromUnitVectors(up, offset.clone().normalize());
    tempObject.scale.set(
      random.range(0.65, 1.25),
      random.range(0.7, 1.65),
      random.range(0.65, 1.1)
    );
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
  }

  mesh.castShadow = true;
  return mesh;
}

function createBridgeBoltGeometry(seed: number): BufferGeometry {
  const random = createRandom(seed);
  const positions: number[] = [];
  let previous = new Vector3(
    random.signed() * 4.5,
    54 + random.signed() * 4,
    random.signed() * 3.5
  );
  const segmentCount = 16;

  for (let index = 1; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const next = new Vector3(
      random.signed() * (1 - t) * 4.2,
      54 * (1 - t),
      random.signed() * (1 - t) * 3.2
    );
    pushLineSegment(positions, previous, next);

    if (index > 3 && index < segmentCount - 2 && index % 3 === 0) {
      const branch = next.clone().add(
        new Vector3(
          random.signed() * 5.2,
          random.range(-4.8, -1.7),
          random.signed() * 4.4
        )
      );
      pushLineSegment(positions, next, branch);
    }
    previous = next;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function pushLineSegment(
  target: number[],
  start: Vector3,
  end: Vector3
): void {
  target.push(start.x, start.y, start.z, end.x, end.y, end.z);
}

function resetBridgeLogSparks(
  position: Float32BufferAttribute,
  velocities: Float32Array,
  origin: Vector3,
  logAxis: Vector3,
  seed: number
): void {
  const random = createRandom(seed);
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    const side = random.next() < 0.5 ? -1 : 1;
    position.setXYZ(
      index,
      origin.x + random.signed() * 0.5,
      origin.y + random.signed() * 0.38,
      origin.z + random.signed() * 0.5
    );
    velocities[offset] =
      logAxis.x * side * random.range(2.2, 7.4) + random.signed() * 2.2;
    velocities[offset + 1] = random.range(2.4, 8.8);
    velocities[offset + 2] =
      logAxis.z * side * random.range(2.2, 7.4) + random.signed() * 2.2;
  }
  position.needsUpdate = true;
}

function updateBridgeLogSparks(
  position: Float32BufferAttribute,
  velocities: Float32Array,
  material: PointsMaterial,
  terrain: TerrainSystem,
  deltaSeconds: number,
  elapsedSeconds: number
): void {
  material.opacity = Math.max(0, 1 - Math.max(0, elapsedSeconds - 0.28) / 1.15);
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    const vx = (velocities[offset] ?? 0) * 0.985;
    const vy = (velocities[offset + 1] ?? 0) - 15.2 * deltaSeconds;
    const vz = (velocities[offset + 2] ?? 0) * 0.985;
    velocities[offset] = vx;
    velocities[offset + 1] = vy;
    velocities[offset + 2] = vz;
    const x = position.getX(index) + vx * deltaSeconds;
    const y = position.getY(index) + vy * deltaSeconds;
    const z = position.getZ(index) + vz * deltaSeconds;
    position.setXYZ(index, x, Math.max(y, terrain.heightAt(x, z) + 0.06), z);
  }
  position.needsUpdate = true;
}

function updateFallingBridgeLogHalf(
  half: Group,
  velocity: Vector3,
  tumbleAxis: Vector3,
  tumbleSign: number,
  terrain: TerrainSystem,
  deltaSeconds: number,
  settled: boolean
): boolean {
  if (settled) {
    return true;
  }

  velocity.y -= 7.4 * deltaSeconds;
  half.position.addScaledVector(velocity, deltaSeconds);
  half.rotateOnWorldAxis(tumbleAxis, tumbleSign * deltaSeconds * 0.92);
  half.rotateOnWorldAxis(up, tumbleSign * deltaSeconds * 0.12);
  const ground = terrain.heightAt(half.position.x, half.position.z) + 0.86;
  if (half.position.y <= ground) {
    half.position.y = ground;
    velocity.set(0, 0, 0);
    return true;
  }
  return false;
}

function createTaperedSegment(
  start: Vector3,
  end: Vector3,
  radiusStart: number,
  radiusEnd: number
): BufferGeometry {
  const direction = new Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new CylinderGeometry(
    radiusEnd,
    radiusStart,
    length,
    10,
    2,
    false
  );
  const quaternion = new Quaternion().setFromUnitVectors(
    up,
    direction.clone().normalize()
  );
  const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
  const matrix = new Matrix4().compose(
    midpoint,
    quaternion,
    new Vector3(1, 1, 1)
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function mountainRidge(x: number, phase: number): number {
  const broad =
    25 +
    Math.sin(x * 0.052 + phase) * 8 +
    Math.sin(x * 0.097 - phase * 1.7) * 5;
  const serrated =
    Math.abs(Math.sin(x * 0.135 + phase * 2.2)) * 13 +
    Math.abs(Math.sin(x * 0.31 - phase)) * 6;
  const centralMass =
    Math.exp(-Math.abs(x - Math.sin(phase) * 4) / 31) * 34;
  const envelope = Math.max(0.48, 1 - Math.abs(x) / 145);
  return Math.max(18, (broad + serrated + centralMass) * envelope);
}

function distortTrunkGeometry(geometry: BufferGeometry, seed: number): void {
  const position = geometry.getAttribute("position");
  const phase = (seed % 911) * 0.017;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const radial = Math.hypot(x, z);
    if (radial < 0.001) {
      continue;
    }
    const angle = Math.atan2(z, x);
    const growth =
      Math.sin(angle * 7 + y * 0.29 + phase) * 0.055 +
      Math.sin(angle * 13 - y * 0.53 - phase) * 0.024;
    const scale = 1 + growth;
    position.setXYZ(index, x * scale, y, z * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function createSoftCloudTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,0.92)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.6)");
    gradient.addColorStop(0.76, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return index ? index.count / 3 : geometry.getAttribute("position").count / 3;
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
