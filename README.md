# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the 3D player. The camera follows.

**E** gets into the nearest car. **E** again gets out. While driving, **W** accelerates, **S** brakes and then reverses, and **A** and **D** steer.

**M** opens a map of the whole island. **1** through **8** jump across it, each landing on a road: Northwest, North, Park, Northeast, Southwest, South, East, and Southeast. **Esc** closes the map. **B** opens build mode. **P** saves the island layout in this browser and downloads `island-map.json`.

You stay on roads, sidewalks, parks, plazas, docks, and bridges. The water stops you. The island has no buildings.

## What you should see

- The island, the same every time. The sea surrounds the land. Roads are the placed pieces. Parks, beach, and open ground stay open
- The camera sits above the island and tilts so the ground reads as a top-down view
- The view is drawn at the screen's own resolution. Cars show headlights and taillights. The island has no street lamps or traffic signals
- A larger map in the corner, and an FPS counter
- Cars drive the right-hand lane. They speed up, brake before a junction, and steer through a curved arc instead of spinning in place. They keep back from the car ahead and stop for you if you stand in front of them. Others stay parked along the curb. A normal car is about one lane wide. Police cars, ambulances, and fire trucks show up less often. You can walk up to a car, and it stops you. If you overlap a parked or moving car, it pushes you back out onto the street so you can walk away

## The map file

The island ground lives in `data/island.json`. The road pieces live in `island-map.json`. Build mode saves over the copy in this browser and downloads `island-map.json`.

## Physics tests

The shared physics world (`js/physics.js`, `js/physics-scene.js`, `js/drive.js`) has headless checks in `tests/`. They need Node 20 or newer:

```bash
cd tests
npm install
npm test
```
