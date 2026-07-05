import { Group, Mesh } from "three";
import type {
  BallObstacleDescriptor,
  BallWaterState,
  CinematicCameraCue,
  FrameUpdatable,
  WorldConfig
} from "../../types";
import { createTerrain, type TerrainSystem } from "../../world/terrain";
import { terrainMaterial } from "../materials/materials";
import { createScatter } from "../../vegetation/scatter";
import type { TreeColliderDescriptor } from "../../vegetation/scatter";
import { createWater } from "./water";
import { createSkyDetails } from "./sky";
import { createWindDust } from "./windDust";
import { createHeroDressing } from "./heroDressing";
import { createLightShafts } from "./lightShafts";
import { createQualityResetDressing } from "./qualityResetDressing";
import { createLightningStrikeSystem } from "./lightningStrike";

export interface WorldSlice {
  readonly group: Group;
  readonly terrain: TerrainSystem;
  readonly treeColliders: readonly TreeColliderDescriptor[];
  readonly obstacleColliders: readonly BallObstacleDescriptor[];
  readonly updatables: readonly FrameUpdatable[];
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
  readonly instancesByClass: ReturnType<typeof createScatter>["instancesByClass"];
  readonly overlays: readonly HTMLElement[];
  triggerLightning(): void;
  setBallWaterDisturbance(state: BallWaterState): void;
  getCinematicCameraCue(): CinematicCameraCue | undefined;
  dispose(): void;
}

export async function createRavineWorld(
  config: WorldConfig
): Promise<WorldSlice> {
  const terrain = createTerrain(config);
  const group = new Group();
  group.name = "LAAS vertical slice world";

  const terrainMesh = new Mesh(terrain.geometry, terrainMaterial(config.seed));
  terrainMesh.name = "procedural terrain with carved stream channel";
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  group.add(terrainMesh);

  const scatter = createScatter(config, terrain);
  group.add(scatter.group);

  const water = createWater(config, terrain);
  group.add(water.group);

  const windDust = createWindDust(config, terrain);
  group.add(windDust.group);

  const dressing = createHeroDressing(config, terrain);
  group.add(dressing.group);

  const qualityReset = createQualityResetDressing(config, terrain);
  group.add(qualityReset.group);

  const lightning = await createLightningStrikeSystem(config, terrain);
  group.add(lightning.group);

  const lightShafts = createLightShafts(config, terrain);
  group.add(lightShafts.group);

  const sky = createSkyDetails(config);
  group.add(sky.group);

  const instancesByClass = {
    ...scatter.instancesByClass,
    cobble: scatter.instancesByClass.cobble + dressing.cobbleCount,
    rock: scatter.instancesByClass.rock + dressing.rockCount,
    twig: scatter.instancesByClass.twig + dressing.twigCount,
    leaf: scatter.instancesByClass.leaf + dressing.leafCount
  };

  return {
    group,
    terrain,
    treeColliders: scatter.treeColliders,
    obstacleColliders: [
      ...scatter.obstacleColliders,
      ...water.obstacleColliders,
      ...dressing.obstacleColliders
    ],
    updatables: [scatter, qualityReset, lightning, water, windDust, sky],
    triangleEstimate:
      terrain.triangleCount +
      scatter.triangleEstimate +
      water.triangleEstimate +
      windDust.triangleEstimate +
      dressing.triangleEstimate +
      qualityReset.triangleEstimate +
      lightning.triangleEstimate +
      lightShafts.triangleEstimate +
      sky.triangleEstimate,
    drawCallEstimate:
      1 +
      scatter.drawCallEstimate +
      water.drawCallEstimate +
      windDust.drawCallEstimate +
      dressing.drawCallEstimate +
      qualityReset.drawCallEstimate +
      lightning.drawCallEstimate +
      lightShafts.drawCallEstimate +
      sky.drawCallEstimate,
    instancesByClass,
    overlays: [lightning.overlay],
    triggerLightning(): void {
      lightning.trigger();
    },
    setBallWaterDisturbance(state: BallWaterState): void {
      water.setBallDisturbance(state);
      qualityReset.setPlayerBallPosition(state.position);
    },
    getCinematicCameraCue(): CinematicCameraCue | undefined {
      return qualityReset.getCinematicCameraCue();
    },
    dispose(): void {
      lightning.dispose();
    }
  };
}
