# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the yellow square. The camera follows.

**M** opens a map of the whole city. **1** through **6** jump to downtown, the house neighborhoods, the warehouses, the park, and the harbor. **Esc** closes the map.

You stay on land, docks, and bridges. The water around the coast is the edge of the city.

## What you should see

- A fixed city, the same every time: a street grid, wide main roads, sidewalks, a river and harbor, docks, parks, tall downtown blocks, small houses, and warehouses
- Buildings lean a little, because the camera looks straight down in 3D
- Crisp pixels: the picture is drawn at 960×540 and scaled up by whole numbers (exactly 2× on a 1080p screen)
- A small map in the corner, and an FPS counter

## The map file

The city lives in `data/city.json`. To draw it again after editing the plan in `tools/generate-map.mjs`:

```bash
node tools/generate-map.mjs
```

The plan in that script (where the river, parks, and districts sit) is the easy place to change the layout.
