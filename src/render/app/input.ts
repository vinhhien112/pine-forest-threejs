import { Euler, PerspectiveCamera, Vector3 } from "three";
import type { PlayerBallSystem } from "../objects/playerBall";

type MoveKey = "forward" | "backward" | "left" | "right" | "up" | "down" | "sprint";

const keyMap = new Map<string, MoveKey>([
  ["KeyW", "forward"],
  ["KeyS", "backward"],
  ["KeyA", "left"],
  ["KeyD", "right"],
  ["Space", "up"],
  ["KeyC", "down"],
  ["ShiftLeft", "sprint"],
  ["ShiftRight", "sprint"]
]);

export interface CameraController {
  readonly element: HTMLElement;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export function createCameraController(
  camera: PerspectiveCamera,
  canvas: HTMLElement,
  onSceneHotkey: (sceneIndex: number) => void,
  onToggleHud: () => void,
  onLightning: () => void,
  playerBall?: PlayerBallSystem
): CameraController {
  const pressed = new Set<MoveKey>();
  const yawPitch = new Euler(0, 0, 0, "YXZ");
  const direction = new Vector3();
  const right = new Vector3();
  const velocity = new Vector3();
  let mode: "ball" | "free" = playerBall ? "ball" : "free";

  yawPitch.setFromQuaternion(camera.quaternion);

  const onKeyDown = (event: KeyboardEvent): void => {
    const move = keyMap.get(event.code);
    if (move) {
      pressed.add(move);
      event.preventDefault();
      return;
    }

    if (event.code === "F3") {
      onToggleHud();
      event.preventDefault();
      return;
    }

    if (event.code === "KeyL") {
      onLightning();
      event.preventDefault();
      return;
    }

    if (event.code === "KeyV" && playerBall) {
      mode = mode === "ball" ? "free" : "ball";
      if (mode === "free") {
        yawPitch.setFromQuaternion(camera.quaternion);
      } else {
        playerBall.syncOrbitFromCamera(camera);
      }
      event.preventDefault();
      return;
    }

    if (/^Digit[1-4]$/.test(event.code)) {
      onSceneHotkey(Number.parseInt(event.code.slice(5), 10));
      event.preventDefault();
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const move = keyMap.get(event.code);
    if (move) {
      pressed.delete(move);
      event.preventDefault();
    }
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    if (mode === "ball" && playerBall) {
      playerBall.rotateView(-event.movementX * 0.0022, -event.movementY * 0.0018);
      return;
    }

    yawPitch.y -= event.movementX * 0.002;
    yawPitch.x -= event.movementY * 0.002;
    yawPitch.x = Math.max(-1.28, Math.min(1.28, yawPitch.x));
    camera.quaternion.setFromEuler(yawPitch);
  };

  const onClick = (): void => {
    void canvas.requestPointerLock();
  };

  const clearPressed = (): void => {
    pressed.clear();
  };

  const onPointerLockChange = (): void => {
    if (document.pointerLockElement !== canvas) {
      clearPressed();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearPressed);
  window.addEventListener("mousemove", onMouseMove);
  document.addEventListener("visibilitychange", clearPressed);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("click", onClick);

  return {
    element: canvas,
    update(deltaSeconds: number): void {
      if (document.pointerLockElement !== canvas) {
        if (mode === "ball" && playerBall) {
          playerBall.update(
            deltaSeconds,
            0,
            {
              forward: false,
              backward: false,
              left: false,
              right: false,
              sprint: false,
              jump: false
            },
            camera
          );
        }
        return;
      }

      if (mode === "ball" && playerBall) {
        playerBall.update(
          deltaSeconds,
          0,
          {
            forward: pressed.has("forward"),
            backward: pressed.has("backward"),
            left: pressed.has("left"),
            right: pressed.has("right"),
            sprint: pressed.has("sprint"),
            jump: pressed.has("up")
          },
          camera
        );
        return;
      }

      direction.set(0, 0, 0);

      if (pressed.has("forward")) {
        direction.z -= 1;
      }
      if (pressed.has("backward")) {
        direction.z += 1;
      }
      if (pressed.has("left")) {
        direction.x -= 1;
      }
      if (pressed.has("right")) {
        direction.x += 1;
      }
      if (pressed.has("up")) {
        direction.y += 1;
      }
      if (pressed.has("down")) {
        direction.y -= 1;
      }

      if (direction.lengthSq() === 0) {
        return;
      }

      direction.normalize();
      const speed = pressed.has("sprint") ? 28 : 10;
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();
      right.copy(forward).cross(camera.up).normalize();
      velocity
        .set(0, direction.y, 0)
        .addScaledVector(forward, -direction.z)
        .addScaledVector(right, direction.x)
        .multiplyScalar(speed * deltaSeconds);
      camera.position.add(velocity);
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearPressed);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", clearPressed);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      canvas.removeEventListener("click", onClick);
    }
  };
}
