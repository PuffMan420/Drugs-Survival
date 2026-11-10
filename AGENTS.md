# Agent rules

## Read and plan first

- Continue the existing project; do not start over.
- Read the relevant project files and documentation first. Explain briefly what exists, what is unclear, and which instructions may be outdated or conflicting. Do not assume old plans still apply.
- Reading supplied or accessible files is allowed. During planning, wait for explicit approval before running commands, changing code, installing dependencies, or deleting files. Propose one small, clear step at a time.
- Review the relevant code and proposed changes before building or running checks. Do not claim something works without testing it; state what was tested and what remains unverified.
- Keep documentation about existing behavior separate from creative goals. Confirm behavior before changing factual descriptions.

## Working with Ted

- Use simple language and plain text. Ted is a beginner.
- Ask one question at a time. Refer to visible buttons rather than keyboard shortcuts when guiding Ted through the interface.
- Write prompts in English.
- Use a single agent per task. Do not start parallel or helper agents unless Ted asks.
- Keep tasks and PRs small and scoped to one change.
- Never merge. Ted merges.
- Include zoomed screenshots in PRs for visual changes, not unrelated documentation or nonvisual work.
- Do not rebase or rewrite Git history without explicit permission. There is no blanket requirement to rebase before reporting.
- Do not use NearestFilter or render at low resolution and upscale.

## Creative direction

- Browser-based JavaScript and Three.js game with a dynamic, rotating top-down 3D perspective inspired by GTA: Chinatown Wars, but with a unique identity, more detailed graphics, and a cohesive visual style.
- Adults-only creative goals: vulgar humor, strong language, sexual themes involving consenting adults, drugs and drug use, drug-related crime, and violence. These are goals, not claims about implemented features. Clarify intensity and level of detail before implementing.
- Character models and animations may be reconsidered in an approved plan. This document does not authorize modifying or deleting assets.

## Local development

- The local project folder is `C:\Drugs Survival Dev`.
- Do not assume tools or dependencies from a cloud environment are installed locally. Check the relevant setup with approval before running commands or installing anything.
- Local saves do not update GitHub. Changes must be committed and pushed; branch changes reach `main` when Ted merges the PR.
- The previous README says merging into `main` deploys to https://drugs-survival.pages.dev/. Verify the deployment setup before relying on it.

## Cursor Cloud setup (previously documented; verify in that environment)

This section applies only to Cursor Cloud, not the local computer. The previous instructions say `.cursor/install.sh` preinstalls:

- Blender 4.2.3; headless usage: `blender -b -P script.py`
- `ffmpeg`
- Python 3 with Pillow and numpy
- Node and the dependencies in `tests/`; test command: `cd tests && npm test`
- `gltf-transform`
- Playwright Chromium

The documented game server address is http://localhost:8080. Its availability has not been checked. Do not download Blender again when the documented installation is present; verify the environment first. These setup notes do not grant approval to run commands or install software.



**Extra rules for Drugs Survival**

When you need a decision, ask one question at a time with options A, B, C, and Other.

Do not put explanations meant for me inside code blocks.

Separate clearly what you verified, what you assume, and what you do not know. Check Three.js and Blender APIs against official documentation when it matters.

Blender is installed on my PC. With my approval, you may run it in the background to inspect, repair, and prepare 3D models. Keep original assets intact and save edited versions as separate files. Do not move the assets folders.

When I ask to save, create a new branch, commit, push it, and open a pull request against main, then give me the link. Before committing, check for files too large for GitHub and tell me about them.

Test changes in the local game from the normal gameplay camera, and make sure walking, weapons, driving, and the map still work.
