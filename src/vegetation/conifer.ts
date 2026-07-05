import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector3
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ConiferCrownOptions {
  readonly levels?: number;
  readonly branches?: number;
  readonly crossed?: boolean;
}

export interface CoupledConiferOptions {
  readonly trunkOffsetY: number;
  readonly crownOffsetY: number;
  readonly crownScale: Readonly<Vector3>;
}

const branchColor = new Color(0x3c2c1b);
const darkNeedle = new Color(0x174024);
const midNeedle = new Color(0x367f3d);
const sunNeedle = new Color(0xb0ca70);
const scratchColor = new Color();
const scratchStart = new Vector3();
const scratchEnd = new Vector3();
const scratchDirection = new Vector3();
const scratchRight = new Vector3();
const scratchLift = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const tau = Math.PI * 2;

interface ConiferNeedleTextures {
  readonly map: DataTexture;
  readonly alphaMap: DataTexture;
  readonly roughnessMap: DataTexture;
}

let needleTextures: ConiferNeedleTextures | undefined;

export function createCoupledConiferGeometry(
  trunkSource: BufferGeometry,
  crownSource: BufferGeometry,
  options: CoupledConiferOptions
): BufferGeometry {
  const trunk = trunkSource.clone();
  const crown = crownSource.clone();
  ensureWhiteVertexColors(trunk);
  trunk.translate(0, options.trunkOffsetY, 0);
  crown.scale(
    options.crownScale.x,
    options.crownScale.y,
    options.crownScale.z
  );
  crown.translate(0, options.crownOffsetY, 0);

  const geometry = mergeGeometries([trunk, crown], true);
  trunk.dispose();
  crown.dispose();
  if (!geometry) {
    throw new Error("Unable to merge wind-coupled conifer geometry.");
  }

  geometry.computeBoundingSphere();
  return geometry;
}

export function createConiferCrownGeometry(
  options: ConiferCrownOptions = {}
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const levels = options.levels ?? 18;
  const branches = options.branches ?? 12;
  const hangingNeedles = options.crossed === false ? 2 : 4;
  const sprayCards = options.crossed === false ? 4 : 6;

  for (let level = 0; level < levels; level += 1) {
    const t = level / Math.max(1, levels - 1);
    const lowerGrowth = 1 - t;
    const y = -7.35 + t * 14.7;
    const radius = 0.16 + lowerGrowth ** 0.82 * 5.42;
    const droop = 0.24 + lowerGrowth ** 1.18 * 1.5;
    const branchWidth = 0.065 + lowerGrowth * 0.055;
    const whorlOffset = Math.sin(level * 2.13) * 0.19;

    for (let branch = 0; branch < branches; branch += 1) {
      const angle =
        (branch / branches) * Math.PI * 2 +
        level * 0.39 +
        whorlOffset;
      const innerRadius = 0.08 + radius * 0.035;
      const branchVariation =
        0.9 +
        Math.sin(level * 2.37 + branch * 5.11) * 0.12 +
        Math.cos(level * 5.03 - branch * 1.71) * 0.07;
      const outerRadius = radius * branchVariation;
      const shelfLift = Math.sin(branch * 3.9 + level * 1.7) * 0.12;
      scratchStart.set(
        Math.cos(angle) * innerRadius,
        y + 0.22 + shelfLift,
        Math.sin(angle) * innerRadius
      );
      scratchEnd.set(
        Math.cos(angle) * outerRadius,
        y - droop,
        Math.sin(angle) * outerRadius
      );

      appendBranchRibbon(
        positions,
        colors,
        uvs,
        indices,
        scratchStart,
        scratchEnd,
        branchWidth
      );

      const branchDirection = new Vector3()
        .subVectors(scratchEnd, scratchStart)
        .normalize();
      const branchSide = new Vector3(
        -Math.sin(angle),
        0,
        Math.cos(angle)
      );
      const sunAmount = Math.max(0, Math.sin(angle - 0.72)) * 0.28;
      const baseBrightness = 0.24 + lowerGrowth * 0.22 + sunAmount;

      scratchColor
        .copy(darkNeedle)
        .lerp(midNeedle, Math.min(1, baseBrightness * 1.8))
        .lerp(sunNeedle, Math.max(0, baseBrightness - 0.38) * 1.25);

      appendLayeredBoughSurface(
        positions,
        colors,
        uvs,
        indices,
        scratchStart.clone().addScaledVector(branchDirection, radius * 0.055),
        scratchEnd.clone().addScaledVector(worldUp, 0.06 + lowerGrowth * 0.05),
        branchSide,
        0.46 + lowerGrowth * 0.7,
        scratchColor,
        level * 1.27 + branch * 2.91,
        lowerGrowth
      );
      appendBoughEdgeFingers(
        positions,
        colors,
        uvs,
        indices,
        scratchStart,
        scratchEnd,
        branchDirection,
        branchSide,
        0.16 + lowerGrowth * 0.28,
        scratchColor,
        level * 0.71 + branch * 1.83,
        lowerGrowth,
        options.crossed === false ? 2 : 4
      );

      if (options.crossed !== false) {
        scratchLift.copy(branchSide).multiplyScalar(0.11 + lowerGrowth * 0.08);
        appendLayeredBoughSurface(
          positions,
          colors,
          uvs,
          indices,
          scratchStart
            .clone()
            .addScaledVector(branchDirection, radius * 0.12)
            .add(scratchLift),
          scratchEnd
            .clone()
            .addScaledVector(branchSide, 0.16 + lowerGrowth * 0.2)
            .addScaledVector(worldUp, -0.08),
          branchSide,
          0.3 + lowerGrowth * 0.42,
          scratchColor,
          level * 2.63 + branch * 1.37,
          lowerGrowth
        );
        appendLayeredBoughSurface(
          positions,
          colors,
          uvs,
          indices,
          scratchStart
            .clone()
            .addScaledVector(branchDirection, radius * 0.16)
            .addScaledVector(branchSide, -0.09 - lowerGrowth * 0.06),
          scratchEnd
            .clone()
            .addScaledVector(branchSide, -0.13 - lowerGrowth * 0.17)
            .addScaledVector(worldUp, -0.12),
          branchSide,
          0.26 + lowerGrowth * 0.36,
          scratchColor,
          level * 0.97 + branch * 3.47,
          lowerGrowth
        );
      }

      for (let spray = 0; spray < sprayCards; spray += 1) {
        const along = 0.18 + spray / (sprayCards + 0.35);
        const jitter = Math.sin(level * 7.17 + branch * 3.11 + spray * 5.73);
        const side = spray % 2 === 0 ? 1 : -1;
        const start = scratchStart
          .clone()
          .lerp(scratchEnd, along)
          .addScaledVector(branchSide, side * (0.05 + lowerGrowth * 0.04));
        const end = scratchStart
          .clone()
          .lerp(scratchEnd, Math.min(0.98, along + 0.28))
          .addScaledVector(branchSide, side * (0.2 + lowerGrowth * 0.17))
          .addScaledVector(worldUp, -0.16 - lowerGrowth * 0.2 + jitter * 0.045);
        scratchColor
          .copy(darkNeedle)
          .lerp(midNeedle, 0.5 + lowerGrowth * 0.18 + (jitter + 1) * 0.035)
          .lerp(sunNeedle, sunAmount * 0.72);
        appendNeedleSprayCard(
          positions,
          colors,
          uvs,
          indices,
          start,
          end,
          0.18 + lowerGrowth * 0.18,
          scratchColor
        );
      }

      for (let needle = 0; needle < hangingNeedles; needle += 1) {
        const along = 0.2 + needle / Math.max(1, hangingNeedles) * 0.74;
        const jitter = Math.sin(level * 6.7 + branch * 2.9 + needle * 5.2);
        const center = scratchStart
          .clone()
          .lerp(scratchEnd, along)
          .addScaledVector(branchSide, jitter * (0.1 + lowerGrowth * 0.08));
        const length = (0.54 + lowerGrowth * 0.42) * (0.88 + jitter * 0.08);
        const tip = center
          .clone()
          .addScaledVector(branchDirection, length * 0.38)
          .addScaledVector(branchSide, Math.sin(needle * 2.2 + level) * length * 0.2)
          .addScaledVector(worldUp, -length * (0.42 + lowerGrowth * 0.18));
        scratchColor
          .copy(darkNeedle)
          .lerp(midNeedle, 0.46 + lowerGrowth * 0.22)
          .lerp(sunNeedle, sunAmount * 0.65);
        appendTaperedBlade(
          positions,
          colors,
          uvs,
          indices,
          center,
          tip,
          0.052 + lowerGrowth * 0.035,
          scratchColor
        );
      }

      if (level > levels - 5) {
        const spireT = Math.max(0, (t - 0.72) / 0.28);
        const spireStart = scratchStart.clone().multiplyScalar(0.36);
        const spireTip = spireStart
          .clone()
          .addScaledVector(worldUp, 0.55 + spireT * 0.82)
          .addScaledVector(branchSide, Math.sin(branch + level) * 0.09);
        appendTaperedBlade(
            positions,
            colors,
            uvs,
            indices,
            spireStart,
            spireTip,
            0.06,
            scratchColor
        );
      }
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

export function createConiferNeedleMaterial(): MeshPhysicalMaterial {
  const textures = getConiferNeedleTextures();
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.map,
    alphaMap: textures.alphaMap,
    roughnessMap: textures.roughnessMap,
    alphaTest: 0.12,
    vertexColors: true,
    side: DoubleSide,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.32,
    clearcoat: 0,
    clearcoatRoughness: 1,
    sheen: 0.3,
    sheenColor: new Color(0x7fa36a),
    sheenRoughness: 0.92,
    emissive: new Color(0x081b0c),
    emissiveIntensity: 0.075
  });
}

function appendBranchRibbon(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  start: Vector3,
  end: Vector3,
  width: number
): void {
  scratchDirection.subVectors(end, start).normalize();
  scratchRight.crossVectors(scratchDirection, worldUp);
  if (scratchRight.lengthSq() < 0.001) {
    scratchRight.set(1, 0, 0);
  } else {
    scratchRight.normalize();
  }
  const base = positions.length / 3;
  const half = width * 0.5;
  const tipHalf = half * 0.32;
  positions.push(
    start.x - scratchRight.x * half,
    start.y - scratchRight.y * half,
    start.z - scratchRight.z * half,
    start.x + scratchRight.x * half,
    start.y + scratchRight.y * half,
    start.z + scratchRight.z * half,
    end.x - scratchRight.x * tipHalf,
    end.y - scratchRight.y * tipHalf,
    end.z - scratchRight.z * tipHalf,
    end.x + scratchRight.x * tipHalf,
    end.y + scratchRight.y * tipHalf,
    end.z + scratchRight.z * tipHalf
  );
  pushColor(colors, branchColor, 4);
  uvs.push(0.44, 0, 0.56, 0, 0.44, 1, 0.56, 1);
  indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function appendLayeredBoughSurface(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  start: Vector3,
  end: Vector3,
  side: Vector3,
  width: number,
  needleColor: Color,
  phase: number,
  lowerGrowth: number
): void {
  const segments = 6;
  const base = positions.length / 3;

  for (let segment = 0; segment <= segments; segment += 1) {
    const p = segment / segments;
    const center = start.clone().lerp(end, p);
    const arch = Math.sin(p * Math.PI) * (0.16 + lowerGrowth * 0.12);
    const tipSag = p ** 1.85 * (0.1 + lowerGrowth * 0.18);
    const fullness = Math.max(0.04, Math.sin(Math.min(0.98, p) * Math.PI)) ** 0.42;
    const taper = 1 - p * 0.62;
    const widthAt = width * (0.15 + fullness * 0.9) * taper;
    const lobe =
      Math.sin((p * 7.7 + phase) * tau) * 0.18 +
      Math.sin((p * 13.1 - phase * 0.37) * tau) * 0.08;
    const edgeDrop = (0.05 + lowerGrowth * 0.15) * (0.35 + fullness);
    const leftWidth = widthAt * (0.92 + lobe);
    const rightWidth = widthAt * (0.92 - lobe * 0.72);
    const left = center
      .clone()
      .addScaledVector(side, -leftWidth)
      .addScaledVector(worldUp, arch - tipSag - edgeDrop * (0.9 + lobe * 0.35));
    const right = center
      .clone()
      .addScaledVector(side, rightWidth)
      .addScaledVector(worldUp, arch - tipSag - edgeDrop * (0.82 - lobe * 0.25));

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);

    const sunFleck = Math.max(0, Math.sin(phase + p * 5.9)) * 0.12;
    const shade = 0.82 + p * 0.08 + Math.sin(phase * 1.7 + p * 8.1) * 0.035;
    scratchColor
      .copy(needleColor)
      .multiplyScalar(shade)
      .lerp(sunNeedle, sunFleck);
    pushColor(colors, scratchColor, 2);
    uvs.push(0, p, 1, p);
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const row = base + segment * 2;
    indices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3);
  }
}

function appendBoughEdgeFingers(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  start: Vector3,
  end: Vector3,
  direction: Vector3,
  side: Vector3,
  width: number,
  needleColor: Color,
  phase: number,
  lowerGrowth: number,
  count: number
): void {
  const safeCount = Math.max(2, count);
  for (let finger = 0; finger < safeCount; finger += 1) {
    const along = 0.36 + (finger / Math.max(1, safeCount - 1)) * 0.5;
    const lengthJitter = Math.sin(phase * 2.1 + finger * 4.7);
    const center = start.clone().lerp(end, along);
    const span = width * (0.62 + Math.sin(along * Math.PI) * 0.48);

    for (const sideSign of [-1, 1]) {
      const root = center
        .clone()
        .addScaledVector(side, sideSign * span * (0.56 + lengthJitter * 0.08))
        .addScaledVector(worldUp, -0.04 - lowerGrowth * 0.05);
      const tip = root
        .clone()
        .addScaledVector(direction, 0.16 + lowerGrowth * 0.2)
        .addScaledVector(side, sideSign * (0.08 + lowerGrowth * 0.12))
        .addScaledVector(
          worldUp,
          -(0.28 + lowerGrowth * 0.42) * (0.82 + lengthJitter * 0.12)
        );
      scratchColor
        .copy(needleColor)
        .multiplyScalar(0.9 + lengthJitter * 0.04)
        .lerp(sunNeedle, Math.max(0, lengthJitter) * 0.08);
      appendTaperedBlade(
        positions,
        colors,
        uvs,
        indices,
        root,
        tip,
        0.045 + lowerGrowth * 0.034,
        scratchColor
      );
    }
  }
}

function appendNeedleSprayCard(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  start: Vector3,
  end: Vector3,
  width: number,
  needleColor: Color
): void {
  scratchDirection.subVectors(end, start).normalize();
  scratchRight.crossVectors(scratchDirection, worldUp);
  if (scratchRight.lengthSq() < 0.001) {
    scratchRight.set(1, 0, 0);
  } else {
    scratchRight.normalize();
  }

  const base = positions.length / 3;
  const rootHalf = width * 0.26;
  const midHalf = width;
  const tipHalf = width * 0.18;
  const mid = start.clone().lerp(end, 0.58).addScaledVector(worldUp, -width * 0.09);

  positions.push(
    start.x - scratchRight.x * rootHalf,
    start.y - scratchRight.y * rootHalf,
    start.z - scratchRight.z * rootHalf,
    start.x + scratchRight.x * rootHalf,
    start.y + scratchRight.y * rootHalf,
    start.z + scratchRight.z * rootHalf,
    mid.x - scratchRight.x * midHalf,
    mid.y - scratchRight.y * midHalf,
    mid.z - scratchRight.z * midHalf,
    mid.x + scratchRight.x * midHalf,
    mid.y + scratchRight.y * midHalf,
    mid.z + scratchRight.z * midHalf,
    end.x - scratchRight.x * tipHalf,
    end.y - scratchRight.y * tipHalf,
    end.z - scratchRight.z * tipHalf,
    end.x + scratchRight.x * tipHalf,
    end.y + scratchRight.y * tipHalf,
    end.z + scratchRight.z * tipHalf
  );
  pushColor(colors, needleColor, 6);
  uvs.push(0.42, 0, 0.58, 0, 0, 0.56, 1, 0.56, 0.38, 1, 0.62, 1);
  indices.push(
    base,
    base + 2,
    base + 1,
    base + 1,
    base + 2,
    base + 3,
    base + 2,
    base + 4,
    base + 3,
    base + 3,
    base + 4,
    base + 5
  );
}

function appendTaperedBlade(
  positions: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  start: Vector3,
  end: Vector3,
  width: number,
  bladeColor: Color
): void {
  scratchDirection.subVectors(end, start).normalize();
  scratchRight.crossVectors(scratchDirection, worldUp);
  if (scratchRight.lengthSq() < 0.001) {
    scratchRight.set(1, 0, 0);
  } else {
    scratchRight.normalize();
  }
  const base = positions.length / 3;
  const shoulder = start.clone().lerp(end, 0.46);
  positions.push(
    start.x,
    start.y,
    start.z,
    shoulder.x - scratchRight.x * width,
    shoulder.y - scratchRight.y * width,
    shoulder.z - scratchRight.z * width,
    end.x,
    end.y,
    end.z,
    shoulder.x + scratchRight.x * width,
    shoulder.y + scratchRight.y * width,
    shoulder.z + scratchRight.z * width
  );
  pushColor(colors, bladeColor, 4);
  uvs.push(0.5, 0, 0.06, 0.46, 0.5, 1, 0.94, 0.46);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushColor(colors: number[], color: Color, count: number): void {
  for (let index = 0; index < count; index += 1) {
    colors.push(color.r, color.g, color.b);
  }
}

function ensureWhiteVertexColors(geometry: BufferGeometry): void {
  if (geometry.hasAttribute("color")) {
    return;
  }

  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  colors.fill(1);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function getConiferNeedleTextures(): ConiferNeedleTextures {
  if (needleTextures) {
    return needleTextures;
  }

  const size = 256;
  const length = size * size;
  const albedo = new Uint8Array(length * 4);
  const alpha = new Uint8Array(length * 4);
  const roughness = new Uint8Array(length * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const centerDistance = Math.abs(u - 0.5);
      const sideFeather = 1 - smoothstep(0.42, 0.5, centerDistance);
      const rootFeather = smoothstep(0.02, 0.22, v);
      const tipFeather = 1 - smoothstep(0.9, 1, v);
      const fiber =
        Math.max(0, Math.sin((u * 42 + Math.sin(v * tau * 5) * 0.7) * tau)) **
        1.7;
      const crossNeedles =
        Math.max(0, Math.sin((u * 23 - v * 13 + Math.sin(v * tau * 2)) * tau)) **
        4.2;
      const speckle = hash2(x, y);
      const raggedEdge =
        1 -
        smoothstep(
          0.42,
          0.52,
          centerDistance + (speckle - 0.5) * 0.18 + Math.sin(v * tau * 9) * 0.03
        );
      const wovenMass =
        0.38 + fiber * 0.34 + crossNeedles * 0.18 + speckle * 0.08;
      const coverage = clamp01(
        wovenMass * sideFeather * rootFeather * tipFeather +
          raggedEdge * 0.2 * rootFeather * tipFeather
      );
      const shade = 0.52 + fiber * 0.18 + crossNeedles * 0.1 + speckle * 0.07;
      const yellowTip = smoothstep(0.68, 1, v) * (0.25 + fiber * 0.2);
      const offset = (y * size + x) * 4;

      albedo[offset] = toByte(0.24 * shade + yellowTip * 0.18);
      albedo[offset + 1] = toByte(0.48 * shade + yellowTip * 0.22);
      albedo[offset + 2] = toByte(0.18 * shade);
      albedo[offset + 3] = 255;

      const alphaByte = toByte(coverage);
      alpha[offset] = alphaByte;
      alpha[offset + 1] = alphaByte;
      alpha[offset + 2] = alphaByte;
      alpha[offset + 3] = 255;

      const rough = toByte(0.72 + speckle * 0.18 - fiber * 0.14);
      roughness[offset] = rough;
      roughness[offset + 1] = rough;
      roughness[offset + 2] = rough;
      roughness[offset + 3] = 255;
    }
  }

  needleTextures = {
    map: makeTexture(albedo, true),
    alphaMap: makeTexture(alpha, false),
    roughnessMap: makeTexture(roughness, false)
  };
  return needleTextures;
}

function makeTexture(data: Uint8Array, srgb: boolean): DataTexture {
  const texture = new DataTexture(data, 256, 256, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if (srgb) {
    texture.colorSpace = SRGBColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function hash2(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}
