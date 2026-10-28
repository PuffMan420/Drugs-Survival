# Code audit — Drugs Survival (Phase 1)

Audit of `main` at `f2350ac` (Merge PR #95). Nothing in the game was changed. This file is the only change.

## For Ted

1. The game works: all 35 tests pass and the browser showed no errors.
2. About a quarter of each download (15 MB) is pictures for old city parts the island no longer draws.
3. Some code is left over from the old city map and does nothing now. It can go.
4. One real trap: after you press P in build mode, your browser keeps your saved roads and ignores newer roads from the site.
5. Suggested order: tests run on every PR first, then remove dead code, then stop the wasted downloads.

## Baseline

How it was measured:

- `cd tests && npm install && npm test` on Node 22.23.4.
- The repo was served with `npx serve` and loaded in headless Chrome 154 (Playwright) at 1600×900, device pixel ratio 1.
- The machine has no GPU, so Chrome drew with SwiftShader (software).
- For reading the numbers only, the served `main.js` got one extra line after `start()` that exposes `renderer` and `scene` on `window`. The file on disk was not changed.
- Draw calls and triangles are summed over one whole frame, including shadow, normal and post passes, with `renderer.info.autoReset = false`.

### Tests

```
# tests 35
# pass 35
# fail 0
# duration_ms 1586
```

### Console and network

| Check | Result |
|---|---|
| Console errors | 0 |
| Console warnings | 0 |
| Console info | 3 (the drive-effects load logs) |
| Page errors / failed requests / HTTP ≥ 400 | 0 / 0 / 0 |
| Requests at load | 322 |
| Bytes at load | 59.7 MB local + 6.6 MB from jsDelivr (three.js 2.0 MB, Rapier 4.3 MB) |

### Render numbers

| Moment | Draw calls | Triangles | Geometries | Textures | Programs | Visible meshes |
|---|---|---|---|---|---|---|
| At load (Southwest spawn) | 96 | 51,038 | 223 | 166 | 21 | 226 |
| After 30 s walking | 182 | 93,594 | 238 | 177 | 21 | 232 |
| After 30 s walking + 30 s driving | 153 | 76,382 | 241 | 180 | 21 | 230 |

One frame at load, split by pass (separate run, about 99 calls in total):

| Pass | Draw calls | Triangles |
|---|---|---|
| Sun shadow map (4096²) | 29 | – |
| Colour pass | 34 | 18,122 |
| SSAO normal pass (whole scene again) | 32 | 18,098 |
| SSAO, blur, output (full-screen quads) | 4 | 4 |

Scene totals at load:

- 1,244 meshes and 64 sprites.
- 679 `InstancedMesh`; 192 of them have count 0.
- 680 meshes set to cast shadows.
- 231 unique materials.
- 364 city chunks.

**FPS:** the on-screen counter read 20–23 FPS. This number is **not meaningful**: there is no GPU here, and the project rule says FPS is judged only on Ted's PC. It is written down only because the brief asks for it.

### Screenshots

The screenshots are taken from three fixed jump spots (keys 5 Southwest, 3 Park, 8 Southeast), plus one while driving. Each has a full frame and a zoomed crop of the centre. The zoom is a crop, not an upscale. They are attached to the PR description and should be reused as "before" images in later PRs.

## How "unused" was proven

- **(a) knip.** knip 5 ran on a copy of `js/`, `tests/`, `tools/` and `index.html`. The entries were `js/main.js`, `tests/*.mjs` and `tools/*`, with `includeEntryExports`. Output:

  ```
  Unused exports (14)
  carSeparation      function  js/car-push.js:6:17
  CAMERA_DISTANCE              js/constants.js:3:14
  PLAYER_SPEED                 js/constants.js:23:14
  HEAD_SCALE                   js/head-scale.js:8:14
  createKenneyRoads  function  js/kenney-roads.js:71:23
  addKenneyRoads     function  js/kenney-roads.js:106:17
  TRAFFIC_DB_IDLE              js/kenney-vehicle.js:75:14
  TRAFFIC_DB_CRUISE            js/kenney-vehicle.js:76:14
  classifyMarkings   function  js/markings.js:82:17
  clipHalfPlane      function  js/quay-clip.js:47:17
  subtractConvex     function  js/quay-clip.js:89:17
  splitFromDocks     function  js/quay-clip.js:220:17
  MODULE                       js/road-sockets.js:12:14
  roadSpec           function  js/road-sockets.js:97:17
  ```

  knip found no unused files. Every module in `js/` is reachable from `main.js`.

- **(b) rg.** `rg -w <name>` ran over `js tests tools index.html` for every exported and top-level function. Asset files were checked by file name and by stem against `js/`, `tools/`, `css/`, `index.html` and the keys in `kenney-city-catalog.js`. They were also checked against the image URIs inside every `.glb`.
- **(c) Runtime.** Every request made during load was logged. The scene was walked after load to list which image files sit on a material in use. `planKenneyRoads(map)` was called on the live island map.
- **Island map census** (`data/island.json`, runtime): 504×280 cells. Only these cell types exist: `l` 113,167, `~` 22,809, `g` 3,168, `p` 1,976. There are no `s`, `H`, `V`, `+`, `X`, `b` or `q` cells, and `buildings` is 0. `island-map.json` has 2,094 pieces and 0 `removedRoads`. `localStorage` was empty.

## Findings

Value and risk are H/M/L. Effort is S (under 50 lines), M (one module) or L (several modules). "Proven" means all three checks agree.

### Unused code

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| U1 | `createKenneyRoads` and `addKenneyRoads` are never called. Only `roadRecord` and `roadKey` from `kenney-roads.js` are used. | `js/kenney-roads.js:71`, `:106`. knip lists both. `rg -w` finds only the definitions. | L | L | S | proven |
| U2 | `classifyMarkings` is never called. `PAT` and `ROAD_COLS`…`WALK_ROWS` from the same file are still used by `textures.js:10`. | `js/markings.js:82`. knip lists it. `rg -w classifyMarkings` finds only the definition. | L | L | S | proven |
| U3 | `roadSpec` is never called. | `js/road-sockets.js:97`. knip lists it. `rg` finds only the definition. | L | L | S | proven |
| U4 | `PLAYER_SPEED = 80` is never imported. `player.js` keeps its own `SPEED = 80`. | `js/constants.js:23`, `js/player.js:17`. knip lists it. `rg -w PLAYER_SPEED` finds only the definition. | L | L | S | proven |
| U5 | Six local functions are never called: `cellUV`, `addCurb`, `isCurbNeighbor`, `drawCracks`, `drawStains` and `paintBendSkin`. | `js/city.js:160`, `:234`, `:253`; `js/textures.js:472`, `:485`; `js/build-mode.js:266`. Each name appears exactly once in the repo (an rg count loop). They are not exported, so nothing else can reach them. | L | L | S | proven |
| U6 | The `buildCity` parameter `_removedRoadKeys` is ignored. `main.js` still builds the set for it. | `js/city.js:621`; `js/main.js:511-515`. At runtime `removedRoads` is 0. | L | L | S | proven |
| U7 | Eight exports are only used inside their own file and can drop `export`: `carSeparation`, `CAMERA_DISTANCE`, `HEAD_SCALE`, `TRAFFIC_DB_IDLE`, `TRAFFIC_DB_CRUISE`, `MODULE`, `clipHalfPlane`, `subtractConvex` and `splitFromDocks`. | knip output above. `rg -w` shows only uses in the same file. | L | L | S | proven |
| U8 | `tools/make_road_skins_v2.py` is replaced by v3. v3 contains `make_v2()` and checks it gives the same images by md5. Nothing reads the v2 output files. | `tools/make_road_skins_v3.py:33`, `:78`, `:173`. `rg "_v2\.png"` finds only the v2 script. | L | L | S | proven |
| U9 | Old car "UV-shift" recolouring: **no remains found.** Paint now works through the `aPaint` and `aRecolor` attributes and a shader patch. UVs are only read to sort faces. | `rg -i "uv.?shift\|uvShift\|shiftUV"` finds nothing. `js/cars.js:183-268` (face catalog) and `:342-400` (shader). | – | – | – | proven |

### Old city code that does nothing on the island

The island has no old-city cells and no buildings. The code below still runs at start or every frame, but it produces nothing.

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| L1 | **The ground painter never paints, but its 18 textures are downloaded.** On the island, `covers()` returns false for `l`, `p` and `g`, and `~` is in neither set. All 18 `assets/textures/ground/*` files (8.07 MB) are still downloaded and decoded, and its distance search runs over 141k cells. | `js/ground.js:162-179` (loads), `:617-622` (`covers`), `:29-30` (sets). `js/city.js:633`. Runtime: no material in the scene uses a ground image, and chunk meshes only use 48×48 canvas tiles or no map. | H | L | M | proven |
| L2 | **Quay and bridge art is downloaded but never drawn.** `createQuayMaterials()` loads 7 quay and 7 bridge PNGs (6.6 MB). On the island the plan is `EMPTY_QUAY`, so no quay or bridge mesh is made. `quay-shape.js`, `quay-draw.js` and most of `quay-clip.js` and `quay.js` (about 1,600 lines) never run their drawing paths. | `js/city.js:632-634`, `:613-619`; `js/quay.js:102-144`. Runtime: no quay or bridge image is on any material. | H | L | S | proven |
| L3 | `planKenneyRoads` runs twice at start and returns `placements: 0` on the island. Its `roadPaint`, `covers` and `contains` helpers are still called by ground and traffic. `clearBuildingsFromRoads` has nothing to clear. | `js/city.js:628`, `js/routes.js:133`, `js/kenney-road-plan.js:144`, `:807`. Runtime output: `{count, placements: 0, covers, roadPaint, contains, lanePoint}`. | M | M | M | proven no output; how much can go is unsure |
| L4 | The old downtown `"s"` sidewalk cell is still checked in 7 places. The island has 0 `"s"` cells. `"s"` means **south** in `textures.js:129`, `:256`, `:360`, `:584` and `city.js:238`; those are fine. | Legacy sidewalk uses: `js/pedestrian-walk.js:2-3` (the comment says so), `js/ground.js:30`, `:584`, `js/kenney-road-plan.js:41`, `js/glow.js:83`, `:93`, `:113`, `js/routes.js:207`, `js/markings.js:146`, `js/textures.js:649`. | L | L | S | proven |
| L5 | Street lamps and signals in `glow.js` come from road and sidewalk cells, so the island has none. Their instanced meshes are made with count 0. Car head and tail lights still use `glow.js`. | `js/glow.js:15`, `:79-119`, `:147`. Census: no `H/V/+/X/s` cells. | L | L | S | proven |
| L6 | Building, roof and quay-notch drawing in `city.js` never runs on the island, because there are no buildings. The notch has hard-coded tiles. Building colliders in `physics-scene.js` are still covered by a test. | `js/city.js:259-357` (roofs, notch at `:279`), `:503`. Runtime `buildings: 0`. `tests/physics-step.test.mjs:265` "buildings near the followed body get colliders". | M | M | M | proven for drawing; unsure for colliders (test uses them) |
| L7 | In `main.js`, `blocked()` checks `"b"` cells and `westOfCanal`, which uses the old river line. Neither exists on the island. | `js/main.js:448-470`; `js/kenney-road-plan.js:57`. Census: no `b` cells. | L | L | S | proven |
| L8 | Build mode still supports removing old roads (`removedRoads`). It raycasts an empty `city.roads` group. | `js/city.js:643-646`; runtime `roadsGroupChildren: 0`, `removedRoads: 0`. The saved file format includes the field, so the field itself should stay. | L | M | M | proven |
| L9 | (Traffic is paused: note only.) The old grid traffic code in `routes.js` (lanes from `H/V` cells, hard-coded `PATROL` spots, west-side parked cars) has nothing to work on. Only placed-road lanes drive. | `js/routes.js:58-67`, `:129-140`, `:207`. | – | – | – | proven no-op, note only |

### Unused asset files (do not delete without Ted's yes per file)

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| A1 | 4.3 MB of files are never referenced and never loaded: `assets/player/humanMaleA_v10.glb`, `humanMaleA_v14.glb`, the 16 old `player_idle_*`/`player_walk_*` sprite PNGs (1.6 MB together), `assets/roads/road-straight-{2,3,4}_v2.png`, `assets/textures/quay/quay_strip.png`, `quay_strip_topdown.png` and `Textures/variation-a.png`. | No name or stem match in `js/`, `tools/`, `css/`, `index.html` or the catalog. No `.glb` image URI points to them. Not requested at runtime. | L | L | S | proven unused by the game; unsure whether Ted wants them kept as source art |
| A2 | Folders from the brief. `GLB format/` is **used**: it is the Kenney roads kit, the catalog has 143 items there, and 6 GLBs plus `Textures/colormap.png` load at start. `pedestrians_v15/` is **used** (`js/pedestrians.js:436`, 6 files load). `Textures/` holds only `variation-a.png`, which is unused (A1). `reference/` holds vendored three.js docs: never loaded, but still published (see B7). | Request log; `kenney-city-catalog.js`; `rg -n "reference/"` finds no code use. | L | L | S | proven |

### Bugs and fragile spots

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| B1 | **A saved layout hides newer roads.** `loadNamedMap` uses the browser's `localStorage` copy first. Pressing **P** in build mode writes that copy. From then on, that browser never loads a newer `island-map.json` from the site, and nothing says so. If the fetch fails, the game also starts with no roads and no error. | `js/build-mode.js:844-866` (`readStoredLayout`, `loadNamedMap`), `:1381-1384` (P writes storage), `:1475`. | H | L | S | proven by code |
| B2 | A road piece whose model fails to load is silently skipped (`catch { continue; }`). Pieces also load one at a time. The runtime had 0 failures today. | `js/build-mode.js:1147-1158`. | M | L | S | proven by code |
| B3 | If the stone texture fails to load, a drawn stand-in replaces it with no message. | `js/textures.js:640`. | L | L | S | proven by code |
| B4 | Below 20 FPS, the frame time is capped at 0.05 s for walking, traffic and pedestrians. Physics, and so the driven car, uses the uncapped time (up to five 1/60 s steps). On a slow PC the driven car and traffic would move at different speeds. Movement itself is frame-rate independent (`speed * dt`). | `js/main.js:601-602`, `:616`; `js/physics.js` (5-step cap, pinned by `tests/physics-step.test.mjs:89`). | L | M | S | proven by code; changing it changes feel, so Ted decides |
| B5 | Pedestrian clothing materials set their own `onBeforeCompile`, so the "deeper cast shadow" patch that `main.js` puts on every Lambert and Standard material does not reach pedestrians. In shadow they may look lighter than cars and the player. | `js/pedestrians.js:207-226`; `js/main.js:304-320`. | L | M | S | proven in code; whether it is visible is unsure, and any fix is a visual change for Ted |
| B6 | `tools/build-island-map.mjs` reads its source SVG from `/tmp/island-v2/…` by default. That file is not in the repo, so the island cannot be rebuilt from the repo alone. | `tools/build-island-map.mjs:12`. | M | L | S | proven |
| B7 | `pages.yml` publishes the whole repo (`path: .`), including `tests/`, `tools/`, `reference/` and unused art. | `.github/workflows/pages.yml` ("path: ."). | L | L | S | proven |
| B8 | The README is a little out of date. It still mentions the "yellow square" (now a 3D figure), buildings, signals and street lamps (none on the island). It does not mention **E** to drive. | `README.md:9`, `:15-19`. | L | L | S | proven |

### Duplicated logic

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| D1 | The same integer hash is copied 6 times under 4 names. | `rg -n 374761393 js` gives `city.js:260` (`roofHash`), `city.js:359` (`mixHash`), `routes.js:38`, `glow.js:28`, `markings.js:53` (`tileHash`) and `ground.js:48`. | L | L | S | proven |
| D2 | The cell-type sets are copied, and the copies have drifted. `ROAD` in `ground.js:29` and `kenney-road-plan.js:18` match. `glow.js:15` lacks `4` and `8`. `quay-shape.js:7` adds `A E a e`. `WALK` is in `ground.js:30` and `kenney-road-plan.js:41`. | `rg -n "^const (ROAD\|WALK\|LAND)"`. | L | L | S | proven; most of this goes with L1–L5 |
| D3 | Build mode repeats the same "clone material, set texture" block in 6 skin painters. Ramp and bridge repeat the same vertex-reorder code. | `js/build-mode.js:130`, `:216`, `:266`, `:330`, `:630`, `:774`; `:418` and `:652`. | M | M | M | proven |
| D4 | The player's walking speed is defined twice (see U4). | `js/constants.js:23`, `js/player.js:17`. | L | L | S | proven |

### Performance (three.js)

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| P1 | **Car downloads dominate loading.** All 24 worn car GLBs (`-L2` and `-L3`) load at start: 35.1 MB, 59 % of all bytes. The plain versions add 2.6 MB. Each model is also scanned on the CPU (`faceCatalog`, and `averagePaintLuma` with `getImageData`). | Request log `assets/cars3d/weathered/*.glb`, 1.19–1.98 MB each; `js/cars.js:183-338`. | H | M | M | proven. Shrinking the files changes assets, which needs Ted's yes. Loading later could make cars appear late, so Ted decides. |
| P2 | Ground and quay downloads, 14.7 MB in total (L1 + L2). | See L1 and L2. | H | L | S | proven |
| P3 | SSAO draws the whole scene a second time with a normal material (32 calls next to 34). It then runs full-screen passes at up to 2× device pixel ratio. That is likely the biggest GPU cost, but it cannot be measured here. | `js/main.js:370-446`, `:170-178`; the pass table above. | ? | H | – | unsure. Any change is visual, so Ted tests it on his PC. |
| P4 | The 4096² shadow map is redrawn every frame (29 calls). That is needed because the sun follows the camera and cars move. 680 meshes are set to cast shadows, but chunk hiding keeps the drawn count low. | `js/main.js:324-343`, `:699`; `js/cars.js:639`. | L | M | – | proven; note only |
| P5 | Each frame creates new arrays and objects: `traffic.cars()` builds a new array (`parked.concat(...)`) at least twice per frame; `lights()` builds up to 192 objects; `update()` makes a closure per car group. The minimap corner is redrawn cell by cell every frame. | `js/cars.js:674-676`, `:687`, `:723-760`; `js/main.js:531`, `:690`; `js/minimap.js:190`. | M | L | M | proven by code; the gain needs Ted's FPS check |
| P6 | Car drawing loops over every moving car once per model-and-wear group. There are 679 instanced meshes in total, 192 with count 0 at load. | `js/cars.js:683-720`; runtime counts above. | M | L | M | proven |
| P7 | `lightVisibleCity` walks all city chunks every frame. | `js/main.js:264-279`, `:697`. | L | L | S | proven |
| P8 | Drive effects clone 64 sprite materials, one per smoke puff. | `js/drive-effects.js:139-152`; runtime: 64 sprites. | L | L | S | proven |
| P9 | Geometries rose from 223 to 241 and textures from 166 to 180 over 60 s. This is probably first-time uploads of newly seen cars and pedestrians, not a leak. Removed build-mode pieces do get their materials disposed (`build-mode.js:828-834`) and road batches dispose on rebuild (`road-batch.js:96`, `:154`, `:196`). | Baseline table. | L | L | S | unsure: re-check with a longer run in the first performance PR |

### Structure and tests

| id | Finding | Evidence | Value | Risk | Effort | Certainty |
|---|---|---|---|---|---|---|
| S1 | Large files: `build-mode.js` 1,537 lines, `routes.js` 1,201 (traffic paused), `kenney-road-plan.js` 937, `cars.js` 794. `city.js` (685) and `ground.js` (645) are mostly old-city code (L1–L6). | `wc -l js/*.js` (14,994 lines in total). | M | M | L | proven |
| S2 | Map-specific magic numbers sit in code: quay `BRIDGES` tile boxes, the `quayNotch` tiles 69/173, `WALL_BITES`, `PATROL`, and the island jump spots. Most of them go with L2, L6 and L9. | `js/quay.js:471-475`; `js/city.js:279`; `js/ground.js:106`; `js/routes.js:59`; `js/main.js:83-92`. | L | L | S | proven |
| S3 | **Tests never run automatically.** The only workflow deploys the site, so a broken test can be merged. | `.github/workflows/pages.yml` (no test step). | H | L | S | proven |
| S4 | Nothing tests `city.js`, `ground.js`, `cars.js` (instancing and paint), `pedestrians.js` (crowd update), build-mode load and save, or the main loop. Before any of these change, Phase 2 needs characterization tests. | `rg "^import" tests/*.mjs`: tests only import road-sockets, built-lanes, pedestrian-walk, physics, physics-scene, drive, routes, car-kind, kenney-vehicle and the island tool. | M | L | M | proven |

## PR plan

One topic per PR, safest and most valuable first. Every PR keeps the game looking, sounding and feeling the same. Every PR reruns the baseline above and attaches zoomed before/after screenshots from the same three spots.

1. **Run the tests on every PR (S3).** Add a GitHub Actions job: `cd tests && npm ci && npm test`. The game is not touched.
2. **Remove proven-dead code (U1–U8, D4).** Delete the unused functions and the v2 skin script, make `player.js` use `PLAYER_SPEED`, and drop the unneeded `export` words. Expect zero runtime change: same request list, same draw calls.
3. **Stop the wasted downloads (L1, L2, P2).** On the island, skip loading the ground and quay/bridge textures that nothing draws. That is 14.7 MB less per visit. Proof: request log before/after, the same screenshots, and no metric worse.
4. **Saved-layout trap (B1, B2).** Ted chooses the fix. Options: (a) show a small notice when a saved layout is in use and offer a reset; (b) prefer the site's file when it is newer. Also report pieces that failed to load instead of skipping them silently.
5. **One shared hash and one set of cell types (D1, D2).** First add a characterization test that pins the hash outputs.
6. **Fewer per-frame allocations (P5, P6, P7).** Reuse arrays and objects in the car update and lights. Before/after numbers come from Ted's PC.
7. **Build-mode skin painter cleanup (D3).** Use one helper for the repeated material blocks. Screenshots of every road piece type are compared before and after.
8. **Remove the old city paths step by step (L3–L8, S2).** Use separate small PRs: lamps/signals and the `"s"` cell, then `blocked()`, then building and quay drawing in `city.js`, then `planKenneyRoads`. Each one comes with a characterization test first.
9. **README refresh (B8)** and the island tool's input path (B6). These are text and tooling only.

**For Ted to decide (no PR until you say yes):**

- Deleting the unused art files in A1, file by file.
- Smaller or later-loaded car models (P1).
- Anything about the ambient-shadow effect (P3) or the shadow map (P4), since that is a visual change.
- The pedestrian shadow difference (B5).
- The slow-PC speed cap (B4).
- Publishing less of the repo to Pages (B7).
- Traffic items (L9) stay parked while traffic is paused.
