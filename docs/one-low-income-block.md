---
name: Blue block preview
overview: Show one low-income block just north of the start, with a few worn concrete buildings, an alley, a courtyard, and an open market square. No Kenney buildings. Nothing is placed until you approve this list.
todos:
  - id: place-preview
    content: After approval, show a few worn buildings on the blue block north of the start, leaving an alley, a courtyard, and a market square, without saving the island
    status: completed
  - id: check-block
    content: Check in the game that doors face the streets, buildings sit on the ground, and the roads stay clear
    status: completed
isProject: false
---

# One low-income block, for approval

Nothing is placed until you approve this. Roads, the yellow area, combat, driving, and the original model files stay as they are. Kenney houses and Kenney city buildings are not used. The B build menu stays a catalog. This block is a preview only, so it is not written into the saved island.

## Where

The block is in the blue zone on your map, the low-income area around marks 5 and 6. It is the land just north of the start, between these four crossings:

- west and south: tile 82, 202 (the Southwest jump, key 5, is on the west side)
- east and south: tile 98, 202 (the start crossing)
- west and north: tile 82, 170
- east and north: tile 98, 170

The open land inside the roads is about 31 m east to west and 73 m north to south. The yellow area, the canal, the park, and the red and green districts are not touched.

## Buildings

These come from the city model packs, not from Kenney. Each one is a whole building, already about the right size, with its bottom on the ground. Copies keep the same proportions. No model file is rewritten.

From [old_concrete_building_pack__lowpoly.glb](City/old_concrete_building_pack__lowpoly.glb), three separate buildings:

- building 1, about 8 m by 8 m and 7 m tall
- building 4, about 8 m by 8 m and 6 m tall
- building 5, about 8 m by 8 m and 7 m tall

Plus the worn building [abadoned_building__lowpoly.glb](City/abadoned_building__lowpoly.glb), about 10 m by 10 m and 6 m tall.

Plus one larger apartment, the already scaled copy [conjunto_habitacional_kpd___villa_carmen_quilpue.glb](City Single Mesh Corrected/conjunto_habitacional_kpd___villa_carmen_quilpue.glb). About 26 m wide, 11 m deep, and 12 m tall. The tiny original is not used.

This is one real block, not a row of models. Buildings face the street. Their backs face a shared yard. Doors are at sidewalk level, about 1.8 m back from the road.

- Southwest corner, on the street you start on: the worn building. Its door faces that street.
- Southeast corner, where the start crossing is: left open. The buildings beside it turn toward that open corner, so it reads as a small market square, not a missing house. No stalls in this step.
- West street: concrete building 1, door to the west road. A gap about 4 m wide sits between it and the worn building. That gap is the alley from the street into the yard.
- East street, north of the square: concrete building 4, then a normal gap, then concrete building 5. Doors face the east road.
- North end: the apartment, door to the north road. It stops short of the east side, so the yard still opens onto the north street.
- Center: empty. That is the back courtyard behind the houses. It is not another street.

Five buildings. The long streets are not walled shut, and the corner by the start is the only square. Later blocks follow the same idea: fronts on the street, a yard behind, an alley through, and a square only where a corner is actually open.

## Left out

Kenney buildings stay out of the city look. Whole streets, districts, the broken city shell, and the tiny unscaled conjunto stay out. The downtown towers in the same city folder are 30 m to 50 m across, so they do not fit this block. Shops and taller buildings wait for the red and green areas.

## After you approve

Show this block in a preview group near the start. Take each concrete building out of the pack as its own object. Use the metre size already used for the worn building and the apartment. Turn off the old four-model sample row so it does not cover this block. Do not save the island, and do not change the roads. Then open the game at the start and check that doors face the street or the corner square, backs face the yard, the alley joins the street to the yard, buildings sit on the ground, and the cars can still use the roads.
