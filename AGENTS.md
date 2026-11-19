# Agent rules for Drugs Survival

Read this at the start of every chat. These rules always apply, even if a prompt forgets them.

## Where and how we work

- We build Drugs Survival locally. All files are in `C:\Drugs Survival Dev`. Look there first.
- Continue the existing project; never start over.
- Stay on `main`. Never create branches (no `cursor/` branches), never open pull requests, never rebase or rewrite Git history, never force-push.
- Do not commit or push unless Ted says so in this chat. Ted tests first.
- Use one agent per task. Do not start helper or parallel agents unless Ted asks.
- If an approach fails twice, stop and tell Ted what failed.
- Never delete files, move asset folders, or install paid tools without Ted's OK. Keep original assets intact and save edited versions as new files.
- Read-only folders: `06 Player Character\Kaykit all i need` and `assets\new stuff`.
- Every file that committed code imports must also be committed.

## Talking to Ted

- English only, in replies, code comments and docs.
- Ted is a beginner and dyslexic. Use short, simple sentences. Never ask him to edit a line himself; give finished text or do it.
- Ask one question at a time, with options A, B, C and Other.
- Separate clearly what you tested, what you assume and what you do not know. Never claim something works without testing it.
- Every visual choice (how characters, cops, cars, colors, HUD look) is Ted's decision. Ask before it goes in the game.

## Game facts

- Browser game in JavaScript, Three.js 0.180 and Rapier. Top-down rotating 3D view inspired by GTA: Chinatown Wars, adults only.
- Sizes are in car units, never meters. Characters are `CHARACTER_HEIGHT = 37.35` (see `js/characters.js`).
- All characters are Quaternius Ultimate Modular Men/Women on the Quaternius Universal Animation Library (UAL1 + UAL2) skeleton. Never KayKit. Never swap the character model or skeleton unless Ted asks.
- Every tuning number is a named exported constant and is listed in `docs/balance.md`. Do not change numbers Ted did not ask about.
- The live site https://drugs-survival.pages.dev/ updates automatically from `main` on GitHub.

## Testing

- Test in the local game from the normal gameplay camera. Check that walking, weapons, driving, the map and the start menu still work, with no errors in the browser console.
- Do not ask Ted to measure FPS.

## Graphics

- Nothing enters the game below the GPU's max anisotropy. Use `installMaxAnisotropy` in `js/anisotropy.js`. Do not cap it.
- Never use `NearestFilter`, never turn mipmaps off, and never render at low resolution and upscale.
- Skip anisotropy only where it has no effect: no mipmaps, render targets and shadow maps.
- Blender is installed on Ted's PC. With his OK you may run it in the background to inspect or fix models.