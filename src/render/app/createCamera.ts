import { PerspectiveCamera, Vector3 } from "three";
import type { SceneViewConfig } from "../../world/sceneConfig";

export function createCamera(container: HTMLElement, view: SceneViewConfig): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    58,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.08,
    850
  );
  camera.position.copy(view.cameraPosition);
  camera.lookAt(view.lookTarget);
  return camera;
}

export function setCameraView(
  camera: PerspectiveCamera,
  position: Vector3,
  lookTarget: Vector3
): void {
  camera.position.copy(position);
  camera.lookAt(lookTarget);
}
