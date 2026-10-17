# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the yellow square. The camera follows.

**M** opens a map of the whole city. **1** through **6** jump to the skyline, a downtown block, the civic plaza, the harbor, the apartments, and the alleys. **Esc** closes the map.

You stay on roads, sidewalks, parks, plazas, docks, and bridges. Buildings and the water stop you.

## What you should see

- Downtown, the same every time: 260 by 260 blocks, straight avenues of a sensible width, a 4-lane ring road around the coast, alleys, plazas, parks, a river, and a harbor
- Grey-green streets with a dashed yellow center line, white zebra crossings, turn arrows, and the word SLOW. Sidewalks are one even light olive paving with a raised curb, and the curb rounds the corner at each intersection. Roofs have a concrete ledge, air-conditioning boxes, and a vent. Buildings cast a long soft shadow toward the southeast
- High-rises, glass towers, and brick apartments with different footprints and heights, taller inland and lower along the water
- Buildings show a little of their south side, because the camera is tilted about 12 degrees toward the north and sits about 12.5% closer, and they still lean in perspective
- Crisp pixels: the picture is drawn at 960×540 and scaled up by whole numbers (exactly 2× on a 1080p screen)
- A small map in the corner, and an FPS counter
- Cars parked along the curbs and driving the avenues. A normal car is about one lane wide. Police cars, ambulances, and fire trucks show up less often. You can walk up to a car, and it stops you

## The map file

The city lives in `data/city.json`. To draw it again after editing the plan in `tools/generate-map.mjs`:

```bash
node tools/generate-map.mjs
```

The plan in that script (where the river, parks, and districts sit) is the easy place to change the layout.
