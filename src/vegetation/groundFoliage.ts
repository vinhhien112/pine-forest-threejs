import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshPhysicalMaterial,
  Vector2,
  Vector3
} from "three";
import { createFoliageTextures } from "../render/materials/proceduralTextures";

type FoliageDetail = "field" | "hero";

const fernStem = new Color(0x345233);
const fernBase = new Color(0x173f25);
const fernMid = new Color(0x39733a);
const fernTip = new Color(0x87a753);
const grassBase = new Color(0x16321d);
const grassMid = new Color(0x3e6b34);
const grassTip = new Color(0x91a85c);
const scratchColor = new Color();

export function createFernFrondGeometry(
  detail: FoliageDetail = "field"
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const leafletPairs = detail === "hero" ? 19 : 11;
  const leafletSegments = detail === "hero" ? 7 : 3;
  const length = detail === "hero" ? 2.58 : 2.12;

  appendCurvedStem(
    positions,
    colors,
    uvs,
    indices,
    length,
    detail === "hero" ? 8 : 6
  );

  for (let pair = 0; pair < leafletPairs; pair += 1) {
    const t = (pair + 1) / (leafletPairs + 1);
    const z = t * length;
    const y = fernArch(t);
    const reach =
      Math.sin(t * Math.PI) ** 0.76 *
      (detail === "hero" ? 0.66 : 0.52) *
      (1 - t * 0.18);
    const sweep =
      0.08 +
      t * 0.3 +
      Math.sin(pair * 2.17) * 0.035;
    const bladeWidth =
      (detail === "hero" ? 0.068 : 0.052) *
      (0.75 + Math.sin(t * Math.PI) * 0.25);

    for (const side of [-1, 1] as const) {
      const start = new Vector3(side * 0.015, y, z);
      const tip = new Vector3(
        side * reach,
        y + Math.sin(t * Math.PI) * 0.045,
        z + sweep
      );
      const tone = 0.18 + t * 0.5 + (pair % 3) * 0.045;
      scratchColor
        .copy(fernBase)
        .lerp(fernMid, Math.min(1, tone * 1.45))
        .lerp(fernTip, Math.max(0, tone - 0.5) * 0.85);
      appendLeafletRibbon(
        positions,
        colors,
        uvs,
        indices,
        start,
        tip,
        bladeWidth,
        leafletSegments,
        side,
        scratchColor,
        pair
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createFernMaterial(): MeshPhysicalMaterial {
  const textures = createFoliageTextures(6_901);
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new Vector2(0.52, 0.68),
    roughnessMap: textures.roughnessMap,
    side: DoubleSide,
    roughness: 0.72,
    metalness: 0,
    envMapIntensity: 0.78,
    clearcoat: 0.055,
    clearcoatRoughness: 0.68,
    sheen: 0.26,
    sheenColor: new Color(0x7e9f63),
    sheenRoughness: 0.82,
    emissive: new Color(0x071409),
    emissiveIntensity: 0.045
  });
}

export function createGrassTuftGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const bladeCount = 10;
  const segments = 4;

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle =
      (blade / bladeCount) * Math.PI * 2 +
      Math.sin(blade * 7.13) * 0.22;
    const height = 0.58 + (blade % 5) * 0.09;
    const bend = 0.12 + (blade % 4) * 0.045;
    const baseOffset = 0.025 + (blade % 3) * 0.018;
    const width = 0.045 + (blade % 3) * 0.008;
    const sideX = -Math.sin(angle);
    const sideZ = Math.cos(angle);
    const base = positions.length / 3;

    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const centerX =
        Math.cos(angle) * (baseOffset + bend * t * t);
      const centerZ =
        Math.sin(angle) * (baseOffset + bend * t * t);
      const centerY = height * (t - t * t * 0.08);
      const halfWidth =
        width *
        (1 - t) ** 0.78 *
        (0.9 + Math.sin((t + blade) * 4.7) * 0.08);
      positions.push(
        centerX - sideX * halfWidth,
        centerY,
        centerZ - sideZ * halfWidth,
        centerX + sideX * halfWidth,
        centerY,
        centerZ + sideZ * halfWidth
      );
      uvs.push(0, t, 1, t);
      scratchColor
        .copy(grassBase)
        .lerp(grassMid, Math.min(1, t * 1.45 + (blade % 3) * 0.06))
        .lerp(grassTip, Math.max(0, t - 0.62) * 0.62);
      pushColor(colors, scratchColor, 2);
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const a = base + segment * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createGrassMaterial(): MeshPhysicalMaterial {
  const textures = createFoliageTextures(7_103);
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new Vector2(0.36, 0.58),
    roughnessMap: textures.roughnessMap,
    side: DoubleSide,
    roughness: 0.79,
    metalness: 0,
    envMapIntensity: 0.62,
    clearcoat: 0.035,
    clearcoatRoughness: 0.74,
    sheen: 0.18,
    sheenColor: new Color(0x86a36e),
    sheenRoughness: 0.86,
    emissive: new Color(0x061107),
    emissiveIntensity: 0.035
  });
}

function appendCurvedStem(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  length: number,
  segments: number
): void {
  const base = positions.length / 3;
  for (let segment = 0; segment <= segments; segment += 1) {
    const t = segment / segments;
    const z = t * length;
    const y = fernArch(t);
    const halfWidth = 0.025 * (1 - t * 0.58);
    positions.push(-halfWidth, y, z, halfWidth, y, z);
    uvs.push(0, t, 1, t);
    pushColor(colors, fernStem, 2);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const a = base + segment * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
}

function appendLeafletRibbon(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  start: Vector3,
  tip: Vector3,
  width: number,
  segments: number,
  side: -1 | 1,
  color: Color,
  phase: number
): void {
  const direction = tip.clone().sub(start);
  const ribbonColor = color.clone();
  const length = direction.length();
  const forwardX = direction.x / length;
  const forwardZ = direction.z / length;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const base = positions.length / 3;

  for (let segment = 0; segment <= segments; segment += 1) {
    const t = segment / segments;
    const serration =
      (segment === 0 || segment === segments
        ? 0.84
        : segment % 2 === 0
          ? 0.74
          : 1) *
      (0.96 + Math.sin(phase * 1.7) * 0.04);
    const halfWidth =
      Math.sin(t * Math.PI) ** 0.72 *
      width *
      serration;
    const sweep = Math.sin(t * Math.PI) * 0.035 * side;
    const centerX = start.x + direction.x * t;
    const centerY =
      start.y +
      direction.y * t +
      Math.sin(t * Math.PI) * 0.025;
    const centerZ = start.z + direction.z * t + sweep;
    positions.push(
      centerX - rightX * halfWidth,
      centerY,
      centerZ - rightZ * halfWidth,
      centerX + rightX * halfWidth,
      centerY,
      centerZ + rightZ * halfWidth
    );
    uvs.push(0, t, 1, t);
    scratchColor.copy(ribbonColor).multiplyScalar(0.76 + t * 0.3);
    pushColor(colors, scratchColor, 2);
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const a = base + segment * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
}

function fernArch(t: number): number {
  return Math.sin(t * Math.PI) * 0.42 - t * t * 0.08;
}

function pushColor(colors: number[], color: Color, count: number): void {
  for (let index = 0; index < count; index += 1) {
    colors.push(color.r, color.g, color.b);
  }
}
