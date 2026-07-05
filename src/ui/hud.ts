import type { DebugMetrics } from "../types";

export interface HudController {
  readonly element: HTMLElement;
  update(metrics: DebugMetrics): void;
}

export function createHud(): HudController {
  const element = document.createElement("section");
  element.className = "hud";
  element.dataset.testid = "hud";

  return {
    element,
    update(metrics: DebugMetrics): void {
      element.innerHTML = `
        <div class="hud__title"><strong>LAAS</strong><span aria-hidden="true">&#9776;</span></div>
        ${row("F3 PERF", `${formatCompact(metrics.triangles)} tris`)}
        ${row(`${metrics.fps.toFixed(0)} fps`, `seed=${metrics.seed}`)}
        ${row("Thermal", metrics.thermal)}
        ${row("Biome", metrics.biome)}
        ${statusRow("Bounce fill")}
        ${statusRow("Cloud layer")}
      `;
    }
  };
}

export function createControlsHint(): HTMLElement {
  const element = document.createElement("aside");
  element.className = "controls-hint";
  element.textContent =
    "Click viewport to look. Ball mode: WASD roll, Space jump, touchpad look, Shift boost. V free camera, L lightning, 1-4 scene, F3 HUD.";
  return element;
}

function row(label: string, value: string): string {
  return `<div class="hud__label">${label}</div><div class="hud__value">${value}</div>`;
}

function statusRow(label: string): string {
  return `<div class="hud__label">${label}</div><div class="hud__status" aria-label="enabled"></div>`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return String(Math.round(value));
}
