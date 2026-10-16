# GTA Meth Attack 3D

A GTA 2-style browser game. This first version is one city block you can walk around.

## Play

After this is merged, the game is published at:

https://puffman420.github.io/GTA-meth-attack-3d/

Move with **WASD** or the **arrow keys**. The camera follows the yellow square.

The first time, GitHub has to be told to use the workflow. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that, every merge to `main` publishes the site. The address above is the project site for this repository.

## What you should see

- Roads, sidewalks, and box buildings with window and roof textures
- Buildings lean a little, because the camera looks straight down in 3D
- Crisp pixels: the game draws at 960×540 and scales up by whole numbers (exactly 2× on a 1080p screen), with black bars when the window is a different shape
- An FPS counter in the corner

No cars or enemies yet.

## How it is published

The site is plain files. There is no install or compile step. Three.js 0.180.0 is loaded from a pinned address, and `.github/workflows/pages.yml` uploads this folder to GitHub Pages.
