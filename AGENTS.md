# Agent rules

- Use a single agent per task.
- Don't start parallel or helper agents unless I ask.
- Start every agent on the same model and effort as this Project.
- Give the Project one narrow task at a time.
- Stop any agent you didn't expect from the Project's agent list.
- Never merge. Ted merges.
- Write prompts in English.
- Keep PRs small and scoped to one change.
- Kenney models stay untouched: no edits to their geometry.
- No NearestFilter, and no drawing at a low resolution and scaling up.
- Every PR includes zoomed screenshots.
- Explore first and wait for plan approval before building.
- Rebase on main before reporting.

## Cursor Cloud specific instructions
Preinstalled by `.cursor/install.sh`: `blender` (4.2.3, run headless `blender -b -P script.py`), `ffmpeg`, python3 Pillow+numpy, node + `tests/` deps (`cd tests && npm test`), `gltf-transform`, Playwright Chromium. Game is served on http://localhost:8080. Do not download Blender again.
