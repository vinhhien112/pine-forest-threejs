import { Scene, Timer, Vector3 } from "three";
import { PMREMGenerator, RenderPipeline } from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import {
  mrt,
  normalView,
  output,
  pass,
  vec3,
  vec4
} from "three/tsl";
import { readWorldConfig } from "../../world/config";
import { getSceneViewConfig, type SceneViewConfig } from "../../world/sceneConfig";
import { sampleTerrain, streamCenterX } from "../../world/terrain";
import { createHud, createControlsHint } from "../../ui/hud";
import { PerfMeter } from "../../diagnostics/perf";
import { createCamera, setCameraView } from "./createCamera";
import { createRenderer } from "./createRenderer";
import { createCameraController } from "./input";
import { getWebGPUStatus, renderWebGPUError } from "./webgpu";
import { addLighting } from "../lights";
import { createRavineWorld } from "../objects/ravineScene";
import { createPlayerBallSystem } from "../objects/playerBall";
import type { SceneId, ThermalMode } from "../../types";

const sceneHotkeys: readonly SceneId[] = ["ravine", "vista", "gallery", "terrain"];

export async function startLaas(root: HTMLElement): Promise<void> {
  const shell = document.createElement("main");
  shell.className = "laas-shell";
  root.appendChild(shell);

  const webgpu = getWebGPUStatus();
  if (!webgpu.supported) {
    renderWebGPUError(root, webgpu.reason ?? "Unknown WebGPU startup failure.");
    return;
  }

  const config = readWorldConfig(window.location);
  const scene = new Scene();
  addLighting(scene);

  const viewConfig = resolveTerrainAwareView(config.scene, config.seed);
  const camera = createCamera(shell, viewConfig);
  const renderer = await createRenderer(shell, config);
  const roomEnvironment = new RoomEnvironment();
  const pmremGenerator = new PMREMGenerator(renderer);
  const environmentTarget = pmremGenerator.fromScene(
    roomEnvironment,
    0.055,
    0.1,
    100,
    { size: 64 }
  );
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.18;
  const world = await createRavineWorld(config);
  scene.add(world.group);
  const playerBall = await createPlayerBallSystem(
    config,
    world.terrain,
    world.treeColliders,
    world.obstacleColliders
  );
  scene.add(playerBall.group);
  playerBall.resetNearView(camera);
  const renderPipeline = createRenderPipeline(
    renderer,
    scene,
    camera,
    config.thermal
  );

  const hud = createHud();
  const controlsHint = createControlsHint();
  root.append(...world.overlays, hud.element, controlsHint);

  const perf = new PerfMeter();
  const timer = new Timer();
  timer.connect(document);
  let hudVisible = true;
  let animationFrame = 0;
  let running = true;

  const controller = createCameraController(
    camera,
    renderer.domElement,
    (sceneIndex) => {
      const nextScene = sceneHotkeys[sceneIndex - 1];
      if (!nextScene) {
        return;
      }
      const nextView = resolveTerrainAwareView(nextScene, config.seed);
      setCameraView(camera, nextView.cameraPosition, nextView.lookTarget);
      window.history.replaceState(
        null,
        "",
        buildSceneQuery(config.seed, nextScene, config.preset, config.thermal)
      );
    },
    () => {
      hudVisible = !hudVisible;
      hud.element.style.display = hudVisible ? "grid" : "none";
    },
    () => {
      world.triggerLightning();
    },
    playerBall
  );

  const resize = (): void => {
    const width = shell.clientWidth;
    const height = Math.max(1, shell.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", () => controller.dispose(), { once: true });

  const warnings = createWarnings(world.triangleEstimate + playerBall.triangleEstimate);
  const targetFrameIntervalMs = config.thermal === "cool" ? 1000 / 24 : 0;
  let nextRenderTimestamp = 0;

  const animate = (timestamp: number): void => {
    if (!running) {
      return;
    }

    if (
      targetFrameIntervalMs > 0 &&
      nextRenderTimestamp > 0 &&
      timestamp < nextRenderTimestamp
    ) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }
    if (targetFrameIntervalMs > 0) {
      nextRenderTimestamp =
        nextRenderTimestamp === 0 || timestamp - nextRenderTimestamp > targetFrameIntervalMs * 2
          ? timestamp + targetFrameIntervalMs
          : nextRenderTimestamp + targetFrameIntervalMs;
    }

    timer.update(timestamp);
    const deltaSeconds = Math.min(timer.getDelta(), 0.08);
    const elapsedSeconds = timer.getElapsed();
    controller.update(deltaSeconds);
    world.setBallWaterDisturbance(playerBall.getWaterState());
    playerBall.setCinematicCameraCue(world.getCinematicCameraCue());
    world.updatables.forEach((updatable) =>
      updatable.update(deltaSeconds, elapsedSeconds)
    );

    renderPipeline.render();

    const metrics = perf.markFrame(deltaSeconds, {
      drawCalls: world.drawCallEstimate + playerBall.drawCallEstimate,
      triangles: world.triangleEstimate + playerBall.triangleEstimate,
      instancesByClass: world.instancesByClass,
      seed: config.seed,
      scene: currentSceneFromUrl(config.scene),
      thermal: config.thermal,
      biome: "ravine",
      warnings
    });

    hud.update(metrics);
    if (running) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  };

  animationFrame = window.requestAnimationFrame(animate);
  window.addEventListener(
    "pagehide",
    () => {
      running = false;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      controller.dispose();
      playerBall.dispose();
      world.dispose();
      timer.dispose();
      renderPipeline.dispose();
      environmentTarget.dispose();
      roomEnvironment.dispose();
      pmremGenerator.dispose();
    },
    { once: true }
  );
}

function createRenderPipeline(
  renderer: Awaited<ReturnType<typeof createRenderer>>,
  scene: Scene,
  camera: ReturnType<typeof createCamera>,
  thermal: ThermalMode
): RenderPipeline {
  const scenePass = pass(scene, camera);
  scenePass.setMRT(
    mrt({
      output,
      normal: normalView
    })
  );

  const sceneColor = scenePass.getTextureNode("output");
  const sceneNormal = scenePass.getTextureNode("normal");
  const sceneDepth = scenePass.getTextureNode("depth");
  const gtao = ao(sceneDepth, sceneNormal, camera);
  gtao.resolutionScale = thermal === "cool" ? 0.25 : 0.5;
  gtao.radius.value = thermal === "cool" ? 0.58 : 0.72;
  gtao.thickness.value = thermal === "cool" ? 1.1 : 1.4;
  gtao.distanceFallOff.value = 0.82;
  gtao.scale.value = thermal === "cool" ? 0.72 : 1.08;
  gtao.samples.value = thermal === "cool" ? 3 : 8;

  const contact = gtao.getTextureNode().r.mul(0.58).add(0.42);
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = sceneColor.mul(vec4(vec3(contact), 1));
  return pipeline;
}

function buildSceneQuery(
  seed: number,
  scene: SceneId,
  preset: string,
  thermal: ThermalMode
): string {
  const params = new URLSearchParams({
    seed: String(seed),
    scene,
    preset
  });
  if (thermal !== "normal") {
    params.set("thermal", thermal);
  }
  return `?${params.toString()}`;
}

function createWarnings(triangleEstimate: number): readonly string[] {
  const warnings: string[] = [
    "v0 slice: full LAAS v2 floors are deferred; see DEVIATIONS.md"
  ];

  if (triangleEstimate < 3_000_000) {
    warnings.push("triangle floor not claimed in fast slice");
  }

  return warnings;
}

function resolveTerrainAwareView(scene: SceneId, seed: number): SceneViewConfig {
  const base = getSceneViewConfig(scene);
  if (scene === "ravine") {
    const cameraZ = -50;
    const targetZ = 42;
    const cameraX = streamCenterX(seed, cameraZ) - 0.7;
    const targetX = streamCenterX(seed, targetZ);
    const cameraGround = sampleTerrain(seed, cameraX, cameraZ);
    const targetGround = sampleTerrain(seed, targetX, targetZ);

    return {
      cameraPosition: new Vector3(cameraX, cameraGround.height + 2.85, cameraZ),
      lookTarget: new Vector3(targetX, targetGround.height + 3.8, targetZ),
      biomeLabel: base.biomeLabel
    };
  }

  const cameraGround = sampleTerrain(seed, base.cameraPosition.x, base.cameraPosition.z);
  const targetGround = sampleTerrain(seed, base.lookTarget.x, base.lookTarget.z);
  const cameraPosition = new Vector3(
    base.cameraPosition.x,
    cameraGround.height + cameraLiftForScene(scene),
    base.cameraPosition.z
  );
  const lookTarget = new Vector3(
    base.lookTarget.x,
    targetGround.height + targetLiftForScene(scene),
    base.lookTarget.z
  );

  return {
    cameraPosition,
    lookTarget,
    biomeLabel: base.biomeLabel
  };
}

function cameraLiftForScene(scene: SceneId): number {
  switch (scene) {
    case "vista":
      return 18;
    case "gallery":
      return 8;
    case "terrain":
      return 72;
    case "ravine":
      return 6.2;
  }
}

function targetLiftForScene(scene: SceneId): number {
  switch (scene) {
    case "vista":
      return 10;
    case "gallery":
      return 4;
    case "terrain":
      return 0;
    case "ravine":
      return 4.4;
  }
}

function currentSceneFromUrl(fallback: SceneId): SceneId {
  const rawScene = new URLSearchParams(window.location.search).get("scene");
  if (rawScene === "ravine" || rawScene === "vista" || rawScene === "gallery" || rawScene === "terrain") {
    return rawScene;
  }
  return fallback;
}
