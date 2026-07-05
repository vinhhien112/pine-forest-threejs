import RAPIER, { type RigidBody } from "@dimforge/rapier3d-compat";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Points,
  PointsMaterial,
  TorusGeometry,
  Vector2,
  Vector3
} from "three";
import type { FrameUpdatable, WorldConfig } from "../../types";
import type { TerrainSystem } from "../../world/terrain";
import { streamCenterX } from "../../world/terrain";
import { createRandom } from "../../world/random";
import {
  createBarkTextures
} from "../materials/proceduralTextures";
import {
  createConiferCrownGeometry,
  createConiferNeedleMaterial
} from "../../vegetation/conifer";

export interface LightningStrikeSystem extends FrameUpdatable {
  readonly group: Group;
  readonly overlay: HTMLElement;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  trigger(): void;
  dispose(): void;
}

interface ParticleField {
  readonly points: Points;
  readonly material: PointsMaterial;
  readonly position: Float32BufferAttribute;
  readonly velocities: Float32Array;
  readonly drag: number;
  readonly gravity: number;
}

interface DebrisField {
  readonly mesh: InstancedMesh;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly rotations: Float32Array;
  readonly spins: Float32Array;
}

const fixedStep = 1 / 60;
const windDirection = new Vector3(0.84, 0, 0.54).normalize();
const fallAxis = new Vector3(windDirection.z, 0, -windDirection.x);
const tempObject = new Object3D();

export async function createLightningStrikeSystem(
  config: WorldConfig,
  terrain: TerrainSystem
): Promise<LightningStrikeSystem> {
  await RAPIER.init();

  const group = new Group();
  group.name = "procedural lightning fracture event";
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = fixedStep;
  createTerrainCollider(physics, terrain);

  const trunkHeight = 27.5;
  const breakHeight = 11.25;
  const upperLength = trunkHeight - breakHeight;
  const upperCenterHeight = breakHeight + upperLength * 0.5;
  let treeSiteIndex = 0;
  let treeBase = lightningTreeBase(config, terrain, treeSiteIndex);
  let strikePoint = treeBase
    .clone()
    .add(new Vector3(0, breakHeight + 0.25, 0));
  let initialTopPosition = treeBase
    .clone()
    .add(new Vector3(0, upperCenterHeight, 0));

  const barkTextures = createBarkTextures(config.seed + 9_101);
  const barkMaterial = new MeshStandardMaterial({
    color: 0x68452c,
    map: barkTextures.map,
    normalMap: barkTextures.normalMap,
    normalScale: new Vector2(0.82, 1.2),
    roughnessMap: barkTextures.roughnessMap,
    roughness: 0.87,
    metalness: 0
  });
  const fractureMaterial = new MeshStandardMaterial({
    color: 0xb88950,
    roughness: 0.96,
    metalness: 0,
    emissive: new Color(0x271308),
    emissiveIntensity: 0.08
  });
  const charMaterial = new MeshStandardMaterial({
    color: 0x100b08,
    roughness: 0.98,
    metalness: 0,
    emissive: new Color(0x150500),
    emissiveIntensity: 0.12
  });

  const stumpGeometry = new CylinderGeometry(
    0.72,
    1.24,
    breakHeight,
    18,
    6
  );
  let stumpAssembly = new Group();
  stumpAssembly.name = "rooted lightning stump assembly";
  stumpAssembly.position.copy(treeBase);
  const stump = new Mesh(stumpGeometry, barkMaterial);
  stump.name = "lightning split stump";
  stump.position.set(0, breakHeight * 0.5, 0);
  stump.castShadow = true;
  stump.receiveShadow = true;
  stumpAssembly.add(stump);

  let fallingTop = new Group();
  fallingTop.name = "falling conifer upper rigid body";
  fallingTop.position.copy(initialTopPosition);

  const upperTrunkGeometry = new CylinderGeometry(
    0.26,
    0.72,
    upperLength,
    18,
    8
  );
  const upperTrunk = new Mesh(upperTrunkGeometry, barkMaterial);
  upperTrunk.name = "fractured falling trunk";
  upperTrunk.castShadow = true;
  upperTrunk.receiveShadow = true;
  fallingTop.add(upperTrunk);

  const fractureDiskGeometry = new CircleGeometry(0.715, 18);
  const stumpFracture = new Mesh(fractureDiskGeometry, fractureMaterial);
  stumpFracture.position.set(0, breakHeight + 0.01, 0);
  stumpFracture.rotation.x = -Math.PI / 2;
  stumpFracture.name = "exposed stump heartwood";
  stumpAssembly.add(stumpFracture);

  const upperFracture = new Mesh(fractureDiskGeometry, fractureMaterial);
  upperFracture.position.y = -upperLength * 0.5 - 0.01;
  upperFracture.rotation.x = Math.PI / 2;
  upperFracture.name = "exposed falling heartwood";
  fallingTop.add(upperFracture);

  const crownGeometry = createConiferCrownGeometry({
    levels: 17,
    branches: 12,
    crossed: true
  });
  crownGeometry.scale(1.65, 1.15, 1.65);
  crownGeometry.translate(0, 19.5 - upperCenterHeight, 0);
  const crown = new Mesh(crownGeometry, createConiferNeedleMaterial());
  crown.name = "foliage attached to falling trunk";
  crown.castShadow = true;
  crown.receiveShadow = true;
  crown.frustumCulled = false;
  fallingTop.add(crown);

  const splinterGeometry = new ConeGeometry(0.17, 1.15, 5);
  const stumpSplinters = createSplinters(
    splinterGeometry,
    fractureMaterial,
    breakHeight,
    false,
    config.seed + 9_151
  );
  stumpSplinters.name = "jagged stump fracture fibers";
  stumpAssembly.add(stumpSplinters);

  const upperSplinters = createSplinters(
    splinterGeometry,
    fractureMaterial,
    -upperLength * 0.5,
    true,
    config.seed + 9_173
  );
  upperSplinters.name = "jagged upper fracture fibers";
  fallingTop.add(upperSplinters);

  const charRingGeometry = new TorusGeometry(0.69, 0.075, 5, 18);
  const stumpChar = new Mesh(charRingGeometry, charMaterial);
  stumpChar.position.set(0, breakHeight - 0.07, 0);
  stumpChar.rotation.x = Math.PI / 2;
  stumpChar.name = "charred stump fracture rim";
  stumpAssembly.add(stumpChar);

  const upperChar = new Mesh(charRingGeometry, charMaterial);
  upperChar.position.y = -upperLength * 0.5 + 0.07;
  upperChar.rotation.x = Math.PI / 2;
  upperChar.name = "charred falling fracture rim";
  fallingTop.add(upperChar);
  setFractureDetailsVisible(stumpAssembly, false);
  setFractureDetailsVisible(fallingTop, false);
  group.add(stumpAssembly, fallingTop);

  const stumpTemplate = stumpAssembly.clone(true);
  stumpTemplate.position.set(0, 0, 0);
  const fallingTopTemplate = fallingTop.clone(true);
  fallingTopTemplate.position.set(0, 0, 0);

  const boltGeometry = createBoltGeometry(
    new Vector3(),
    config.seed + 9_211
  );
  const boltGlowMaterial = new LineBasicMaterial({
    color: 0x6fcfff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const boltCoreMaterial = new LineBasicMaterial({
    color: 0xf3ffff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const boltGlow = new LineSegments(boltGeometry, boltGlowMaterial);
  const boltCore = new LineSegments(boltGeometry, boltCoreMaterial);
  boltGlow.name = "lightning branch glow";
  boltCore.name = "lightning white core";
  boltGlow.position.copy(strikePoint);
  boltCore.position.copy(strikePoint);
  boltGlow.visible = false;
  boltCore.visible = false;
  group.add(boltGlow, boltCore);

  const flashLight = new PointLight(0xbdeeff, 0, 150, 1.35);
  flashLight.position.copy(strikePoint).add(new Vector3(0, 10, 0));
  flashLight.castShadow = false;
  group.add(flashLight);

  const sparkCount =
    config.thermal === "cool" ? 90 : config.preset === "high" ? 220 : 150;
  const sparks = createParticleField(
    sparkCount,
    0xffd48a,
    0.17,
    AdditiveBlending
  );
  sparks.points.name = "hot fracture sparks";
  const smoke = createParticleField(
    config.thermal === "cool" ? 24 : 42,
    0x46504d,
    1.35
  );
  smoke.points.name = "fracture smoke plume";
  smoke.material.map = createSoftParticleTexture();
  smoke.material.alphaMap = smoke.material.map;
  group.add(sparks.points, smoke.points);

  const debris = createDebrisField(
    config.thermal === "cool" ? 22 : 38,
    fractureMaterial
  );
  debris.mesh.name = "flying wood fracture chips";
  group.add(debris.mesh);

  const shockwaveMaterial = new MeshBasicMaterial({
    color: 0xc9efff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const shockwave = new Mesh(
    new TorusGeometry(0.55, 0.035, 5, 32),
    shockwaveMaterial
  );
  shockwave.position.copy(strikePoint);
  shockwave.rotation.x = Math.PI / 2;
  shockwave.visible = false;
  group.add(shockwave);

  const overlay = document.createElement("div");
  overlay.className = "lightning-flash";
  overlay.dataset.testid = "lightning-flash";
  overlay.dataset.state = "idle";
  overlay.dataset.target = String(treeSiteIndex);
  overlay.setAttribute("aria-hidden", "true");

  let body: RigidBody | undefined;
  let active = false;
  let fractured = false;
  let elapsed = 0;
  let physicsAccumulator = 0;
  let strikeCount = 0;
  let queuedStrikes = 0;
  let lastBodyHeight = Number.POSITIVE_INFINITY;
  let stillFrames = 0;
  const audioContexts = new Set<AudioContext>();

  const prepareNextTree = (): void => {
    treeSiteIndex += 1;
    treeBase = lightningTreeBase(config, terrain, treeSiteIndex);
    strikePoint = treeBase
      .clone()
      .add(new Vector3(0, breakHeight + 0.25, 0));
    initialTopPosition = treeBase
      .clone()
      .add(new Vector3(0, upperCenterHeight, 0));

    stumpAssembly = stumpTemplate.clone(true);
    stumpAssembly.position.copy(treeBase);
    fallingTop = fallingTopTemplate.clone(true);
    fallingTop.position.copy(initialTopPosition);
    fallingTop.quaternion.identity();
    fallingTop.updateMatrixWorld(true);
    group.add(stumpAssembly, fallingTop);

    boltGlow.position.copy(strikePoint);
    boltCore.position.copy(strikePoint);
    flashLight.position.copy(strikePoint).add(new Vector3(0, 10, 0));
    shockwave.position.copy(strikePoint);
    overlay.dataset.target = String(treeSiteIndex);

    body = undefined;
    fractured = false;
    physicsAccumulator = 0;
    lastBodyHeight = Number.POSITIVE_INFINITY;
    stillFrames = 0;
  };

  const fracture = (): void => {
    if (fractured) {
      return;
    }
    fractured = true;
    overlay.dataset.state = "falling";
    setFractureDetailsVisible(stumpAssembly, true);
    setFractureDetailsVisible(fallingTop, true);

    const descriptor = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        initialTopPosition.x,
        initialTopPosition.y,
        initialTopPosition.z
      )
      .setLinearDamping(0.18)
      .setAngularDamping(0.24)
      .setCcdEnabled(true);
    body = physics.createRigidBody(descriptor);
    physics.createCollider(
      RAPIER.ColliderDesc.cylinder(upperLength * 0.5, 0.72)
        .setDensity(0.62)
        .setFriction(0.92)
        .setRestitution(0.04),
      body
    );
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(4.4, 4.8, 4.4)
        .setTranslation(0, 0.35, 0)
        .setDensity(0.035)
        .setFriction(0.84)
        .setRestitution(0.03),
      body
    );
    body.setLinvel(
      {
        x: windDirection.x * 2.8,
        y: 0.55,
        z: windDirection.z * 2.8
      },
      true
    );
    body.setAngvel(
      {
        x: fallAxis.x * 0.72,
        y: 0.08,
        z: fallAxis.z * 0.72
      },
      true
    );
    resetParticleField(sparks, strikePoint, config.seed + 9_301 + strikeCount);
    resetParticleField(smoke, strikePoint, config.seed + 9_401 + strikeCount, true);
    resetDebris(debris, strikePoint, config.seed + 9_501 + strikeCount);
  };

  const startStrike = (): void => {
    active = true;
    elapsed = 0;
    strikeCount += 1;
    boltGlow.visible = true;
    boltCore.visible = true;
    shockwave.visible = true;
    shockwave.scale.setScalar(1);
    sparks.points.visible = false;
    smoke.points.visible = false;
    debris.mesh.visible = false;
    overlay.dataset.state = "strike";
    playThunder(config.seed + 9_601 + strikeCount, audioContexts);
  };

  const trigger = (): void => {
    if (active) {
      queuedStrikes += 1;
      overlay.dataset.queued = String(queuedStrikes);
      return;
    }
    startStrike();
  };

  return {
    group,
    overlay,
    triangleEstimate:
      geometryTriangles(stumpGeometry) +
      geometryTriangles(upperTrunkGeometry) +
      geometryTriangles(fractureDiskGeometry) * 2 +
      geometryTriangles(crownGeometry) +
      geometryTriangles(splinterGeometry) * 20 +
      geometryTriangles(charRingGeometry) * 2 +
      geometryTriangles(debris.mesh.geometry) * debris.mesh.count,
    drawCallEstimate: 14,
    trigger,
    update(deltaSeconds: number): void {
      if (!active) {
        return;
      }

      if (active) {
        elapsed += deltaSeconds;
        const electricPulse =
          elapsed < 0.19
            ? Math.max(
                0,
                1 -
                  elapsed / 0.19 +
                  Math.sin(elapsed * 170) * 0.18
              )
            : 0;
        boltGlowMaterial.opacity = electricPulse * 0.52;
        boltCoreMaterial.opacity = electricPulse;
        flashLight.intensity = electricPulse * 210;
        overlay.style.opacity = String(Math.min(0.82, electricPulse * 0.78));

        if (elapsed >= 0.075 && !fractured) {
          fracture();
        }

        if (elapsed < 0.58) {
          const waveT = elapsed / 0.58;
          shockwave.visible = true;
          shockwave.scale.setScalar(1 + waveT * 12);
          shockwaveMaterial.opacity = (1 - waveT) * 0.72;
        } else {
          shockwave.visible = false;
        }

        if (elapsed > 0.22) {
          boltGlow.visible = false;
          boltCore.visible = false;
          overlay.style.opacity = "0";
        }

        updateParticleField(sparks, deltaSeconds, elapsed, terrain, false);
        updateParticleField(smoke, deltaSeconds, elapsed, terrain, true);
        updateDebris(debris, deltaSeconds, terrain);
      }

      if (body) {
        physicsAccumulator = Math.min(
          physicsAccumulator + deltaSeconds,
          fixedStep * 3
        );
        while (physicsAccumulator >= fixedStep) {
          physics.step();
          physicsAccumulator -= fixedStep;
        }

        const position = body.translation();
        const rotation = body.rotation();
        fallingTop.position.set(position.x, position.y, position.z);
        fallingTop.quaternion.set(
          rotation.x,
          rotation.y,
          rotation.z,
          rotation.w
        );

        const verticalDelta = Math.abs(position.y - lastBodyHeight);
        stillFrames =
          verticalDelta < 0.0008 && body.linvel().y < 0.025
            ? stillFrames + 1
            : 0;
        lastBodyHeight = position.y;

        if (body.isSleeping() || stillFrames > 90 || elapsed > 12) {
          body.sleep();
          active = false;
          overlay.dataset.state = "settled";
          sparks.points.visible = false;
          smoke.points.visible = false;
          debris.mesh.visible = false;
          flashLight.intensity = 0;
          prepareNextTree();
          if (queuedStrikes > 0) {
            queuedStrikes -= 1;
            overlay.dataset.queued = String(queuedStrikes);
            startStrike();
          }
        }
      }
    },
    dispose(): void {
      physics.free();
      overlay.remove();
      for (const context of audioContexts) {
        void context.close();
      }
      audioContexts.clear();
    }
  };
}

function lightningTreeBase(
  config: WorldConfig,
  terrain: TerrainSystem,
  index: number
): Vector3 {
  const authoredSites = [
    { z: 12, side: -1, distance: 13.2 },
    { z: 30, side: 1, distance: 17 },
    { z: 44, side: -1, distance: 15 },
    { z: 0, side: 1, distance: 18 },
    { z: 58, side: 1, distance: 14 },
    { z: -14, side: -1, distance: 14 },
    { z: 70, side: -1, distance: 18 },
    { z: -24, side: 1, distance: 16 }
  ] as const;
  const authored = authoredSites[index];
  const random = createRandom(config.seed + 12_000 + index * 313);
  const z = authored?.z ?? -34 + ((index * 23) % 116);
  const side = authored?.side ?? (index % 2 === 0 ? -1 : 1);
  const distance = authored?.distance ?? random.range(12.5, 19.5);
  const x = streamCenterX(config.seed, z) + side * distance;
  return new Vector3(x, terrain.sample(x, z).height, z);
}

function setFractureDetailsVisible(root: Object3D, visible: boolean): void {
  root.traverse((child) => {
    if (
      child.name.startsWith("exposed ") ||
      child.name.startsWith("jagged ") ||
      child.name.startsWith("charred ")
    ) {
      child.visible = visible;
    }
  });
}

function createTerrainCollider(
  physics: RAPIER.World,
  terrain: TerrainSystem
): void {
  const position = terrain.geometry.getAttribute("position");
  const index = terrain.geometry.getIndex();
  if (!index) {
    throw new Error("Lightning physics requires indexed terrain geometry.");
  }

  const vertices = Float32Array.from(position.array as ArrayLike<number>);
  const indices = Uint32Array.from(index.array as ArrayLike<number>);
  physics.createCollider(
    RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.96)
  );
}

function createSplinters(
  geometry: ConeGeometry,
  material: MeshStandardMaterial,
  y: number,
  inverted: boolean,
  seed: number
): InstancedMesh {
  const count = 10;
  const mesh = new InstancedMesh(geometry, material, count);
  const random = createRandom(seed);

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + random.signed() * 0.28;
    const radius = random.range(0.18, 0.58);
    tempObject.position.set(
      Math.cos(angle) * radius,
      y + (inverted ? -0.36 : 0.36),
      Math.sin(angle) * radius
    );
    tempObject.rotation.set(
      random.signed() * 0.3,
      angle,
      (inverted ? Math.PI : 0) + random.signed() * 0.28
    );
    tempObject.scale.set(
      random.range(0.55, 1.1),
      random.range(0.65, 1.5),
      random.range(0.55, 1.05)
    );
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
  }

  mesh.castShadow = true;
  return mesh;
}

function createBoltGeometry(
  strikePoint: Vector3,
  seed: number
): BufferGeometry {
  const random = createRandom(seed);
  const segments: number[] = [];
  const start = strikePoint
    .clone()
    .add(new Vector3(random.signed() * 5, 64, random.signed() * 4));
  const points: Vector3[] = [start];
  const segmentCount = 15;

  for (let index = 1; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const point = start.clone().lerp(strikePoint, t);
    const jitter = Math.sin(t * Math.PI) * (3.2 - t * 1.4);
    point.x += random.signed() * jitter;
    point.z += random.signed() * jitter;
    points.push(point);
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) {
      continue;
    }
    pushSegment(segments, from, to);

    if (index > 2 && index < segmentCount - 2 && index % 3 === 0) {
      let branchPoint = from.clone();
      const branchLength = random.range(7, 14);
      for (let branch = 0; branch < 3; branch += 1) {
        const next = branchPoint.clone().add(
          new Vector3(
            random.signed() * branchLength * 0.34,
            -branchLength * random.range(0.18, 0.34),
            random.signed() * branchLength * 0.34
          )
        );
        pushSegment(segments, branchPoint, next);
        branchPoint = next;
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(segments, 3)
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function pushSegment(
  positions: number[],
  start: Vector3,
  end: Vector3
): void {
  positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
}

function createParticleField(
  count: number,
  color: number,
  size: number,
  blending = AdditiveBlending
): ParticleField {
  const positions = new Float32Array(count * 3);
  const position = new Float32BufferAttribute(positions, 3);
  position.setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", position);
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(new Float32Array(count * 2).fill(0.5), 2)
  );
  const material = new PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending,
    depthWrite: false
  });
  const points = new Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;
  return {
    points,
    material,
    position,
    velocities: new Float32Array(count * 3),
    drag: size > 1 ? 0.9 : 0.985,
    gravity: size > 1 ? -0.15 : -13.5
  };
}

function resetParticleField(
  field: ParticleField,
  origin: Vector3,
  seed: number,
  smoke = false
): void {
  const random = createRandom(seed);
  for (let index = 0; index < field.position.count; index += 1) {
    const offset = index * 3;
    field.position.setXYZ(
      index,
      origin.x + random.signed() * 0.55,
      origin.y + random.signed() * 0.45,
      origin.z + random.signed() * 0.55
    );
    field.velocities[offset] =
      windDirection.x * random.range(smoke ? 0.7 : 1.4, smoke ? 2.4 : 7.5) +
      random.signed() * (smoke ? 0.4 : 4.2);
    field.velocities[offset + 1] = smoke
      ? random.range(0.8, 2.8)
      : random.range(2.5, 10.5);
    field.velocities[offset + 2] =
      windDirection.z * random.range(smoke ? 0.7 : 1.4, smoke ? 2.4 : 7.5) +
      random.signed() * (smoke ? 0.4 : 4.2);
  }
  field.position.needsUpdate = true;
  field.points.visible = true;
}

function updateParticleField(
  field: ParticleField,
  deltaSeconds: number,
  elapsed: number,
  terrain: TerrainSystem,
  smoke: boolean
): void {
  if (!field.points.visible) {
    return;
  }

  const material = field.material;
  material.opacity = smoke
    ? Math.max(0, Math.min(0.36, elapsed * 0.2) * (1 - elapsed / 6))
    : Math.max(0, 1 - elapsed / 1.7);
  if (material.opacity <= 0) {
    field.points.visible = false;
    return;
  }

  const drag = field.drag ** (deltaSeconds * 60);
  for (let index = 0; index < field.position.count; index += 1) {
    const offset = index * 3;
    let x = field.position.getX(index);
    let y = field.position.getY(index);
    let z = field.position.getZ(index);
    field.velocities[offset] = (field.velocities[offset] ?? 0) * drag;
    field.velocities[offset + 1] =
      ((field.velocities[offset + 1] ?? 0) + field.gravity * deltaSeconds) *
      drag;
    field.velocities[offset + 2] =
      (field.velocities[offset + 2] ?? 0) * drag;
    x += (field.velocities[offset] ?? 0) * deltaSeconds;
    y += (field.velocities[offset + 1] ?? 0) * deltaSeconds;
    z += (field.velocities[offset + 2] ?? 0) * deltaSeconds;

    if (!smoke) {
      const ground = terrain.heightAt(x, z) + 0.04;
      if (y < ground) {
        y = ground;
        field.velocities[offset + 1] =
          Math.abs(field.velocities[offset + 1] ?? 0) * 0.22;
      }
    }
    field.position.setXYZ(index, x, y, z);
  }
  field.position.needsUpdate = true;
}

function createDebrisField(
  count: number,
  material: MeshStandardMaterial
): DebrisField {
  const mesh = new InstancedMesh(
    new BoxGeometry(0.14, 0.38, 0.09),
    material,
    count
  );
  mesh.visible = false;
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return {
    mesh,
    positions: new Float32Array(count * 3),
    velocities: new Float32Array(count * 3),
    rotations: new Float32Array(count * 3),
    spins: new Float32Array(count * 3)
  };
}

function resetDebris(
  field: DebrisField,
  origin: Vector3,
  seed: number
): void {
  const random = createRandom(seed);
  for (let index = 0; index < field.mesh.count; index += 1) {
    const offset = index * 3;
    field.positions[offset] = origin.x + random.signed() * 0.65;
    field.positions[offset + 1] = origin.y + random.signed() * 0.45;
    field.positions[offset + 2] = origin.z + random.signed() * 0.65;
    field.velocities[offset] =
      windDirection.x * random.range(2.5, 8) + random.signed() * 4.5;
    field.velocities[offset + 1] = random.range(2.8, 11);
    field.velocities[offset + 2] =
      windDirection.z * random.range(2.5, 8) + random.signed() * 4.5;
    field.rotations[offset] = random.range(0, Math.PI * 2);
    field.rotations[offset + 1] = random.range(0, Math.PI * 2);
    field.rotations[offset + 2] = random.range(0, Math.PI * 2);
    field.spins[offset] = random.signed() * 7;
    field.spins[offset + 1] = random.signed() * 7;
    field.spins[offset + 2] = random.signed() * 7;
  }
  field.mesh.visible = true;
}

function updateDebris(
  field: DebrisField,
  deltaSeconds: number,
  terrain: TerrainSystem
): void {
  if (!field.mesh.visible) {
    return;
  }

  for (let index = 0; index < field.mesh.count; index += 1) {
    const offset = index * 3;
    field.velocities[offset + 1] =
      (field.velocities[offset + 1] ?? 0) - 12.5 * deltaSeconds;
    field.positions[offset] =
      (field.positions[offset] ?? 0) +
      (field.velocities[offset] ?? 0) * deltaSeconds;
    field.positions[offset + 1] =
      (field.positions[offset + 1] ?? 0) +
      (field.velocities[offset + 1] ?? 0) * deltaSeconds;
    field.positions[offset + 2] =
      (field.positions[offset + 2] ?? 0) +
      (field.velocities[offset + 2] ?? 0) * deltaSeconds;

    const ground =
      terrain.heightAt(
        field.positions[offset] ?? 0,
        field.positions[offset + 2] ?? 0
      ) + 0.05;
    if ((field.positions[offset + 1] ?? 0) < ground) {
      field.positions[offset + 1] = ground;
      field.velocities[offset] = (field.velocities[offset] ?? 0) * 0.55;
      field.velocities[offset + 1] =
        Math.abs(field.velocities[offset + 1] ?? 0) * 0.18;
      field.velocities[offset + 2] =
        (field.velocities[offset + 2] ?? 0) * 0.55;
    }

    field.rotations[offset] =
      (field.rotations[offset] ?? 0) +
      (field.spins[offset] ?? 0) * deltaSeconds;
    field.rotations[offset + 1] =
      (field.rotations[offset + 1] ?? 0) +
      (field.spins[offset + 1] ?? 0) * deltaSeconds;
    field.rotations[offset + 2] =
      (field.rotations[offset + 2] ?? 0) +
      (field.spins[offset + 2] ?? 0) * deltaSeconds;

    tempObject.position.set(
      field.positions[offset] ?? 0,
      field.positions[offset + 1] ?? 0,
      field.positions[offset + 2] ?? 0
    );
    tempObject.rotation.set(
      field.rotations[offset] ?? 0,
      field.rotations[offset + 1] ?? 0,
      field.rotations[offset + 2] ?? 0
    );
    tempObject.scale.setScalar(0.55 + (index % 5) * 0.12);
    tempObject.updateMatrix();
    field.mesh.setMatrixAt(index, tempObject.matrix);
  }
  field.mesh.instanceMatrix.needsUpdate = true;
}

function createSoftParticleTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    return new CanvasTexture(canvas);
  }
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.38, "rgba(210,220,215,0.32)");
  gradient.addColorStop(1, "rgba(130,140,135,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function playThunder(
  seed: number,
  contexts: Set<AudioContext>
): void {
  const context = new AudioContext();
  contexts.add(context);
  const now = context.currentTime;
  const random = createRandom(seed);

  const oscillator = context.createOscillator();
  const oscillatorGain = context.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(52, now);
  oscillator.frequency.exponentialRampToValueAtTime(31, now + 2.4);
  oscillatorGain.gain.setValueAtTime(0.0001, now);
  oscillatorGain.gain.exponentialRampToValueAtTime(0.24, now + 0.015);
  oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
  oscillator.connect(oscillatorGain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 2.9);

  const length = Math.floor(context.sampleRate * 2.8);
  const noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const decay = 1 - index / data.length;
    data[index] = random.signed() * decay * (0.72 + Math.sin(index * 0.013) * 0.18);
  }
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(950, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + 2.5);
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.42, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.7);
  noise.connect(filter).connect(noiseGain).connect(context.destination);
  noise.start(now);
  noise.stop(now + 2.8);

  window.setTimeout(() => {
    contexts.delete(context);
    void context.close();
  }, 3_200);
}

function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return index
    ? index.count / 3
    : geometry.getAttribute("position").count / 3;
}
