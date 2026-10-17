# Drugs Survival

A top-down city you can walk around in the browser.

The live game is at https://drugs-survival.pages.dev/ . Merging to `main` publishes it there.

## How to play

**WASD** or the **arrow keys** move the yellow square. The camera follows.

**M** opens a map of the whole city. **1** through **6** jump to the skyline, a downtown block, the civic plaza, the harbor, the apartments, and the alleys. **Esc** closes the map.

You stay on roads, sidewalks, parks, plazas, docks, and bridges. Buildings and the water stop you.

## What you should see

- Downtown, the same every time: 260 by 260 blocks, straight avenues of a sensible width, a 4-lane ring road around the coast, alleys, plazas, parks, a river, and a harbor. The sea edge is a straight quay with a hard corner where the shore turns. Empty squares inside a block are a park, a parking lot, or a backyard, and the sidewalk is one continuous curb around the block
- Streets use hand-painted strips: olive paving in the inner city, concrete slabs on the ring, and worn concrete outside it. Most of a street is the plain strip. Oil, patch, and dirty bits are sprinkled along it, and an olive crosswalk sits on the piece of street next to an inner intersection. Alleys use that zone's sidewalk. Plazas use the hex paving. Roofs have a concrete ledge, air-conditioning boxes, and a vent. Each building casts one soft shadow to the southeast, long when the building is tall, following its outline across the street and the cars
- High-rises, glass towers, and brick apartments with different footprints and heights, taller inland and lower along the water
- Buildings show a little of their south side, because the camera is tilted about 12 degrees toward the north and sits about 12.5% closer, and they still lean in perspective
- Crisp pixels: the zoomed view is drawn at one pixel per world unit (840×473) and nearest-scaled to the screen. Small lights mark signals, headlights, taillights, and a dim street lamp
- A small map in the corner, and an FPS counter
- Cars drive the right-hand lane, including the ring road. They speed up, brake before a junction, and steer through a curved arc instead of spinning in place. They keep back from the car ahead and stop for you if you stand in front of them. Others stay parked along the curb. A normal car is about one lane wide. Police cars, ambulances, and fire trucks show up less often. You can walk up to a car, and it stops you

## The map file

The city lives in `data/city.json`. To draw it again after editing the plan in `tools/generate-map.mjs`:

```bash
node tools/generate-map.mjs
```

The plan in that script (where the river, parks, and districts sit) is the easy place to change the layout.
