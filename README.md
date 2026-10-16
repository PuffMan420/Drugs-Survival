# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the yellow square. The camera follows.

**M** opens a map of the whole city. **1** through **6** jump to the skyline, the slanted avenue, the civic plaza, the harbor, the apartments, and the alleys. **Esc** closes the map.

You stay on land, docks, and bridges. The water around the coast is the edge of the city.

## What you should see

- Downtown, the same every time: 260 by 260 blocks, bent main roads, diagonal streets, alleys, plazas, small parks, a river, and a harbor with docks
- High-rises, glass towers, and brick apartments with different footprints and heights, taller inland and lower along the water
- Buildings show a little of their south side, because the camera is tilted about 12 degrees toward the north, and they still lean in perspective
- Crisp pixels: the picture is drawn at 960×540 and scaled up by whole numbers (exactly 2× on a 1080p screen)
- A small map in the corner, and an FPS counter

## The map file

The city lives in `data/city.json`. To draw it again after editing the plan in `tools/generate-map.mjs`:

```bash
node tools/generate-map.mjs
```

The plan in that script (where the river, parks, and districts sit) is the easy place to change the layout.
