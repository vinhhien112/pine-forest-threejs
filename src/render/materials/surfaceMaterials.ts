import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  color,
  float,
  mix,
  mx_noise_float,
  normalView,
  normalWorldGeometry,
  positionView,
  positionWorld,
  smoothstep,
  texture,
  triplanarTexture,
  vec3
} from "three/tsl";
import {
  createRockTextures,
  createTerrainTextures
} from "./proceduralTextures";

type NoiseNode = ReturnType<typeof mx_noise_float>;

export function createTerrainSurfaceMaterial(
  seed: number
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = "LAAS world-space forest floor";
  material.metalness = 0;
  material.envMapIntensity = 0.24;
  material.vertexColors = false;

  const macro = noise01(seed + 17, 0.028);
  const meso = noise01(seed + 31, 0.19);
  const grain = noise01(seed + 47, 1.15);
  const micro = noise01(seed + 61, 9.6);
  const streamCenter = positionWorld.z
    .mul(0.037)
    .add(float(seed * 0.003))
    .sin()
    .mul(6.8)
    .add(
      positionWorld.z
        .mul(0.117)
        .add(float(seed * 0.011))
        .sin()
        .mul(2.2)
    );
  const streamDistance = positionWorld.x.sub(streamCenter).abs();
  const nearStream = smoothstep(18, 4.8, streamDistance);
  const textureSet = createTerrainTextures(seed + 73);
  const triplanarAlbedo = triplanarTexture(
    texture(textureSet.map),
    null,
    null,
    float(0.18),
    positionWorld,
    normalWorldGeometry
  ).rgb;
  const fineAlbedo = triplanarTexture(
    texture(textureSet.map),
    null,
    null,
    float(0.57),
    positionWorld,
    normalWorldGeometry
  ).rgb;
  const up = normalWorldGeometry.y.clamp(0, 1);
  const steep = up.oneMinus();
  const strata = positionWorld.y
    .mul(0.72)
    .add(meso.mul(3.4))
    .sin()
    .mul(0.5)
    .add(0.5);

  const humus = mix(color(0x100e0b), color(0x2c241c), macro);
  const duff = mix(color(0x2c2116), color(0x745a35), grain);
  const clay = mix(color(0x211d18), color(0x4b4032), meso);
  const warmStone = mix(color(0x1a1d1c), color(0x4b4d47), strata);
  const stone = warmStone.mul(meso.mul(0.18).add(0.82));
  const rockMask = smoothstep(0.18, 0.68, steep.add(meso.mul(0.2)));
  let surface = mix(humus, clay, smoothstep(0.38, 0.72, meso));

  const litterMask = smoothstep(0.5, 0.8, grain)
    .mul(up)
    .mul(smoothstep(0.22, 0.78, macro))
    .mul(0.68);
  const dryLitter = mix(duff, color(0x92764a), micro.mul(0.54));
  surface = mix(surface, dryLitter, litterMask);

  const mossMask = smoothstep(0.42, 0.86, up)
    .mul(smoothstep(0.56, 0.9, macro))
    .mul(smoothstep(0.42, 0.76, grain))
    .mul(nearStream.mul(0.28).add(0.16))
    .mul(0.34);
  const moss = mix(color(0x152018), color(0x40533a), grain);
  surface = mix(surface, moss, mossMask);

  surface = mix(surface, stone, rockMask);

  const wetBand = nearStream.mul(up).mul(0.64);
  const wetMud = mix(color(0x0d100e), color(0x25271f), macro);
  surface = mix(surface, wetMud, wetBand);

  const coarseHeight = triplanarAlbedo.dot(vec3(0.333));
  const fineHeight = fineAlbedo.dot(vec3(0.333));
  const dryGroundMask = up.mul(wetBand.oneMinus()).mul(rockMask.oneMinus());
  const soilCavity = smoothstep(0.42, 0.16, fineHeight)
    .mul(up)
    .mul(0.52);
  surface = surface.mul(soilCavity.oneMinus());
  surface = surface.mul(grain.mul(0.14).add(0.86));
  surface = surface.mul(micro.mul(0.07).add(0.95));
  surface = mix(surface, triplanarAlbedo.mul(0.82), float(0.34));
  surface = mix(surface, fineAlbedo.mul(0.72), float(0.22));

  const mineralGrit = smoothstep(0.68, 0.88, fineHeight)
    .mul(up)
    .mul(wetBand.oneMinus());
  surface = mix(surface, color(0x7d7461), mineralGrit.mul(0.19));

  const dryPores = smoothstep(0.48, 0.14, fineHeight)
    .mul(dryGroundMask)
    .mul(0.44);
  const dryGrainShadow = smoothstep(0.58, 0.18, micro)
    .mul(dryGroundMask)
    .mul(0.24);
  const dryRaisedGrit = smoothstep(0.6, 0.9, grain)
    .mul(dryGroundMask)
    .mul(0.24);
  surface = surface.mul(dryPores.mul(0.32).oneMinus());
  surface = surface.mul(dryGrainShadow.mul(0.18).oneMinus());
  surface = mix(surface, color(0x8a7657), dryRaisedGrit.mul(0.12));

  const dryPoreRelief = dryPores
    .mul(0.064)
    .add(dryGrainShadow.mul(0.034))
    .add(dryRaisedGrit.mul(0.028));
  const drySoilRelief = meso
    .mul(0.018)
    .add(coarseHeight.mul(0.034))
    .add(micro.mul(0.011))
    .mul(dryGroundMask);
  const relief = meso
    .mul(0.028)
    .add(grain.mul(0.023))
    .add(micro.mul(0.0062))
    .add(coarseHeight.mul(0.082))
    .add(fineHeight.mul(0.031))
    .add(dryPoreRelief)
    .add(drySoilRelief)
    .mul(mix(float(1.08), float(1.34), steep));

  material.colorNode = surface;
  const dryRoughness = mix(float(0.78), float(0.93), fineHeight);
  const substrateRoughness = mix(
    dryRoughness,
    float(0.84),
    rockMask.mul(0.72)
  );
  material.roughnessNode = mix(
    substrateRoughness,
    float(0.7),
    wetBand.mul(0.76)
  );
  material.normalNode = worldBump(relief);
  return material;
}

export function createRockSurfaceMaterial(
  seed: number,
  wetness: number
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name =
    wetness > 0.45 ? "LAAS wet triplanar stone" : "LAAS dry triplanar stone";
  material.metalness = 0;
  material.envMapIntensity = 1.45;

  const macro = noise01(seed + 101, 0.14);
  const meso = noise01(seed + 127, 0.72);
  const grain = noise01(seed + 163, 3.6);
  const micro = noise01(seed + 197, 11.5);
  const textureSet = createRockTextures(seed + 223);
  const triplanarAlbedo = triplanarTexture(
    texture(textureSet.map),
    null,
    null,
    float(1.15),
    positionWorld,
    normalWorldGeometry
  ).rgb;
  const up = normalWorldGeometry.y.clamp(0, 1);
  const bedding = positionWorld.y
    .mul(2.15)
    .add(macro.mul(4.1))
    .add(positionWorld.x.mul(0.08))
    .sin()
    .mul(0.5)
    .add(0.5);

  const coldStone = mix(color(0x080f12), color(0x263438), macro);
  const strataStone = mix(color(0x101719), color(0x374242), bedding);
  let surface = mix(coldStone, strataStone, meso.mul(0.54));
  surface = surface.mul(grain.mul(0.26).add(0.78));
  surface = mix(surface, triplanarAlbedo.mul(0.46), float(0.58));
  const textureHeight = triplanarAlbedo.dot(vec3(0.333));

  const mineralMask = smoothstep(0.58, 0.84, grain).mul(
    smoothstep(0.28, 0.82, bedding)
  );
  surface = mix(surface, color(0x625d51), mineralMask.mul(0.14));

  const lichenMask = smoothstep(0.56, 0.9, up)
    .mul(smoothstep(0.58, 0.82, macro))
    .mul(smoothstep(0.26, 0.72, grain))
    .mul(1 - wetness)
    .mul(0.58);
  surface = mix(surface, color(0x526044), lichenMask);

  const poreMask = smoothstep(0.69, 0.86, micro);
  surface = surface.mul(poreMask.mul(0.13).oneMinus());
  const quartzMask = smoothstep(0.76, 0.9, micro).mul(
    smoothstep(0.42, 0.78, meso)
  );
  surface = mix(surface, color(0x6c706b), quartzMask.mul(0.13));

  const wetMask = float(wetness).mul(macro.mul(0.2).add(0.8));
  surface = mix(surface, surface.mul(0.34), wetMask);

  const relief = meso
    .mul(0.072)
    .add(grain.mul(0.015))
    .add(micro.mul(0.0032))
    .add(poreMask.mul(0.0038))
    .add(textureHeight.mul(0.09));

  material.colorNode = surface;
  material.roughnessNode = mix(float(0.9), float(0.38), wetMask);
  material.normalNode = worldBump(relief);
  return material;
}

export function createMossSurfaceMaterial(
  seed: number
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = "LAAS fibrous moss";
  material.metalness = 0;
  material.envMapIntensity = 0.72;

  const clump = noise01(seed + 211, 0.48);
  const fiber = noise01(seed + 227, 3.8);
  const micro = noise01(seed + 251, 13.5);
  const tip = smoothstep(0.48, 0.82, fiber);
  const surface = mix(color(0x102216), color(0x496b39), clump)
    .mul(fiber.mul(0.24).add(0.82))
    .add(color(0x263b1b).mul(tip.mul(0.18)));

  material.colorNode = surface;
  material.roughnessNode = float(0.99);
  material.normalNode = worldBump(
    clump.mul(0.025).add(fiber.mul(0.009)).add(micro.mul(0.0015))
  );
  return material;
}

export function createWetBankSurfaceMaterial(
  seed: number
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = "LAAS wet soil and moss";
  material.metalness = 0;
  material.envMapIntensity = 0.62;
  material.vertexColors = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1.4;
  material.polygonOffsetUnits = -1.4;

  const mud = noise01(seed + 281, 0.32);
  const grit = noise01(seed + 307, 2.4);
  const micro = noise01(seed + 331, 9.2);
  const mossMask = smoothstep(0.46, 0.76, mud).mul(
    smoothstep(0.32, 0.75, grit)
  );
  let surface = mix(color(0x191b16), color(0x3d4031), mud);
  surface = mix(
    surface,
    mix(color(0x17251a), color(0x42583a), grit),
    mossMask.mul(0.62)
  );
  const wetMask = smoothstep(0.25, 0.72, mud).mul(0.52);
  surface = mix(surface, surface.mul(0.58), wetMask);

  material.colorNode = surface;
  material.roughnessNode = mix(float(0.94), float(0.48), wetMask);
  material.normalNode = worldBump(
    mud.mul(0.024).add(grit.mul(0.007)).add(micro.mul(0.0016))
  );
  return material;
}

function noise01(seed: number, frequency: number): NoiseNode {
  const x = ((seed * 17) % 997) * 0.071;
  const y = ((seed * 31) % 991) * 0.053;
  const z = ((seed * 47) % 983) * 0.067;
  return mx_noise_float(
    positionWorld.mul(frequency).add(vec3(x, y, z))
  )
    .mul(0.5)
    .add(0.5);
}

function worldBump(height: NoiseNode) {
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = dpdy.cross(normalView);
  const r2 = normalView.cross(dpdx);
  const det = dpdx.dot(r1);
  const gradient = det
    .sign()
    .mul(height.dFdx().mul(r1).add(height.dFdy().mul(r2)));

  return det.abs().mul(normalView).sub(gradient).normalize();
}
