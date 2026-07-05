import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Vector2,
  type MeshStandardMaterialParameters
} from "three";
import {
  createWaterTextures
} from "./proceduralTextures";
import {
  createRockSurfaceMaterial,
  createTerrainSurfaceMaterial,
  createWetBankSurfaceMaterial
} from "./surfaceMaterials";
import {
  MeshPhysicalNodeMaterial,
  type MeshStandardNodeMaterial
} from "three/webgpu";
import {
  cameraPosition,
  color,
  float,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  uv,
  vertexColor
} from "three/tsl";

export function terrainMaterial(seed: number): MeshStandardNodeMaterial {
  return createTerrainSurfaceMaterial(seed);
}

export function standardMaterial(
  color: Color | number,
  params: Omit<MeshStandardMaterialParameters, "color"> = {}
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0,
    ...params
  });
}

export function waterSurfaceMaterial(seed: number): MeshPhysicalNodeMaterial {
  const textures = createWaterTextures(seed);
  const material = new MeshPhysicalNodeMaterial({
    vertexColors: true,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new Vector2(1.18, 2.05),
    roughnessMap: textures.roughnessMap,
    roughness: 0.13,
    metalness: 0,
    clearcoat: 0.58,
    clearcoatRoughness: 0.24,
    ior: 1.31,
    specularIntensity: 0.92,
    specularColor: new Color(0xecfff7),
    transmission: 0,
    thickness: 0,
    attenuationColor: new Color(0x7fc9c0),
    attenuationDistance: 16,
    transparent: true,
    opacity: 1,
    envMapIntensity: 0.6,
    depthWrite: false,
    side: DoubleSide,
    emissive: new Color(0x000000),
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const facing = normalWorld.dot(toCamera).abs().clamp(0, 1);
  const fresnel = facing.oneMinus().pow(4);
  const uvCoord = uv();
  const centerDepth = uvCoord.x
    .sub(float(0.5))
    .abs()
    .mul(2)
    .clamp(0, 1)
    .oneMinus()
    .pow(0.82);
  const leftBankFade = smoothstep(0.035, 0.24, uvCoord.x);
  const rightBankFade = smoothstep(0.035, 0.24, uvCoord.x.oneMinus());
  const streamStartFade = smoothstep(0.025, 0.13, uvCoord.y);
  const streamEndFade = smoothstep(0.025, 0.13, uvCoord.y.oneMinus());
  const edgeFade = leftBankFade
    .mul(rightBankFade)
    .mul(streamStartFade)
    .mul(streamEndFade)
    .clamp(0, 1);
  const waterTexture = texture(textures.map).rgb;
  const vertexTint = vertexColor().rgb;
  const deepChannel = mix(color(0x2e8b90), color(0x064358), centerDepth);
  const skyReflection = mix(color(0xa9e4e5), color(0xf0fff8), fresnel);
  const mirrorLane = centerDepth
    .pow(1.45)
    .mul(fresnel.mul(0.96).add(0.22))
    .clamp(0, 1);
  const reflectiveWater = mix(deepChannel, skyReflection, mirrorLane);
  const texturedWater = mix(reflectiveWater, waterTexture.mul(0.42), float(0.16));
  material.colorNode = mix(texturedWater, vertexTint.mul(0.9), float(0.1));
  material.opacityNode = mix(
    float(0.52),
    float(0.78),
    centerDepth.mul(0.56).add(fresnel.mul(0.44)).clamp(0, 1)
  ).mul(edgeFade);
  material.roughnessNode = mix(
    float(0.34),
    float(0.062),
    centerDepth.mul(0.34).add(fresnel.mul(0.86)).clamp(0, 1)
  );
  return material;
}

export function streamBedMaterial(): MeshStandardNodeMaterial {
  const material = createRockSurfaceMaterial(4_103, 0.76);
  material.vertexColors = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  return material;
}

export function wetBankMaterial(): MeshStandardNodeMaterial {
  return createWetBankSurfaceMaterial(4_307);
}
