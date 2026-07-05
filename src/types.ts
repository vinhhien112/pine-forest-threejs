import type { Vector3 } from "three";

export type SceneId = "ravine" | "vista" | "gallery" | "terrain";

export type PresetId = "fast" | "high";

export type ThermalMode = "normal" | "cool";

export type BiomeId = "forest" | "ravine" | "meadow" | "alpine" | "wetland";

export type ScatterClass =
  | "tree"
  | "grass"
  | "fern"
  | "shrub"
  | "flower"
  | "cobble"
  | "twig"
  | "leaf"
  | "rock";

export interface WorldConfig {
  readonly seed: number;
  readonly preset: PresetId;
  readonly scene: SceneId;
  readonly thermal: ThermalMode;
  readonly worldScale: number;
}

export interface DebugMetrics {
  readonly fps: number;
  readonly frameMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly seed: number;
  readonly scene: SceneId;
  readonly thermal: ThermalMode;
  readonly biome: BiomeId;
  readonly instancesByClass: Readonly<Record<ScatterClass, number>>;
  readonly warnings: readonly string[];
}

export interface FrameUpdatable {
  update(deltaSeconds: number, elapsedSeconds: number): void;
}

export interface BallWaterState {
  active: boolean;
  position: Vector3;
  velocity: Vector3;
  speed: number;
  immersion: number;
  enteredWater: boolean;
}

export interface CinematicCameraCue {
  active: boolean;
  target: Vector3;
  strength: number;
  distanceBoost: number;
  heightBoost: number;
  targetLift: number;
}

export interface BallObstacleDescriptor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}
