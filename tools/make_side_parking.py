# Parking bays for the side-road pieces, and a drain-free straight-2 skin.
#
# road-straight-2_v3-clean.png keeps the straight-2 dashes and curb, with the
# grate on the far curb filled from the gutter beside it. road-side-3,
# road-side-entry-3 and road-side-exit-3 are that skin plus stall lines.
# The lines are painted through the same UVs as js/road-side-skin.js, and only
# where the mesh deck sits in the wide pocket: just inside the outer curb,
# stopping before the through lane (the straight road's asphalt begins at
# z = -0.4). Straight pieces stay perpendicular to the road. Entry and exit
# follow the curb normal, so the lines angle as the pocket narrows. Spacing
# is the centre-dash period, so a row of side pieces tiles.

import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "assets/roads/road-straight-2_v3-clean.png"
PARKING = {
    "side": ROOT / "assets/roads/road-side-3.png",
    "entry": ROOT / "assets/roads/road-side-entry-3.png",
    "exit": ROOT / "assets/roads/road-side-exit-3.png",
}
MESH = {
    "side": ROOT / "GLB format/road-side.glb",
    "entry": ROOT / "GLB format/road-side-entry.glb",
    "exit": ROOT / "GLB format/road-side-exit.glb",
}

# Dash centres on the 516-wide skin. One stall per dash, phase-locked so the
# gap across a tile edge is the same 0.25.
STALL_X = (-0.375, -0.125, 0.125, 0.375)
# Outer lip to asphalt on road-side: curb z -0.81, deck z -0.71.
CURB = 0.10
INSET = 0.02
# Through-lane asphalt starts at z = -0.4. Stop a little short of it.
LANE_Z = -0.42
# Centre dashes are 16 px tall on the 515-tall skin, and v tracks z there.
HALF_W = 0.5 * 16 / 515
SOFT = 0.004
MIN_LEN = 0.05

# Full-strength cover of the grate, including its frame. The feather sits
# outside that, on asphalt, so none of the bars are blended back in.
DRAIN_CORE = (50, 164, 52, 90)
DRAIN_SHIFT = 250
DRAIN_FEATHER = 14


def read_glb(path):
    data = Path(path).read_bytes()
    json_len = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20 : 20 + json_len])
    bin_at = 20 + json_len
    bin_len = struct.unpack_from("<I", data, bin_at)[0]
    blob = data[bin_at + 8 : bin_at + 8 + bin_len]
    prim = doc["meshes"][0]["primitives"][0]

    def read(index, components):
        acc = doc["accessors"][index]
        view = doc["bufferViews"][acc["bufferView"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride", components * 4)
        out = []
        for i in range(acc["count"]):
            at = start + i * stride
            out.append(struct.unpack_from("<" + "f" * components, blob, at))
        return out

    acc = doc["accessors"][prim["indices"]]
    view = doc["bufferViews"][acc["bufferView"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    kind = acc["componentType"]
    indices = []
    for i in range(acc["count"]):
        if kind == 5121:
            indices.append(blob[start + i])
        elif kind == 5123:
            indices.append(struct.unpack_from("<H", blob, start + i * 2)[0])
        else:
            indices.append(struct.unpack_from("<I", blob, start + i * 4)[0])
    return read(prim["attributes"]["POSITION"], 3), read(prim["attributes"]["NORMAL"], 3), indices


def outer_curb(points):
    by_x = {}
    for x, y, z in points:
        if y > 0.001 or z >= 0:
            continue
        prev = by_x.get(x)
        if prev is None or z < prev:
            by_x[x] = z
    return sorted(by_x.items())


def curb_at(samples, x):
    if x <= samples[0][0]:
        return samples[0][1]
    if x >= samples[-1][0]:
        return samples[-1][1]
    for i in range(len(samples) - 1):
        x0, z0 = samples[i]
        x1, z1 = samples[i + 1]
        if x0 <= x <= x1:
            t = 0 if x1 == x0 else (x - x0) / (x1 - x0)
            return z0 + t * (z1 - z0)
    return samples[-1][1]


def curb_normal(samples, x):
    span = samples[-1][0] - samples[0][0] or 1
    step = max(span * 0.02, 0.02)
    z0 = curb_at(samples, x - step)
    z1 = curb_at(samples, x + step)
    tx, tz = 2 * step, z1 - z0
    length = (tx * tx + tz * tz) ** 0.5 or 1
    tx, tz = tx / length, tz / length
    # 90° counter-clockwise points from the negative curb toward the road.
    nx, nz = -tz, tx
    if nz < 0:
        nx, nz = -nx, -nz
    return nx, nz


def stall_lines(samples):
    lines = []
    for x in STALL_X:
        nx, nz = curb_normal(samples, x)
        cz = curb_at(samples, x)
        sx = x + nx * (CURB + INSET)
        sz = cz + nz * (CURB + INSET)
        if nz < 0.2 or sz >= LANE_Z:
            continue
        dist = (LANE_Z - sz) / nz
        if dist < MIN_LEN:
            continue
        lines.append((sx, sz, sx + nx * dist, sz + nz * dist))
    return lines


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def line_alpha(px, pz, lines):
    best = 0.0
    reach = HALF_W + SOFT
    for sx, sz, ex, ez in lines:
        dx, dz = ex - sx, ez - sz
        length = (dx * dx + dz * dz) ** 0.5 or 1
        ux, uz = dx / length, dz / length
        along = (px - sx) * ux + (pz - sz) * uz
        across = abs((px - sx) * uz - (pz - sz) * ux)
        if along < -SOFT or along > length + SOFT or across > reach:
            continue
        if across <= HALF_W - SOFT:
            width_t = 1.0
        else:
            width_t = smooth((reach - across) / (2 * SOFT))
        end = 0.0 if 0 <= along <= length else min(abs(along), abs(along - length))
        tip_t = 1.0 if end <= 0 else smooth((SOFT - end) / SOFT)
        best = max(best, width_t * tip_t)
    return best


def dash_yellow(image):
    core = image[252:261, 70:95]
    mask = (core[:, :, 0] > 200) & (core[:, :, 2] < 100)
    return core[mask].mean(0)


def remove_drain(image):
    a = image.astype(float).copy()
    x0, x1, y0, y1 = DRAIN_CORE
    feather = DRAIN_FEATHER
    shift = DRAIN_SHIFT
    X0, X1 = x0 - feather, x1 + feather
    Y0, Y1 = y0, y1 + feather
    src = a[Y0:Y1, X0 + shift : X1 + shift].copy()
    pad = 30
    left = a[Y0:Y1, X0 - pad : X0].mean(1)
    right = a[Y0:Y1, X1 : X1 + pad].mean(1)
    target = (left + right) * 0.5
    src = src - src.mean(1)[:, None, :] + target[:, None, :]
    height, width = Y1 - Y0, X1 - X0
    mask = np.ones((height, width), float)
    mask[:, :feather] = np.linspace(0, 1, feather, endpoint=False)
    mask[:, -feather:] = np.linspace(1, 0, feather, endpoint=False)
    mask[-feather:, :] *= np.linspace(1, 0, feather, endpoint=False)[:, None]
    a[Y0:Y1, X0:X1] = a[Y0:Y1, X0:X1] * (1 - mask[..., None]) + src * mask[..., None]
    return np.clip(a, 0, 255)


def side_uv(x, y, z, nz, min_x, max_x, samples):
    # Same mapping as sideRoadUV in js/road-side-skin.js.
    span = max_x - min_x or 1
    u = (x - min_x) / span

    def curb_band(py, outer):
        d = min(1.0, max(0.0, (0.02 - py) * 5))
        return d if outer else 0.1 - d

    def dist_to_curb(px, pz):
        best = 1e9
        last = len(samples) - 1
        for i in range(last):
            x0, z0 = samples[i]
            x1, z1 = samples[i + 1]
            dx, dz = x1 - x0, z1 - z0
            len2 = dx * dx + dz * dz
            t = 0 if len2 == 0 else min(1.0, max(0.0, ((px - x0) * dx + (pz - z0) * dz) / len2))
            qx, qz = x0 + t * dx, z0 + t * dz
            dist = ((px - qx) ** 2 + (pz - qz) ** 2) ** 0.5
            if dist < best:
                best = dist
        if last == 0:
            x0, z0 = samples[0]
            best = ((px - x0) ** 2 + (pz - z0) ** 2) ** 0.5
        return best

    if abs(nz) > 0.5:
        dist = dist_to_curb(x, z) if z < 0 else 0
        outer = dist < 0.05 if z < 0 else abs(abs(z) - 0.5) < 1e-3
        edge = curb_band(y, outer)
        return u, edge if z < 0 else 1 - edge
    if z < 0:
        dist = dist_to_curb(x, z)
        if dist <= 0.25:
            return u, dist
    return u, z + 0.5


def barycentric(p, a, b, c):
    v0x, v0y = b[0] - a[0], b[1] - a[1]
    v1x, v1y = c[0] - a[0], c[1] - a[1]
    v2x, v2y = p[0] - a[0], p[1] - a[1]
    den = v0x * v1y - v1x * v0y
    if abs(den) < 1e-12:
        return None
    v = (v2x * v1y - v1x * v2y) / den
    w = (v0x * v2y - v2x * v0y) / den
    u = 1 - v - w
    if u < -1e-4 or v < -1e-4 or w < -1e-4:
        return None
    return u, v, w


def paint_texels(clean, key, yellow):
    positions, normals, indices = read_glb(MESH[key])
    samples = outer_curb(positions)
    min_x = min(p[0] for p in positions)
    max_x = max(p[0] for p in positions)
    lines = stall_lines(samples)
    image = clean.copy()
    height, width = image.shape[:2]
    uvs = [
        side_uv(x, y, z, nz, min_x, max_x, samples)
        for (x, y, z), (_, _, nz) in zip(positions, normals)
    ]
    for t in range(0, len(indices), 3):
        ids = indices[t : t + 3]
        if any(normals[i][1] < 0.85 or positions[i][1] > 0.015 for i in ids):
            continue
        world = [(positions[i][0], positions[i][2]) for i in ids]
        if min(p[1] for p in world) > LANE_Z + 0.05:
            continue
        uv = [uvs[i] for i in ids]
        us = [p[0] for p in uv]
        vs = [p[1] for p in uv]
        x0 = max(0, int(np.floor(min(us) * width - 1)))
        x1 = min(width, int(np.ceil(max(us) * width + 1)))
        y0 = max(0, int(np.floor((1 - max(vs)) * height - 1)))
        y1 = min(height, int(np.ceil((1 - min(vs)) * height + 1)))
        for py in range(y0, y1):
            for px in range(x0, x1):
                alpha = 0.0
                hits = 0
                for oy in (0.25, 0.75):
                    v = 1 - (py + oy) / height
                    for ox in (0.25, 0.75):
                        u = (px + ox) / width
                        bary = barycentric((u, v), uv[0], uv[1], uv[2])
                        if bary is None:
                            continue
                        bu, bv, bw = bary
                        wx = bu * world[0][0] + bv * world[1][0] + bw * world[2][0]
                        wz = bu * world[0][1] + bv * world[1][1] + bw * world[2][1]
                        if wz > LANE_Z + SOFT:
                            continue
                        alpha += line_alpha(wx, wz, lines)
                        hits += 1
                if hits == 0 or alpha <= 0:
                    continue
                alpha /= 4
                image[py, px] = image[py, px] * (1 - alpha) + yellow * alpha
    return np.clip(image, 0, 255), lines


def drain_present(image):
    x0, x1, y0, y1 = DRAIN_CORE
    return image[y0:y1, x0:x1].mean(2).min() < 40


def main():
    src = np.asarray(Image.open(CLEAN).convert("RGB")).astype(float)
    # Re-running after the grate is gone must not repaint that gutter.
    clean = remove_drain(src) if drain_present(src) else src
    yellow = dash_yellow(clean)
    Image.fromarray(clean.astype("uint8")).save(CLEAN)
    for key, path in PARKING.items():
        painted, lines = paint_texels(clean, key, yellow)
        Image.fromarray(painted.astype("uint8")).save(path)
        printable = [(round(v, 3) for v in line) for line in lines]
        print(key, [tuple(line) for line in printable])


if __name__ == "__main__":
    main()
