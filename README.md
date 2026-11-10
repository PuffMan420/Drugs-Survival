# Drugs Survival

A browser game built with JavaScript and Three.js.

## Status of this document

The behavior, controls, files, tests, and deployment below are retained from the previous README. They have not been checked against the current code or tested during this documentation update. Creative goals are separate from implemented features.

## Creative direction (goals, not confirmed features)

A dynamic, rotating, top-down 3D view inspired by GTA: Chinatown Wars, with its own identity, more detailed graphics, and a cohesive visual style.

The intended tone is adults-only: vulgar humor, strong language, sexual themes involving consenting adults, drugs and drug use, drug-related crime, and violence. Clarify the intended intensity and level of detail before implementing this content.

## Previously documented controls and behavior (not currently verified)

**WASD** or the **arrow keys** move the 3D player. The camera follows.

**E** gets into the nearest car. **E** again gets out. While driving, **W** accelerates, **S** brakes and then reverses, and **A** and **D** steer.

**M** opens a map of the whole island. **1** through **8** jump across it, each landing on a road: Northwest, North, Park, Northeast, Southwest, South, East, and Southeast. **Esc** closes the map. **B** opens build mode. **P** saves the island layout in this browser and downloads `island-map.json`.

Movement is limited to roads, sidewalks, parks, plazas, docks, and bridges; water stops the player. The previous README says the island has no buildings. This has not been verified and is not a requirement to keep it that way.

### Previously documented appearance and traffic

- The island is the same every time, surrounded by sea. Roads are the placed pieces. Parks, beach, and open ground stay open.
- The camera sits above the island and tilts to give a top-down view.
- Rendering uses the screen's own resolution. Cars have headlights and taillights. The previous README says there are no street lamps or traffic signals.
- A larger map appears in the corner, with an FPS counter.
- Cars use the right-hand lane, speed up, brake before junctions, and steer through curved arcs rather than spinning in place. They keep back from cars ahead and stop for a player standing in front of them. Other cars park along the curb.
- A normal car is about one lane wide. Police cars, ambulances, and fire trucks appear less often.
- Cars block the player. Overlapping a parked or moving car pushes the player back onto the street so they can walk away.

These statements describe the previous documentation, not fresh test results.

## Map files (previously documented)

The island ground lives in `data/island.json`. Road pieces live in `island-map.json`. Build mode saves over the browser's stored copy and downloads `island-map.json`.

## Physics tests (previously documented; not run here)

The shared physics world (`js/physics.js`, `js/physics-scene.js`, `js/drive.js`) has headless checks in `tests/`. The documented requirement is Node 20 or newer:

```bash
cd tests
npm install
npm test
```

These commands are reference instructions, not evidence that dependencies are installed or tests pass. Obtain approval before running commands or installing dependencies during the planning stage.

## Local work and GitHub

Work locally in `C:\Drugs Survival Dev`. Saving a local file does not update GitHub: the changes must be included in a commit and pushed. If using a separate branch, Ted merges the PR into `main`.

The previous README lists https://drugs-survival.pages.dev/ as the live game and says merging into `main` publishes it there. The live site and deployment configuration have not been verified during this update.
