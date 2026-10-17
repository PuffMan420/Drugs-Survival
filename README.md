# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the yellow square. The camera follows.

**M** opens a map of the whole city. **1** through **6** jump to the skyline, a downtown block, the civic plaza, the harbor, the apartments, and the alleys. **Esc** closes the map.

You stay on roads, sidewalks, parks, plazas, docks, and bridges. Buildings and the water stop you.

## What you should see

- Downtown, the same every time: 260 by 260 blocks, straight avenues of a sensible width, a 4-lane ring road around the coast, alleys, plazas, parks, a river, and a harbor
- Grey-green streets with a dashed yellow center line and white zebra crossings. A turn arrow sits in the lane just before an intersection, and SLOW appears occasionally near a crossing, one marking on that approach. Sidewalks are one even light olive paving with a raised curb, and the curb rounds the corner at each intersection. Roofs have a concrete ledge, air-conditioning boxes, and a vent. Each building casts one soft shadow to the southeast, long when the building is tall, following its outline across the street and the cars
- High-rises, glass towers, and brick apartments with different footprints and heights, taller inland and lower along the water
- Buildings show a little of their south side, because the camera is tilted about 12 degrees toward the north and sits about 12.5% closer, and they still lean in perspective
- Soft picture: the same zoomed view is smooth-scaled to the screen instead of hard nearest pixels, with a light warm haze and a glow on street lamps, signals, and car lights
- A small map in the corner, and an FPS counter
- Cars drive the right-hand lane, including the ring road. They speed up, brake before a junction, and steer through a curved arc instead of spinning in place. They keep back from the car ahead and stop for you if you stand in front of them. Others stay parked along the curb. A normal car is about one lane wide. Police cars, ambulances, and fire trucks show up less often. You can walk up to a car, and it stops you

## The map file

The city lives in `data/city.json`. To draw it again after editing the plan in `tools/generate-map.mjs`:

```bash
node tools/generate-map.mjs
```

The plan in that script (where the river, parks, and districts sit) is the easy place to change the layout.
