# city-final – notes for the build agent

Files: `city-final.svg` (full), `city-final-roads.svg` (no buildings), script `clean_final.py`.
SVG coords: viewBox -192 -111 2304x1336. Water #a9d9fe, land #ece5db, sand #e6d3a3, park #c5e8c5.
Yellow (#fafa7a) = main 4-lane roads, white = normal streets, dark outline over water = bridges.

## Scale (suggestion)
- Kenney road piece = 4 cells (ROAD_TILES=4, TILE=48).
- Typical block spacing in the map ~45-50 units -> make it 3 road pieces (12 cells).
  => 1 map unit ~ 0.25 cell. Whole map ~575 x 335 cells. Downscale (e.g. 0.15) if too big.
- Snap every street to the 4-cell road grid; only 90° rotations exist.

## Piece mapping
- straight runs: road-straight(-N) / road-straight-half
- 90° corners: road-bend-square (sharp) or road-bend (soft)
- T junction: road-intersection; + junction: road-crossroad
- canal crossings (3 yellow + 1 white): road-bridge(-2) with road-slant-high-4 ramps
- yellow 4-lane: two parallel lanes / existing four-lane setup in build mode
- roundabout: not used (the park plaza was removed)

## Tricky spots
- Diagonal district (south-east of the park, ~45°): not buildable as diagonals.
  Recommended: build it as an axis-aligned grid (rotate the whole district by 45°),
  or turn it into a normal grid. The slanted yellow roads become stair-steps or straight axis roads.
- The small island and the west part are tilted ~20-30°: snap to the axis grid.
- Slanted yellow road under the park to the east ring: make it a straight E-W road.
- White streets stop ~16 units before yellow roads on purpose (no junction there).
  Only the connected ones should become T/+ junctions; the others end with a block in between.
- Block of small houses just below the park: placeholder, put normal buildings there.
- Some original MapGenerator streets are slightly curved/wobbly: just straighten them.
