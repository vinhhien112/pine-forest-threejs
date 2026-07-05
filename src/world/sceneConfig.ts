import type { SceneId } from "../types";
import { Vector3 } from "three";

export interface SceneViewConfig {
  readonly cameraPosition: Vector3;
  readonly lookTarget: Vector3;
  readonly biomeLabel: string;
}

export function getSceneViewConfig(scene: SceneId): SceneViewConfig {
  switch (scene) {
    case "vista":
      return {
        cameraPosition: new Vector3(-46, 24, -76),
        lookTarget: new Vector3(12, 12, 42),
        biomeLabel: "Alpine Vista"
      };
    case "gallery":
      return {
        cameraPosition: new Vector3(0, 9, -32),
        lookTarget: new Vector3(0, 5, 0),
        biomeLabel: "Specimen Gallery"
      };
    case "terrain":
      return {
        cameraPosition: new Vector3(0, 65, -74),
        lookTarget: new Vector3(0, 0, 0),
        biomeLabel: "Terrain Debug"
      };
    case "ravine":
      return {
        cameraPosition: new Vector3(-10, 5.7, -36),
        lookTarget: new Vector3(2, 2.5, 16),
        biomeLabel: "Ravine"
      };
  }
}
