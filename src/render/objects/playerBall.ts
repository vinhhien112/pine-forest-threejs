import RAPIER, { type RigidBody } from "@dimforge/rapier3d-compat";
import {
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from "three";
import type {
  BallObstacleDescriptor,
  BallWaterState,
  CinematicCameraCue,
  WorldConfig
} from "../../types";
import type { TerrainSystem } from "../../world/terrain";
import { streamCenterX } from "../../world/terrain";
import type { TreeColliderDescriptor } from "../../vegetation/scatter";
import {
  waterHalfWidth,
  waterStreamEnd,
  waterStreamStart,
  waterSurfaceLift
} from "./water";

export interface BallMoveInput {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly sprint: boolean;
  readonly jump: boolean;
}

export interface PlayerBallSystem {
  readonly group: Group;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  rotateView(deltaYaw: number, deltaPitch: number): void;
  syncOrbitFromCamera(camera: PerspectiveCamera): void;
  update(
    deltaSeconds: number,
    elapsedSeconds: number,
    input: BallMoveInput,
    camera: PerspectiveCamera
  ): void;
  resetNearView(camera: PerspectiveCamera): void;
  getWaterState(): BallWaterState;
  setCinematicCameraCue(cue: CinematicCameraCue | undefined): void;
  dispose(): void;
}

const fixedStep = 1 / 60;
const ballRadius = 0.92;
const cameraTargetLift = 1.05;
const cameraDistance = 8.2;
const defaultOrbitYaw = Math.PI;
const defaultOrbitPitch = 0.62;
const tempForward = new Vector3();
const tempRight = new Vector3();
const tempMove = new Vector3();
const tempTarget = new Vector3();
const tempCinematicTarget = new Vector3();
const tempDesiredCamera = new Vector3();

export async function createPlayerBallSystem(
  config: WorldConfig,
  terrain: TerrainSystem,
  treeColliders: readonly TreeColliderDescriptor[],
  obstacleColliders: readonly BallObstacleDescriptor[]
): Promise<PlayerBallSystem> {
  await RAPIER.init();

  const group = new Group();
  group.name = "third-person rolling player ball";

  const physics = new RAPIER.World({ x: 0, y: -16.5, z: 0 });
  physics.timestep = fixedStep;
  createTerrainCollider(physics, terrain);
  createTreeColliders(physics, treeColliders);
  createStoneColliders(physics, obstacleColliders);

  const spawnZ = -48;
  const spawnX = streamCenterX(config.seed, spawnZ) - 2.8;
  const spawnY = terrain.heightAt(spawnX, spawnZ) + ballRadius + 0.45;
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .setLinearDamping(0.18)
      .setAngularDamping(0.32)
      .setCcdEnabled(true)
      .setCanSleep(false)
  );
  physics.createCollider(
    RAPIER.ColliderDesc.ball(ballRadius)
      .setDensity(1.05)
      .setFriction(1.18)
      .setRestitution(0.045),
    body
  );

  const material = new MeshStandardMaterial({
    color: 0xa9c35f,
    roughness: 0.64,
    metalness: 0,
    emissive: new Color(0x24330d),
    emissiveIntensity: 0.12
  });
  const stripeMaterial = new MeshStandardMaterial({
    color: 0x243016,
    roughness: 0.72,
    metalness: 0
  });
  const ball = new Mesh(new SphereGeometry(ballRadius, 40, 24), material);
  ball.name = "physics rolling player ball";
  ball.castShadow = true;
  ball.receiveShadow = true;

  const equator = new Mesh(
    new TorusGeometry(ballRadius * 1.012, 0.018, 8, 72),
    stripeMaterial
  );
  equator.name = "ball equator rolling stripe";
  const meridian = equator.clone();
  meridian.name = "ball meridian rolling stripe";
  meridian.rotation.x = Math.PI / 2;
  const cross = equator.clone();
  cross.name = "ball cross rolling stripe";
  cross.rotation.y = Math.PI / 2;
  ball.add(equator, meridian, cross);
  group.add(ball);

  let accumulator = 0;
  let orbitYaw = defaultOrbitYaw;
  let orbitPitch = defaultOrbitPitch;
  let wasInWater = false;
  let jumpHeld = false;
  let jumpCooldown = 0;
  let coyoteTimer = 0;
  let cinematicCameraCue: CinematicCameraCue | undefined;
  const waterState: BallWaterState = {
    active: false,
    position: new Vector3(spawnX, spawnY, spawnZ),
    velocity: new Vector3(),
    speed: 0,
    immersion: 0,
    enteredWater: false
  };

  const syncMesh = (): void => {
    const position = body.translation();
    const rotation = body.rotation();
    ball.position.set(position.x, position.y, position.z);
    ball.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  };

  const updateCamera = (
    camera: PerspectiveCamera,
    deltaSeconds: number,
    immediate = false
  ): void => {
    const position = body.translation();
    const velocity = body.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);
    const lookAhead = clamp(2.6 + speed * 0.18, 2.6, 5.6);
    tempForward.set(-Math.sin(orbitYaw), 0, -Math.cos(orbitYaw)).normalize();
    tempTarget.set(
      position.x + tempForward.x * lookAhead * 0.46,
      position.y + cameraTargetLift,
      position.z + tempForward.z * lookAhead * 0.46
    );

    let cameraYaw = orbitYaw;
    let cameraPitch = orbitPitch;
    let activeDistance = cameraDistance;
    let extraCameraLift = 0;
    const cueStrength =
      cinematicCameraCue?.active === true
        ? smoothstep01(clamp(cinematicCameraCue.strength, 0, 1))
        : 0;
    if (cinematicCameraCue && cueStrength > 0.001) {
      tempCinematicTarget.copy(cinematicCameraCue.target);
      tempCinematicTarget.y += cinematicCameraCue.targetLift;
      tempTarget.lerp(tempCinematicTarget, cueStrength);
      const toCueX = cinematicCameraCue.target.x - position.x;
      const toCueZ = cinematicCameraCue.target.z - position.z;
      if (Math.hypot(toCueX, toCueZ) > 0.01) {
        const cueYaw = Math.atan2(-toCueX, -toCueZ);
        cameraYaw = lerpAngle(cameraYaw, cueYaw, cueStrength);
      }
      cameraPitch = lerp(cameraPitch, 0.68, cueStrength);
      activeDistance += cinematicCameraCue.distanceBoost * cueStrength;
      extraCameraLift += cinematicCameraCue.heightBoost * cueStrength;
    }

    const horizontal = Math.cos(cameraPitch) * activeDistance;
    tempDesiredCamera.set(
      tempTarget.x + Math.sin(cameraYaw) * horizontal,
      tempTarget.y +
        Math.sin(cameraPitch) * activeDistance +
        1.15 +
        extraCameraLift,
      tempTarget.z + Math.cos(cameraYaw) * horizontal
    );
    const ground = terrain.heightAt(tempDesiredCamera.x, tempDesiredCamera.z);
    tempDesiredCamera.y = Math.max(tempDesiredCamera.y, ground + 1.15);

    if (immediate) {
      camera.position.copy(tempDesiredCamera);
    } else {
      const follow = 1 - Math.exp(-deltaSeconds * 9);
      camera.position.lerp(tempDesiredCamera, follow);
    }
    camera.lookAt(tempTarget);
  };

  const syncOrbitFromCamera = (camera: PerspectiveCamera): void => {
    const position = body.translation();
    const dx = camera.position.x - position.x;
    const dz = camera.position.z - position.z;
    orbitYaw = Math.atan2(dx, dz);
    const dy = camera.position.y - position.y - 1.15;
    orbitPitch = clamp(
      Math.atan2(dy, Math.max(0.001, Math.hypot(dx, dz))),
      -0.08,
      0.72
    );
  };

  syncMesh();

  return {
    group,
    triangleEstimate:
      geometryTriangles(ball.geometry) +
      geometryTriangles(equator.geometry) * 3,
    drawCallEstimate: 4,
    rotateView(deltaYaw: number, deltaPitch: number): void {
      orbitYaw += deltaYaw;
      orbitPitch = clamp(orbitPitch + deltaPitch, -0.08, 0.72);
    },
    syncOrbitFromCamera,
    update(
      deltaSeconds: number,
      _elapsedSeconds: number,
      input: BallMoveInput,
      camera: PerspectiveCamera
    ): void {
      updateWaterState(
        body,
        terrain,
        config.seed,
        waterState,
        wasInWater
      );
      const grounded = isGroundedForJump(body, terrain, waterState.immersion);
      coyoteTimer = grounded
        ? 0.14
        : Math.max(0, coyoteTimer - deltaSeconds);
      jumpCooldown = Math.max(0, jumpCooldown - deltaSeconds);
      if (input.jump && !jumpHeld && coyoteTimer > 0 && jumpCooldown <= 0) {
        applyJumpImpulse(body, waterState.immersion);
        coyoteTimer = 0;
        jumpCooldown = 0.24;
      }
      jumpHeld = input.jump;
      steerBall(body, input, orbitYaw, deltaSeconds, waterState.immersion);
      applyWaterDrag(body, waterState, deltaSeconds);

      accumulator = Math.min(accumulator + deltaSeconds, fixedStep * 4);
      while (accumulator >= fixedStep) {
        physics.step();
        accumulator -= fixedStep;
      }

      const position = body.translation();
      if (position.y < terrain.heightAt(position.x, position.z) - 8) {
        body.setTranslation(
          {
            x: position.x,
            y: terrain.heightAt(position.x, position.z) + ballRadius + 1.4,
            z: position.z
          },
          true
        );
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      updateWaterState(
        body,
        terrain,
        config.seed,
        waterState,
        wasInWater
      );
      wasInWater = waterState.active;

      syncMesh();
      updateCamera(camera, deltaSeconds);
    },
    resetNearView(camera: PerspectiveCamera): void {
      syncMesh();
      orbitYaw = defaultOrbitYaw;
      orbitPitch = defaultOrbitPitch;
      updateCamera(camera, fixedStep, true);
    },
    getWaterState(): BallWaterState {
      return waterState;
    },
    setCinematicCameraCue(cue: CinematicCameraCue | undefined): void {
      cinematicCameraCue = cue;
    },
    dispose(): void {
      physics.free();
      group.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((materialItem) => materialItem.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
  };
}

function isGroundedForJump(
  body: RigidBody,
  terrain: TerrainSystem,
  waterImmersion: number
): boolean {
  const position = body.translation();
  const velocity = body.linvel();
  const groundY = terrain.heightAt(position.x, position.z);
  const bottom = position.y - ballRadius;
  const waterAllowance = waterImmersion > 0.25 ? 0.34 : 0;
  return bottom <= groundY + 0.38 + waterAllowance && velocity.y < 2.6;
}

function applyJumpImpulse(body: RigidBody, waterImmersion: number): void {
  const velocity = body.linvel();
  const mass = body.mass();
  const jumpSpeed = 8.4 * (1 - waterImmersion * 0.28);
  const neededVelocity = Math.max(0, jumpSpeed - velocity.y);
  body.applyImpulse(
    {
      x: 0,
      y: neededVelocity * mass,
      z: 0
    },
    true
  );
}

function steerBall(
  body: RigidBody,
  input: BallMoveInput,
  orbitYaw: number,
  deltaSeconds: number,
  waterImmersion: number
): void {
  tempMove.set(0, 0, 0);
  tempForward.set(-Math.sin(orbitYaw), 0, -Math.cos(orbitYaw)).normalize();
  tempRight.set(Math.cos(orbitYaw), 0, -Math.sin(orbitYaw)).normalize();

  if (input.forward) {
    tempMove.add(tempForward);
  }
  if (input.backward) {
    tempMove.sub(tempForward);
  }
  if (input.right) {
    tempMove.add(tempRight);
  }
  if (input.left) {
    tempMove.sub(tempRight);
  }

  const current = body.linvel();
  const mass = body.mass();
  if (tempMove.lengthSq() > 0) {
    tempMove.normalize();
    const waterSlowdown = 1 - waterImmersion * 0.42;
    const speed = (input.sprint ? 15.5 : 10.8) * waterSlowdown;
    const steering = Math.min(1, deltaSeconds * (9.2 - waterImmersion * 2.8));
    body.applyImpulse(
      {
        x: (tempMove.x * speed - current.x) * mass * steering,
        y: 0,
        z: (tempMove.z * speed - current.z) * mass * steering
      },
      true
    );
    return;
  }

  const brake = Math.min(1, deltaSeconds * (3.8 + waterImmersion * 5.4));
  body.applyImpulse(
    {
      x: -current.x * mass * brake,
      y: 0,
      z: -current.z * mass * brake
    },
    true
  );
}

function applyWaterDrag(
  body: RigidBody,
  waterState: BallWaterState,
  deltaSeconds: number
): void {
  if (!waterState.active) {
    return;
  }

  const velocity = body.linvel();
  const mass = body.mass();
  const drag = Math.min(0.9, deltaSeconds * (3.4 + waterState.immersion * 5.2));
  const verticalDrag = Math.min(
    0.82,
    deltaSeconds * (1.8 + waterState.immersion * 3.6)
  );
  body.applyImpulse(
    {
      x: -velocity.x * mass * drag,
      y: -velocity.y * mass * verticalDrag,
      z: -velocity.z * mass * drag
    },
    true
  );
}

function updateWaterState(
  body: RigidBody,
  terrain: TerrainSystem,
  seed: number,
  target: BallWaterState,
  wasInWater: boolean
): void {
  const position = body.translation();
  const velocity = body.linvel();
  target.position.set(position.x, position.y, position.z);
  target.velocity.set(velocity.x, velocity.y, velocity.z);
  target.speed = Math.hypot(velocity.x, velocity.z);

  const inStreamLength =
    position.z >= waterStreamStart && position.z <= waterStreamEnd;
  const centerX = streamCenterX(seed, position.z);
  const lateralDistance = Math.abs(position.x - centerX);
  const halfWidth = waterHalfWidth(seed, position.z);
  const waterY = terrain.heightAt(centerX, position.z) + waterSurfaceLift;
  const bottom = position.y - ballRadius;
  const immersion = clamp(
    (waterY - bottom + 0.16) / (ballRadius * 1.45),
    0,
    1
  );
  target.immersion =
    inStreamLength && lateralDistance < halfWidth + ballRadius * 0.75
      ? immersion
      : 0;
  target.active = target.immersion > 0.035;
  target.enteredWater = target.active && !wasInWater;
}

function createTerrainCollider(
  physics: RAPIER.World,
  terrain: TerrainSystem
): void {
  const position = terrain.geometry.getAttribute("position");
  const index = terrain.geometry.getIndex();
  if (!index) {
    throw new Error("Ball physics requires indexed terrain geometry.");
  }

  const vertices = Float32Array.from(position.array as ArrayLike<number>);
  const indices = Uint32Array.from(index.array as ArrayLike<number>);
  physics.createCollider(
    RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(1.08)
  );
}

function createTreeColliders(
  physics: RAPIER.World,
  treeColliders: readonly TreeColliderDescriptor[]
): void {
  for (const tree of treeColliders) {
    physics.createCollider(
      RAPIER.ColliderDesc.cylinder(tree.halfHeight, tree.radius)
        .setTranslation(tree.x, tree.y + tree.halfHeight, tree.z)
        .setFriction(1.2)
        .setRestitution(0.02)
    );
  }
}

function createStoneColliders(
  physics: RAPIER.World,
  obstacleColliders: readonly BallObstacleDescriptor[]
): void {
  for (const obstacle of obstacleColliders) {
    physics.createCollider(
      RAPIER.ColliderDesc.ball(obstacle.radius)
        .setTranslation(obstacle.x, obstacle.y, obstacle.z)
        .setFriction(1.22)
        .setRestitution(0.025)
    );
  }
}

function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return index.count / 3;
  }
  const position = geometry.getAttribute("position");
  return position.count / 3;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
