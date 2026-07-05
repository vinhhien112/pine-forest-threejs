import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const checks = [];

function check(name, condition) {
  checks.push({ name, condition });
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const html = await readFile("index.html", "utf8");
const webgpu = await readFile("src/render/app/webgpu.ts", "utf8");
const config = await readFile("src/world/config.ts", "utf8");
const types = await readFile("src/types.ts", "utf8");
const startLaas = await readFile("src/render/app/startLaas.ts", "utf8");
const input = await readFile("src/render/app/input.ts", "utf8");
const renderer = await readFile("src/render/app/createRenderer.ts", "utf8");
const world = await readFile("src/render/objects/ravineScene.ts", "utf8");
const scatter = await readFile("src/vegetation/scatter.ts", "utf8");
const conifer = await readFile("src/vegetation/conifer.ts", "utf8");
const groundFoliage = await readFile("src/vegetation/groundFoliage.ts", "utf8");
const heightWind = await readFile("src/vegetation/heightWind.ts", "utf8");
const flexibleWind = await readFile("src/vegetation/flexibleWind.ts", "utf8");
const terrain = await readFile("src/world/terrain.ts", "utf8");
const proceduralTextures = await readFile("src/render/materials/proceduralTextures.ts", "utf8");
const surfaceMaterials = await readFile("src/render/materials/surfaceMaterials.ts", "utf8");
const materials = await readFile("src/render/materials/materials.ts", "utf8");
const heroDressing = await readFile("src/render/objects/heroDressing.ts", "utf8");
const water = await readFile("src/render/objects/water.ts", "utf8");
const windDust = await readFile("src/render/objects/windDust.ts", "utf8");
const lightning = await readFile("src/render/objects/lightningStrike.ts", "utf8");
const playerBall = await readFile("src/render/objects/playerBall.ts", "utf8");
const qualityResetDressing = await readFile("src/render/objects/qualityResetDressing.ts", "utf8");
const lights = await readFile("src/render/lights.ts", "utf8");

check("index boots src/main.ts", html.includes('src="/src/main.ts"'));
check("WebGPU hard gate exists", webgpu.includes('"gpu" in navigator'));
check("No WebGL fallback language is present", webgpu.includes("no WebGL fallback"));
check("seed query defaults to 1847", config.includes('"seed"') && config.includes("1847"));
check("scene query supports ravine/vista/gallery/terrain", config.includes('"ravine"') && config.includes('"vista"') && config.includes('"gallery"') && config.includes('"terrain"'));
check("preset query supports fast/high", config.includes('"fast"') && config.includes('"high"'));
check("thermal query supports normal/cool", config.includes('"thermal"') && config.includes('"normal"') && config.includes('"cool"'));
check("WorldConfig type is exported", types.includes("interface WorldConfig"));
check("DebugMetrics type is exported", types.includes("interface DebugMetrics"));
check("Cool mode caps render cadence", startLaas.includes("1000 / 24") && startLaas.includes("targetFrameIntervalMs"));
check("Cool mode keeps antialiasing and lowers pixel ratio moderately", renderer.includes("1.1") && renderer.includes("antialias: true"));
check("ScatterClass includes core debris classes", types.includes('"cobble"') && types.includes('"twig"') && types.includes('"leaf"'));
check("Ravine world composes terrain/scatter/water/sky", world.includes("createTerrain") && world.includes("createScatter") && world.includes("createWater") && world.includes("createSkyDetails"));
check("Procedural scatter uses instancing", scatter.includes("InstancedMesh"));
check("Conifers use layered procedural needle geometry", conifer.includes("appendNeedleSprayCard") && conifer.includes("appendTaperedBlade") && conifer.includes("alphaMap") && conifer.includes("DataTexture") && !conifer.includes("CanvasTexture"));
check("Conifer trunks and crowns share one wind geometry", conifer.includes("createCoupledConiferGeometry") && conifer.includes("mergeGeometries([trunk, crown], true)") && scatter.includes('"wind-coupled scatter conifers"'));
check("Ferns and grass use shared procedural geometry", groundFoliage.includes("createFernFrondGeometry") && groundFoliage.includes("createGrassTuftGeometry"));
check("Foliage PBR textures are generated in code", proceduralTextures.includes("createFoliageTextures") && proceduralTextures.includes('"foliage"'));
check("Forest floor terrain has stream-aware wet band", surfaceMaterials.includes("streamDistance") && surfaceMaterials.includes("wetBand") && surfaceMaterials.includes("dryLitter"));
check("Forest floor litter is instanced", heroDressing.includes("createForestFloorLitter") && heroDressing.includes("thin pine needle and leaf litter"));
check("Ground realism uses dual-scale detail and dry roughness", surfaceMaterials.includes("fineAlbedo") && surfaceMaterials.includes("dryRoughness") && surfaceMaterials.includes("mineralGrit"));
check("Dry ground depth pass preserves wet bank material", surfaceMaterials.includes("dryGroundMask") && surfaceMaterials.includes("dryPores") && surfaceMaterials.includes("dryPoreRelief") && surfaceMaterials.includes("mud.mul(0.024).add(grit.mul(0.007)).add(micro.mul(0.0016))"));
check("Ground realism adds instanced soil clumps", heroDressing.includes("clumpGeometry") && heroDressing.includes("clumpCount") && heroDressing.includes("group.add(needles, leaves, clumps)"));
check("Terrain mesh uses erosion-smoothed vertex relief", terrain.includes("groundMicroRelief") && terrain.includes("erodeTerrainGrid") && terrain.includes("erosionMobility") && terrain.includes("computeVertexNormals") && terrain.includes("sampleNormalGrid") && !terrain.includes("valueNoise2"));
check("Water material uses visible depth tint and procedural flow texture", materials.includes("vertexColor") && materials.includes("texture(textures.map)") && materials.includes("centerDepth"));
check("Water reset removed ribbon-like flow meshes", !water.includes("createCurrentRibbons") && !water.includes("flow direction ribbons"));
check("Water uses glints and breaker foam", water.includes("slow viscous reflection glints") && water.includes("foam gathered around breaker stones") && water.includes('"glint"'));
check("Water edge reset feathers sides and stream ends", materials.includes("edgeFade") && materials.includes("streamStartFade") && materials.includes("streamEndFade") && water.includes("waterSurfaceLift = 1.34") && water.includes("edgeSink"));
check("Water reflection reset raises glossy body", materials.includes("skyReflection") && materials.includes("mirrorLane") && water.includes("waterHalfWidth") && materials.includes("specularIntensity: 0.92"));
check("Water ripple reset adds active capillary surface motion", water.includes("createRippleLayer") && water.includes("capillary ripple arcs on water surface") && water.includes("capillaryRipple") && materials.includes("normalScale: new Vector2(1.18, 2.05)") && proceduralTextures.includes("capillary"));
check("Water viscosity reset avoids visible slick decals", !water.includes("createSlickPatchLayer") && !water.includes("viscous patchy reflection slicks") && water.includes("slickMask") && proceduralTextures.includes("syrupShear") && proceduralTextures.includes("smoothRange"));
check("Wind storm reset animates scatter", scatter.includes("updateFlexibleWindLayers") && scatter.includes("updateHeightWindLayers") && scatter.includes("windLayers.push"));
check("Strong wind bends whole trees by height", heightWind.includes("bendWeight") && heightWind.includes("baseY - Math.abs(bend)") && scatter.includes("createHeightWindLayer") && world.includes("qualityReset"));
check("Grass and ferns bend from anchored roots", flexibleWind.includes('FlexibleWindAxis = "y" | "z"') && flexibleWind.includes(".multiply(deform)") && flexibleWind.includes("localWind") && scatter.includes("composeGroundMatrix"));
check("Ground vegetation follows terrain normals", terrain.includes("readonly normal: Vector3") && scatter.includes("sample.normal") && scatter.includes("setFromUnitVectors"));
check("Wind storm reset adds dust layer", world.includes("createWindDust") && world.includes("updatables: [scatter, qualityReset, lightning, water, windDust, sky]") && windDust.includes("strong wind dust flecks"));
check("Point sprites carry WebGPU UV attributes", windDust.includes('"uv"') && lightning.includes('new Float32Array(count * 2).fill(0.5)'));
check("Sun shadow map is cached after its first render", lights.includes("sun.shadow.autoUpdate = false") && lights.includes("sun.shadow.needsUpdate = true"));
check("Lightning uses Rapier terrain collision", packageJson.dependencies["@dimforge/rapier3d-compat"] && lightning.includes("ColliderDesc.trimesh") && lightning.includes("RigidBodyDesc.dynamic"));
check("Lightning keeps foliage attached to falling trunk", lightning.includes("fallingTop.add(crown)") && lightning.includes("fractured falling trunk") && lightning.includes("jagged stump fracture fibers"));
check("Lightning is triggered by L and has effects", input.includes('event.code === "KeyL"') && startLaas.includes("world.triggerLightning") && lightning.includes("playThunder") && lightning.includes("lightning-flash") && lightning.includes("lightningTreeBase"));
check("Repeated lightning preserves old trees and advances targets", lightning.includes("prepareNextTree") && lightning.includes("stumpTemplate.clone(true)") && lightning.includes("fallingTopTemplate.clone(true)") && lightning.includes("queuedStrikes") && !lightning.includes("resetTop"));
check("Third-person ball mode uses Rapier terrain and tree blockers", playerBall.includes("third-person rolling player ball") && playerBall.includes("ColliderDesc.ball") && playerBall.includes("ColliderDesc.trimesh") && playerBall.includes("createTreeColliders") && scatter.includes("treeColliders"));
check("Ball mode camera and free camera toggle are wired", startLaas.includes("createPlayerBallSystem") && input.includes('event.code === "KeyV"') && input.includes('mode === "ball"') && input.includes("playerBall.rotateView"));
check("Ball water interaction adds drag, wake, and splash", playerBall.includes("getWaterState") && playerBall.includes("applyWaterDrag") && playerBall.includes("waterHalfWidth") && water.includes("setBallDisturbance") && water.includes("player ball water wake and splash") && water.includes("sampleBallWake") && startLaas.includes("world.setBallWaterDisturbance(playerBall.getWaterState())"));
check("Ball physics blocks rocks and stream cobbles", playerBall.includes("createStoneColliders") && playerBall.includes("BallObstacleDescriptor") && scatter.includes("obstacleColliders") && heroDressing.includes("obstacleColliders") && water.includes("obstacleColliders") && startLaas.includes("world.obstacleColliders"));
check("Ball mode Space jump is wired into physics", input.includes('["Space", "up"]') && input.includes("jump: pressed.has(\"up\")") && playerBall.includes("applyJumpImpulse") && playerBall.includes("coyoteTimer"));
check("Ball camera defaults toward stream instead of old scene view", playerBall.includes("defaultOrbitYaw = Math.PI") && playerBall.includes("defaultOrbitPitch") && playerBall.includes("lookAhead") && !playerBall.includes("resetNearView(camera: PerspectiveCamera): void {\n      syncMesh();\n      syncOrbitFromCamera(camera);"));
check("Bridge log lightning auto-triggers from ball proximity", world.includes("qualityReset.setPlayerBallPosition(state.position)") && proceduralTextures.includes("createBarkTextures") && qualityResetDressing.includes("bridge log lightning fracture trigger") && qualityResetDressing.includes("automatic bridge log lightning bolt"));
check("Bridge log lightning drives a temporary high camera cue", types.includes("interface CinematicCameraCue") && qualityResetDressing.includes("getCinematicCameraCue") && qualityResetDressing.includes("heightBoost: 11.5") && qualityResetDressing.includes("splinters.visible = elapsed < 1.85") && world.includes("qualityReset.getCinematicCameraCue") && startLaas.includes("playerBall.setCinematicCameraCue(world.getCinematicCameraCue())") && playerBall.includes("setCinematicCameraCue") && playerBall.includes("extraCameraLift"));
check("DELTA.md exists", existsSync("DELTA.md"));
check("DEVIATIONS.md exists", existsSync("DEVIATIONS.md"));
check("Playwright is not a default dependency", !JSON.stringify(packageJson).includes("@playwright/test"));

const failed = checks.filter((item) => !item.condition);

if (failed.length > 0) {
  for (const item of failed) {
    console.error(`FAIL ${item.name}`);
  }
  process.exit(1);
}

for (const item of checks) {
  console.log(`PASS ${item.name}`);
}
