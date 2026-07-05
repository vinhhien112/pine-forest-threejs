import type { DebugMetrics, ScatterClass, SceneId, BiomeId, ThermalMode } from "../types";

const scatterDefaults: Record<ScatterClass, number> = {
  tree: 0,
  grass: 0,
  fern: 0,
  shrub: 0,
  flower: 0,
  cobble: 0,
  twig: 0,
  leaf: 0,
  rock: 0
};

export interface MetricsInput {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly instancesByClass: Readonly<Partial<Record<ScatterClass, number>>>;
  readonly seed: number;
  readonly scene: SceneId;
  readonly thermal: ThermalMode;
  readonly biome: BiomeId;
  readonly warnings: readonly string[];
}

export class PerfMeter {
  private lastSecond = performance.now();
  private frameCounter = 0;
  private fps = 0;
  private frameMs = 0;

  markFrame(deltaSeconds: number, input: MetricsInput): DebugMetrics {
    const now = performance.now();
    this.frameCounter += 1;
    this.frameMs = deltaSeconds * 1000;

    if (now - this.lastSecond >= 500) {
      this.fps = (this.frameCounter * 1000) / (now - this.lastSecond);
      this.frameCounter = 0;
      this.lastSecond = now;
    }

    return {
      fps: this.fps,
      frameMs: this.frameMs,
      drawCalls: input.drawCalls,
      triangles: input.triangles,
      instancesByClass: {
        ...scatterDefaults,
        ...input.instancesByClass
      },
      seed: input.seed,
      scene: input.scene,
      thermal: input.thermal,
      biome: input.biome,
      warnings: input.warnings
    };
  }
}
