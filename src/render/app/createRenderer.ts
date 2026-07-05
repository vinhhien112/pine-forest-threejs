import { AgXToneMapping, SRGBColorSpace, WebGPURenderer } from "three/webgpu";
import type { WorldConfig } from "../../types";

export async function createRenderer(
  container: HTMLElement,
  config: WorldConfig
): Promise<WebGPURenderer> {
  const coolMode = config.thermal === "cool";
  const renderer = new WebGPURenderer({
    antialias: true,
    alpha: false
  });

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coolMode ? 1.1 : 1.6));
  renderer.setSize(container.clientWidth, container.clientHeight);
  await renderer.init();

  container.appendChild(renderer.domElement);
  renderer.domElement.dataset.testid = "laas-canvas";

  return renderer;
}
