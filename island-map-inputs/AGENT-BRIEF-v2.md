# Agent brief v2: island map – ROADS ONLY, FULL SCALE (replaces v1 and your half-scale plan)

## Goal
Build the roads of Ted's new grid island map as a loadable build-mode map. One PR. No houses (later PR).

## Inputs (branch `island-map-inputs`, folder `island-map-inputs/`)
Decode: `for f in *.b64; do base64 -d "$f" > "${f%.b64}"; done && sha256sum -c SHA256SUMS`. Base your PR on main; do not ship `.b64` files or the folder.
- **Source of truth: `city-grid-roads.svg`** (roads only, on the grid). `city-grid.png` = preview, `city-grid-cells.png` = cell view, `grid.py` = generator (seed 11; grid 126 x 70 road pieces, `Yl` = yellow lines, `PARK` box, in piece coords). `city-final*` = OLD, ignore except for land/water shape.
- Assets → `assets/roads/`, add catalog entries in `js/kenney-city-catalog.js` (url only, textures are embedded): `road-split-2.glb` (Y road), `road-straight-stop.glb` (straight with STOP text, same footprint as road-straight), `bridge-water.glb` (water bridge, spans 1 x 2 pieces).

## Facts (verified in main)
- Format: `{pieces:[{kit,file,x,z,turn,scale,mirror}], removedRoads:[]}`, loaded by `loadWestMap()` in `js/build-mode.js` (`MAP_URL = "./west-map.json"`). NOTE: `loadWestMap()` returns the localStorage `west-map` layout first, so `?map=island` must bypass/separate localStorage.
- `TILE = 48` (`js/constants.js`), road piece = 4 cells (`UNIT = 4*TILE`). `turn` 0–3 = 90° steps; `mirror:true` = F key.
- `js/built-lanes.js` `planBuiltLanes()` links lanes with an O(n²) double loop (~line 280). No one-way support.
- Physics: ~6 static Rapier colliders per straight piece. `js/kenney-roads.js` already uses `InstancedMesh`.

## Map requirements
1. **Full scale: 504 x 280 cells = 126 x 70 road pieces** (~2x current 260 x 260 ground). 1 SVG grid unit → 1 road piece exactly; no rescaling, no half scale.
2. Every road on the 4-cell grid. Only 90° turns + mirror. Mirror is allowed freely, BUT never use mirror on pieces with text/arrows: `road-straight-stop` STOP text must read correctly, facing the incoming car (use `turn` only).
3. **Yellow = main roads, 4 lanes**: two parallel roads with a median, one direction each. `road-split-2` where they meet two-way roads (ramps). Add minimal one-way support in `built-lanes.js` if needed.
4. **White = streets**: two-way. Some end or are offset (dead ends, T-junctions) exactly as in the SVG — do not "fix" them into straight lines.
5. **Park road**: one white road through the park, a real **4-way crossroad at both ends**. No other roads in the park.
6. **Green = overpasses**: where white crosses yellow, white goes over on existing bridge + ramp pieces (`road-slant-high` ramp up, bridge over the yellow road, ramp down). No junction there.
7. **Water crossings**: `bridge-water.glb` with ramps at both ends.
8. **Coast stays free of roads** (Ted will build other things there). Keep the SVG's gap to the water.
9. Some `road-straight-stop` right before intersections.
10. Use skinned catalog variants (texture entries), not plain Kenney. Kenney models untouched. No NearestFilter.
11. Load via **`?map=island`** (e.g. `island-map.json`). Without it, the current map works exactly as before.

## Performance (required — ~1.6–4k pieces)
- Lane linking: replace the O(n²) loop with a **spatial hash** (cell ≈ LINK_XZ, check 3x3 neighbours). Same results as before on the current map.
- Colliders: merge per-piece road colliders into a few large cuboids per straight run / per chunk; flat ground roads need no per-piece walls where not needed.
- Rendering: `InstancedMesh` per GLB (or merged static geometry per chunk) so draw calls stay low; keep frustum culling working (correct bounding spheres per chunk/instance set).
- Report in PR: load time and FPS (same spot, same camera) on current map and island map, before and after.

## Do NOT
Merge, touch main, open more than one PR, add buildings, change player/camera/gameplay, re-skin pieces, start helper agents.

## Process
Post a 5-line plan (piece mapping for yellow/white/green/water, one-way approach, perf approach) then build — Ted already approved full scale. If an approach fails twice, stop and report.

## Done when
- PR has: top-down screenshot of the whole map next to `city-grid.png`, plus 3 close-ups: park 4-way crossing, a green overpass, a water bridge.
- Game loads both maps; cars drive the new roads, one direction per side on yellow.
- FPS/load numbers in PR. Description under 150 words. Rebased on main. Never merge.
