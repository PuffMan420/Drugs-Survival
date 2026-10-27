# Island map inputs (temporary, from Ted's box)

Binary files are base64 text because they were uploaded through a text-only API.
Decode once, then delete the .b64 files in your PR:

    cd island-map-inputs && for f in *.b64; do base64 -d "$f" > "${f%.b64}"; done && sha256sum -c SHA256SUMS

Contents:
- city-final.png  - approved island sketch (reference image)
- city-final-roads.svg - same sketch, roads only (vector, easiest to read)
- city-final.svg - full sketch with buildings
- BUILD-NOTES.md - scale/piece notes
- road-split-2.glb - skinned Y road (Ted's skin, texture embedded) -> put in assets/roads/
- road-straight-stop.glb - skinned straight road with worn STOP text, same size as road-straight -> assets/roads/
- bridge-water.glb - skinned bridge over water (2 bridge pieces joined, one leg pair in middle, wet stains baked, textures embedded) -> assets/roads/

UPDATE (v2, use these): 
- city-grid-roads.svg - NEW source of truth: roads on grid, full scale 126x70 pieces (504x280 cells)
- city-grid.png - preview of grid map
- city-grid-cells.png - cell view of grid map
- grid.py - generator script (seed 11)
- AGENT-BRIEF-v2.md - current brief
- city-final* is OLD (only land/water shape reference)
