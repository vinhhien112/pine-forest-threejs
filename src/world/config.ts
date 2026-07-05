import type { PresetId, SceneId, ThermalMode, WorldConfig } from "../types";

const sceneValues = new Set<SceneId>(["ravine", "vista", "gallery", "terrain"]);
const presetValues = new Set<PresetId>(["fast", "high"]);
const thermalValues = new Set<ThermalMode>(["normal", "cool"]);

export function readWorldConfig(location: Location): WorldConfig {
  const params = new URLSearchParams(location.search);
  const seed = readPositiveInteger(params.get("seed"), 1847);
  const scene = readEnum(params.get("scene"), sceneValues, "ravine");
  const preset = readEnum(params.get("preset"), presetValues, "fast");
  const thermal = readEnum(params.get("thermal"), thermalValues, "normal");

  return {
    seed,
    scene,
    preset,
    thermal,
    worldScale: preset === "high" && thermal !== "cool" ? 1.35 : 1
  };
}

function readPositiveInteger(rawValue: string | null, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function readEnum<TValue extends string>(
  rawValue: string | null,
  allowed: ReadonlySet<TValue>,
  fallback: TValue
): TValue {
  if (rawValue && allowed.has(rawValue as TValue)) {
    return rawValue as TValue;
  }

  return fallback;
}
