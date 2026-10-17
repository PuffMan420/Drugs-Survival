# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the yellow square. The camera follows.

**M** opens a map of the whole city. **1** through **6** jump to the skyline, the main avenue, the civic plaza, the harbor, the apartments, and the canal. **Esc** closes the map.

You stay on roads, sidewalks, parks, plazas, docks, and bridges. Buildings and the water stop you.

## What you should see

- Downtown, the same every time: 260 by 260 blocks, a 4-lane ring road around the island, wider avenues crossing it, and smaller streets between them
- High-rises and glass towers in the middle, brick apartments around them, parks and a civic plaza on purpose, a canal with bridges, and a harbor with docks
- Buildings show a little of their south side, because the camera is tilted about 12 degrees toward the north and sits about 12.5% closer, and they still lean in perspective
- Crisp pixels: the picture is drawn at 960×540 and scaled up by whole numbers (exactly 2× on a 1080p screen)
- A small map in the corner, and an FPS counter

## The map file

The city lives in `data/city.json`. To draw it again after editing the plan in `tools/generate-map.mjs`:

```bash
node tools/generate-map.mjs
```

The plan in that script (where the river, parks, and districts sit) is the easy place to change the layout.
