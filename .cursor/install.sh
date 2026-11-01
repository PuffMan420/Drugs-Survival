#!/usr/bin/env bash
# Idempotent: runs on every Build, may run on old disk state.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
SUDO=""; [ "$(id -u)" != 0 ] && SUDO="sudo"
need=""
for p in ffmpeg python3-pil python3-numpy xz-utils curl libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libgl1 libegl1; do
  dpkg -s "$p" >/dev/null 2>&1 || need="$need $p"
done
if [ -n "$need" ]; then $SUDO apt-get update -qq && $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $need; fi
# Blender 4.2.3 (same version the repo's GLBs are made with).
# download.blender.org often answers curl with a Cloudflare 403, so try it
# first and fall back to public release mirrors. Hash is from blender-4.2.3.sha256.
B=/opt/blender-4.2.3
if [ ! -x "$B/blender" ]; then
  sha=3a64efd1982465395abab4259b4091d5c8c56054c7267e9633e4f702a71ea3f4
  ok=0
  for url in \
    https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz \
    https://ftp.nluug.nl/pub/graphics/blender/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz \
    https://mirrors.ocf.berkeley.edu/blender/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz \
    https://ftp.halifax.rwth-aachen.de/blender/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz
  do
    rm -f /tmp/b.tar.xz
    curl -fsSL --retry 3 --retry-delay 2 "$url" -o /tmp/b.tar.xz \
      && echo "$sha  /tmp/b.tar.xz" | sha256sum -c - \
      && ok=1 && break
  done
  [ "$ok" = 1 ]
  $SUDO mkdir -p "$B" && $SUDO tar -xJf /tmp/b.tar.xz -C "$B" --strip-components=1 && rm /tmp/b.tar.xz
fi
$SUDO ln -sf "$B/blender" /usr/local/bin/blender
# Node on the default PATH. `command -v node` is not enough: this VM's node can
# be an agent shim whose npm is invisible to sudo's secure_path.
if [ ! -x /usr/local/bin/npm ] && [ ! -x /usr/bin/npm ]; then
  node_sha=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
  curl -fsSL https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz -o /tmp/node.tar.xz
  echo "$node_sha  /tmp/node.tar.xz" | sha256sum -c -
  $SUDO tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node.tar.xz
fi
if [ -x /usr/local/bin/npm ]; then NPM=/usr/local/bin/npm
elif [ -x /usr/bin/npm ]; then NPM=/usr/bin/npm
else echo "npm was not installed" >&2; exit 1
fi
export PATH="$(dirname "$NPM"):$PATH"
(cd tests && "$NPM" ci --no-audit --no-fund)
command -v gltf-transform >/dev/null || $SUDO "$NPM" i -g --no-audit --no-fund @gltf-transform/cli@4
# The published package is @gltf-transform/cli. `npx gltf-transform` only
# resolves a local node_modules/.bin entry of that name.
if [ ! -x node_modules/.bin/gltf-transform ]; then
  "$NPM" install --no-save --no-package-lock --no-audit --no-fund @gltf-transform/cli@4
fi
command -v playwright >/dev/null || $SUDO "$NPM" i -g --no-audit --no-fund playwright@1
$SUDO playwright install-deps chromium >/dev/null
playwright install chromium
blender -b --version | head -1; ffmpeg -version | head -1; node -v; gltf-transform --version
