# LAAS v2 Deviations

This first implementation is a fast vertical slice. It is designed to run, show the intended product direction, and create stable extension points without claiming the full LAAS v2 floors.

Runtime query contract now includes `?thermal=normal|cool`. `thermal=cool` is a battery/heat mode: it caps rendering near 24 fps, keeps antialiasing enabled with a moderate 1.1 pixel-ratio ceiling, reduces GTAO cost, trims background scatter/particles, and keeps the code-only conifer reset visible.

| v2 Requirement | Fast Slice Alternative | Reason |
| --- | --- | --- |
| 4 x 4 km streamed world | Single generated ravine terrain around the camera | Establishes renderer, controls, terrain, scatter, and HUD quickly |
| 4096² GPU erosion with 500+ iterations | Deterministic analytic heightfield with carved stream channel | Full erosion requires dedicated GPU compute phase |
| 5M+ rendered triangles | Verified fast frame at about 3.6M estimated triangles and 51 fps after the conifer bough reset | Preserves the agreed 30 fps floor while paying for layered needle alpha/cutout foliage |
| Meshlet/cluster culling | Instanced meshes and simple scene graph | Culling architecture comes after content density is proven |
| GI probe volume | Procedural PMREM image-based fill, hemisphere light, and restrained bounce lights | Avoids black shadows while leaving spatial GI as a real later phase |
| 4 CSM + PCSS + contact shadows | Single cached high-resolution shadowed sun plus half-resolution GTAO | Preserves contact grounding while avoiding continuous Three `0.185.1` WebGPU shadow-buffer churn |
| Raymarched volumetric clouds | Procedural low cloud meshes | Provides composition target without cloud renderer cost |
| Full vegetation species biology | Seeded trunks, layered procedural conifer whorls, broad drooping bough surfaces, edge-finger needle clusters, code-generated needle alpha/albedo/roughness atlas, curved fern pinnae, multi-segment grass, procedural foliage PBR maps, and near/midground LODs | Improves silhouette and surface response while preserving instancing and the code-only asset constraint |
| Physically simulated wind field | Hurricane-strength shared gusts bend unified scatter/midground/hero conifer trunk-branch-foliage geometry progressively by height in one world-space direction; grass and field/hero ferns use terrain-normal, root-anchored affine flex while flowers retain cheaper instance sway; dust/leaf flecks share the flow direction | Keeps foliage attached to curved trunks and adds readable soft-plant storm bending without cloth, skeletal branch physics, or a bespoke GPU wind field |
| Runtime tree destruction | Each `L` press targets a new deterministic hero conifer, retains earlier stumps/fallen tops, and promotes the attached upper trunk/crown to a Rapier rigid body in one shared terrain physics world; presses during a fall are queued | Delivers persistent multi-tree destruction without general-purpose arbitrary mesh cutting, branch-by-branch fracture, or streamed destruction persistence |
| Photogrammetry-grade forest floor | Denser stream-aware terrain heightfield generated from domain-warped FBM, deterministic thermal erosion, edge-preserving relaxation, smooth recomputed normals, and dual-scale humus/duff/grit shading | Replaces both the smooth plastic silhouette and obvious polygon spikes with rounded code-only geometric relief, without external scans or displacement textures |
| Physically refractive shallow water | Fresnel-driven physical node surface with vertex-depth tint, feathered bank/end alpha, tapered irregular surface edges, raised/widened water level, sky-colored mirror lane broken by stronger multi-frequency mesh ripples, capillary procedural normal detail, drifting ripple arcs, visible streambed stones, larger reflection glints, wet margins, subdued caustics, and restrained breaker foam | Makes the stream read as shallow glossy flowing water without the ribbon-like mesh pass or a fragile screen-space reflection/refraction pass |
| 80k visible debris instances | Hundreds to thousands of visible instanced ground details | Keeps first slice responsive |
| Reference-delta side-by-side | Supplied target, current WebGPU frame, and `reference/compare.html` | Uses the Codex in-app browser; no Playwright-managed browser is installed |

Next phase should prioritize species-specific branching, shader wind, foliage transmission, true displaced cliff silhouettes, water refraction/depth absorption/shoreline foam, higher-quality mountain erosion, and volumetric atmosphere where the browser/GPU stack proves stable. The current code-only foliage is materially better but is not represented as photogrammetry-equivalent.
