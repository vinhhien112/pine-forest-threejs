# LAAS Lightweight Smoke Workflow

This project intentionally does not install Playwright-managed browsers by default. Use the Codex `@Browser` in-app browser for visual smoke.

## Fast Local Checks

```bash
npm run validate
```

This runs strict TypeScript, production build, and static contract checks without downloading any browser binary.

## Visual Smoke

```bash
npm run dev -- --port 5173
```

Open:

```text
http://127.0.0.1:5173/?seed=1847&scene=ravine&preset=fast
```

Check:

- WebGPU unsupported environments show the explicit LAAS diagnostic.
- HUD shows `LAAS`, `F3 PERF`, seed, scene, biome, fps, frame ms, draws, triangles, and instances.
- Viewport has a ravine terrain, cobbled streambed, shallow water, rocks, trees, roots, ferns, grass, flowers, leaf litter, and cool nonblack shadow fill.
- Controls: click viewport, WASD move, Space/C ascend/descend, Shift sprint, 1-4 switch camera scene, F3 toggle HUD.
- Scene URLs: `scene=ravine`, `scene=vista`, `scene=gallery`, `scene=terrain`.

## Screenshots

Use the `@Browser` screenshot path after opening each URL above. Save review images under `outputs/` only when they are user-facing deliverables.
