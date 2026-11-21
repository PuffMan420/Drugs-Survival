# Bake the two generic Sketchfab packs (already split into one GLB per vehicle by
# split_packs.py) into the game's car format, same layout as bake_citypack_cars.py:
#   assets/cars3d/<slug>.glb               mask: low-poly body with class UVs (paint, glass, lamps, trim)
#   assets/cars3d/weathered/<slug>-L2.glb  low-poly body + one baked 512 colour map (dust level 2)
#   assets/cars3d/weathered/<slug>-L3.glb  same, heavier dirt (not for the light-dust cars)
# Dirt uses Blenda's L2/L3 values (car_style_settings.md) but with smooth baked noise, no specks.
# Roughness is one number (0.87) and metal is 0, so each level has a single colour texture.
#
# Run: blender -b --python tools/bake_pack_cars.py -- <split folder> [slug ...]
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASK_DIR = os.path.join(ROOT, "assets", "cars3d")
WEATHER_DIR = os.path.join(MASK_DIR, "weathered")
TEX = 512
BODY_TRIS = 2400
BIG_TRIS = 2900
WHEEL_TRIS = 120
ROUGH = 0.87

# split file -> (game slug, dust kind)
CARS = {
    "civil-ambulance": ("pack-ambulance", "dusty"),
    "civil-citybus": ("pack-city-bus", "dusty"),
    "civil-fire-truck": ("pack-fire-truck", "dusty"),
    "civil-garbage-truck": ("pack-garbage-truck", "dusty"),
    "civil-police-sedan": ("pack-police", "dusty"),
    "civil-postvan": ("pack-post-van", "dusty"),
    "civil-rdservtruck": ("pack-road-service", "dusty"),
    "civil-school-bus": ("pack-school-bus", "dusty"),
    "civil-taxi": ("pack-taxi", "dusty"),
    "civil-towtruck": ("pack-tow-truck", "dusty"),
    "pass-compact": ("pack-compact", "dusty"),
    "pass-coupe": ("pack-coupe", "light"),
    "pass-hatchback": ("pack-hatchback", "dusty"),
    "pass-minivan": ("pack-minivan", "dusty"),
    "pass-offroad": ("pack-offroad", "dusty"),
    "pass-pickup": ("pack-pickup", "dusty"),
    "pass-sedan": ("pack-sedan", "dusty"),
    "pass-sport": ("pack-sport", "light"),
    "pass-suv": ("pack-suv", "light"),
    "pass-wagon": ("pack-wagon", "dusty"),
}
# Checked by eye on side renders (headlights vs tail lights). These come out of
# split_packs.py nose toward +Y and need a half turn so the nose is -Y.
FLIP = {"civil-ambulance", "civil-garbage-truck", "civil-postvan", "civil-taxi", "pass-compact",
        "pass-coupe", "pass-hatchback", "pass-minivan", "pass-pickup"}
BIG = {"civil-citybus", "civil-fire-truck", "civil-garbage-truck", "civil-school-bus", "civil-towtruck", "civil-ambulance"}

# Blenda's values: grime/dirt rgb per level, Kenney grime and dark multiply, HSV 0.93/0.92.
LEVELS = {
    "2": dict(grime=0.34, blot=0.14, film=0.06, dirt=(0.62, 0.48, 0.32), sat=0.93, val=0.92),
    "3": dict(grime=0.78, blot=0.26, film=0.12, dirt=(0.42, 0.30, 0.18), sat=0.93, val=0.92),
    "light": dict(grime=0.14, blot=0.05, film=0.02, dirt=(0.62, 0.48, 0.32), sat=0.97, val=0.96),
}
KENNEY_GRIME = np.array((0.13, 0.10, 0.075))
KENNEY_DARK = np.array((0.50, 0.48, 0.48))
GLASS_RGB = (0.05, 0.06, 0.07)

def game_uv(u, v):
    return (u, 1.0 - v)

UV = {
    "paint": game_uv(0.5 / 16.0, 0.5 / 4.0),
    "glass": game_uv(1.5 / 16.0, 3.5 / 4.0),
    "head": game_uv(5.5 / 16.0, 3.5 / 4.0),
    "tail": game_uv(5.5 / 16.0, 3.5 / 4.0),
    "trim": game_uv(7.5 / 16.0, 2.5 / 4.0),
}
CAT_RGB = {"paint": (1, 0, 0), "glass": (0, 1, 0), "head": (0, 0, 1), "tail": (1, 1, 0), "trim": (1, 0, 1)}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


def tex_pixels(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            img = n.image
            if "px" not in img:
                pass
            w, h = img.size
            a = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(a)
            return a.reshape(h, w, 4)
    return None


def face_cat(matname, px, u, v):
    low = matname.lower()
    if "glass" in low:
        return "glass"
    if "wheel" in low or "wheek" in low:
        return "trim"
    rgb = None
    if px is not None:
        h, w = px.shape[:2]
        x = int(((u % 1.0) + 1.0) % 1.0 * (w - 1))
        y = int(((v % 1.0) + 1.0) % 1.0 * (h - 1))
        rgb = px[y, x, :3]
    if "optic" in low:
        if rgb is None:
            return "head"
        r, g, b = rgb
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if r > 0.35 and r > g * 1.6 and r > b * 1.6:
            return "tail"
        if luma > 0.45:
            return "head"
        return "trim"
    if rgb is not None and (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) < 0.035:
        return "trim"
    return "paint"


def tag_categories(obj, cache):
    """Per-face category as a corner colour 'cat'. Returns {cat: [area, sum_y]}."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    stats = {}
    cats = []
    for f in bm.faces:
        mat = obj.material_slots[f.material_index].material if f.material_index < len(obj.material_slots) else None
        name = mat.name if mat else ""
        if name not in cache:
            cache[name] = tex_pixels(mat)
        u = v = 0.0
        if uvl is not None:
            u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops)
            v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
        c = face_cat(name, cache[name], u, v)
        cats.append(c)
        a = f.calc_area()
        cy = f.calc_center_median().y
        s = stats.setdefault(c, [0.0, 0.0])
        s[0] += a
        s[1] += a * cy
    bm.free()
    if "cat" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["cat"])
    attr = me.color_attributes.new("cat", "FLOAT_COLOR", "CORNER")
    for poly, c in zip(me.polygons, cats):
        col = CAT_RGB[c] + (1,)
        for li in poly.loop_indices:
            attr.data[li].color = col
    return stats


def apply_rot(objs, angle):
    R = Matrix.Rotation(angle, 4, "Z")
    for o in objs:
        o.matrix_world = R @ o.matrix_world
    select_only(objs)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def world_box(objs):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


def tri_count(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def decimate(o, target):
    n = tri_count(o)
    if n <= target:
        return n
    m = o.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = target / n
    m.use_collapse_triangulate = True
    select_only([o])
    bpy.ops.object.modifier_apply(modifier=m.name)
    return tri_count(o)


def new_image(name, colorspace="sRGB"):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False, float_buffer=True)
    img.colorspace_settings.name = colorspace
    return img


def set_target(objs_mat, img):
    for mat in objs_mat:
        n = mat.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        mat.node_tree.nodes.active = n


def emission_material(name, build):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    build(nt, em)
    nt.links.new(em.outputs[0], out.inputs[0])
    return mat


def bake(type_, selected, active, **kw):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    sc.render.bake.margin = 6
    sc.render.bake.margin_type = "EXTEND"
    select_only(selected + [active])
    if selected:
        bpy.ops.object.bake(type=type_, use_selected_to_active=True, cage_extrusion=0.06, max_ray_distance=0.25, **kw)
    else:
        bpy.ops.object.bake(type=type_, **kw)


def to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def px_of(img):
    a = np.empty(TEX * TEX * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(TEX, TEX, 4)


def rgb_to_hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx = c.max(-1)
    mn = c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm_ = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm_] = (r - g)[bm_] / d[bm_] + 4
    h = h / 6.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,), dtype=np.float32)
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m, 0] = a[m]
        out[m, 1] = b[m]
        out[m, 2] = c[m]
    return out


def classify_px(cat):
    names = list(CAT_RGB.keys())
    ref = np.array([CAT_RGB[n] for n in names], dtype=np.float32)
    d = np.abs(cat[..., None, :3] - ref[None, None]).sum(-1)
    return np.argmin(d, -1), names


def make_level(color, height, noise, catidx, names, key):
    P = LEVELS[key]
    idx = {n: i for i, n in enumerate(names)}
    rgb = color[..., :3].copy()
    h = np.clip(height[..., 0], 0, 1)
    n1 = noise[..., 0]
    n2 = noise[..., 1]
    blot = np.clip((n1 - 0.42) / 0.30, 0, 1)
    blot = blot * blot * (3 - 2 * blot)
    amount = ((1 - h) ** 1.35) * P["grime"] + blot * P["blot"] + P["film"]
    amount *= 0.75 + 0.5 * n2
    amount = np.clip(amount, 0, 0.92)
    paint = catidx == idx["paint"]
    trim = catidx == idx["trim"]
    glass = catidx == idx["glass"]
    out = rgb.copy()
    hsv = rgb_to_hsv(np.clip(rgb, 0, 1))
    hsv[..., 1] *= P["sat"]
    hsv[..., 2] *= P["val"]
    c = hsv_to_rgb(hsv)
    a = amount[..., None]
    dirt = np.array(P["dirt"], dtype=np.float32)
    c = c * (1 - a) + dirt * a
    c = c * (1 - a * 0.45) + KENNEY_GRIME * (a * 0.45)
    c = c * (1 - a * 0.18) + (KENNEY_DARK * c) * (a * 0.18)
    out[paint] = c[paint]
    td = (1 - (amount * 0.45))[..., None]
    out[trim] = (rgb * td)[trim]
    ga = (amount * 0.3)[..., None]
    gl = rgb * (1 - ga) + dirt * ga
    out[glass] = gl[glass]
    res = np.ones((TEX, TEX, 4), dtype=np.float32)
    res[..., :3] = np.clip(out, 0, 1)
    return res


def save_png(arr, name, folder):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(arr.ravel())
    path = os.path.join(folder, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img


def weathered_material(img):
    mat = bpy.data.materials.new("body-weathered")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = ROUGH
    return mat


def flat_material(name, rgb, rough=ROUGH):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Roughness"].default_value = rough
    return mat


def prep_wheel(o, cache):
    """Decimate, then split into tyre (dark) and rim (grey) by the wheel texture."""
    mat = o.material_slots[0].material if o.material_slots else None
    name = mat.name if mat else ""
    if name not in cache:
        cache[name] = tex_pixels(mat)
    px = cache[name]
    decimate(o, WHEEL_TRIS)
    me = o.data
    tyre = flat_material("Black", (0.011, 0.011, 0.011))
    rim = flat_material("Grey", (0.16, 0.16, 0.16))
    me.materials.clear()
    me.materials.append(tyre)
    me.materials.append(rim)
    uvl = me.uv_layers.active
    for p in me.polygons:
        lum = 0.0
        if px is not None and uvl is not None:
            u = sum(uvl.data[i].uv.x for i in p.loop_indices) / p.loop_total
            v = sum(uvl.data[i].uv.y for i in p.loop_indices) / p.loop_total
            h, w = px.shape[:2]
            r, g, b = px[int((v % 1) * (h - 1)), int((u % 1) * (w - 1)), :3]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        p.material_index = 1 if lum > 0.18 else 0
    select_only([o])
    base = o.name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [x for x in bpy.context.selected_objects if x.type == "MESH" and len(x.data.polygons)]
    for x in parts:
        used = {p.material_index for p in x.data.polygons}
        keep = x.data.materials[list(used)[0]]
        for p in x.data.polygons:
            p.material_index = 0
        x.data.materials.clear()
        x.data.materials.append(keep)
        while x.data.uv_layers:
            x.data.uv_layers.remove(x.data.uv_layers[0])
    parts.sort(key=lambda x: 0 if x.data.materials[0].name == "Black" else 1)
    return parts


def name_wheels(groups):
    # groups: list of [parts] per wheel. Front = -Y.
    def center(parts):
        mn, mx = world_box(parts)
        return (mn + mx) / 2
    ordered = sorted(groups, key=lambda g: center(g).y)
    half = len(ordered) // 2
    out = []
    for grp, label in ((ordered[:half], "front"), (ordered[half:], "back")):
        grp = sorted(grp, key=lambda g: center(g).x)
        if len(grp) > 2:
            # SUV hubcaps: merge pieces on the same side
            left = [p for g in grp if center(g).x < 0 for p in g]
            right = [p for g in grp if center(g).x >= 0 for p in g]
            grp = [left, right]
        for g, side in zip(grp, ["left", "right"]):
            for i, p in enumerate(g):
                p.name = f"wheel-{label}-{side}" + ("" if i == 0 else f".{i}")
                p.data.name = p.name
                out.append(p)
    return out


def bake_one(src_dir, key):
    slug, kind = CARS[key]
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(src_dir, key + ".glb"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    select_only(objs)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    wheels = [o for o in objs if o.name.startswith("wheel-")]
    def is_decal(o):
        return any(s.material and "decal" in s.material.name.lower() for s in o.material_slots)
    decals = [o for o in objs if o not in wheels and is_decal(o)]
    hi = [o for o in objs if o not in wheels and o not in decals]
    hi_tris = sum(tri_count(o) for o in objs)
    cache = {}
    stats = {}
    for o in hi:
        for c, (a, ay) in tag_categories(o, cache).items():
            s = stats.setdefault(c, [0.0, 0.0])
            s[0] += a
            s[1] += ay
    flipped = False
    if key in FLIP:
        apply_rot(objs, math.pi)
        flipped = True
    # Some pack materials name a UV map the mesh does not have. Use the mesh's own.
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "UVMAP":
                    n.uv_map = ""
    # glass colour for the bake
    for o in hi:
        for s in o.material_slots:
            if s.material and "glass" in s.material.name.lower() and s.material.use_nodes:
                b = s.material.node_tree.nodes.get("Principled BSDF")
                if b:
                    for l in list(b.inputs["Base Color"].links):
                        s.material.node_tree.links.remove(l)
                    b.inputs["Base Color"].default_value = (*GLASS_RGB, 1)
    # low-poly copy
    copies = []
    for o in hi:
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        copies.append(c)
    select_only(copies)
    bpy.ops.object.join()
    low = bpy.context.view_layer.objects.active
    low.name = "body-low"
    low_tris = decimate(low, BIG_TRIS if key in BIG else BODY_TRIS)
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    if "cat" in low.data.color_attributes:
        low.data.color_attributes.remove(low.data.color_attributes["cat"])
    low.data.uv_layers.new(name="Weather")
    select_only([low])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    low.data.materials.clear()
    tmat = bpy.data.materials.new("bake-target")
    tmat.use_nodes = True
    low.data.materials.append(tmat)
    # 1. colour from the high mesh
    color_img = new_image(slug + "-color")
    set_target([tmat], color_img)
    bake("DIFFUSE", hi, low, pass_filter={"COLOR"})
    # 2. category
    saved = {o.name: [s.material for s in o.material_slots] for o in hi}
    def cat_build(nt, em):
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "cat"
        nt.links.new(a.outputs[0], em.inputs[0])
    cmat = emission_material("cat-emit", cat_build)
    for o in hi:
        for s in o.material_slots:
            s.material = cmat
    cat_img = new_image(slug + "-cat", "Non-Color")
    set_target([tmat], cat_img)
    bake("EMIT", hi, low)
    for o in hi:
        for s, m in zip(o.material_slots, saved[o.name]):
            s.material = m
    # 3. decals (colour + alpha) composited over the colour
    # Float bake buffers are linear. The dirt maths and the PNG are sRGB.
    color = px_of(color_img)
    color[..., :3] = to_srgb(color[..., :3])
    if decals:
        dsaved = {o.name: [s.material for s in o.material_slots] for o in decals}
        for mode in ("rgb", "alpha"):
            for o in decals:
                for s in o.material_slots:
                    src = s.material
                    tex = next((n for n in src.node_tree.nodes if n.type == "TEX_IMAGE"), None) if src and src.use_nodes else None
                    bsdf = src.node_tree.nodes.get("Principled BSDF") if src and src.use_nodes else None
                    fac = bsdf.inputs["Alpha"].default_value if bsdf else 1.0
                    def build(nt, em, tex=tex, fac=fac):
                        if tex is None:
                            em.inputs[0].default_value = (0, 0, 0, 1)
                            return
                        t = nt.nodes.new("ShaderNodeTexImage")
                        t.image = tex.image
                        if mode == "rgb":
                            nt.links.new(t.outputs["Color"], em.inputs[0])
                        else:
                            m = nt.nodes.new("ShaderNodeMath")
                            m.operation = "MULTIPLY"
                            m.inputs[1].default_value = fac
                            nt.links.new(t.outputs["Alpha"], m.inputs[0])
                            nt.links.new(m.outputs[0], em.inputs[0])
                    s.material = emission_material("decal-" + mode, build)
            img = new_image(f"{slug}-decal-{mode}", "Non-Color" if mode == "alpha" else "sRGB")
            set_target([tmat], img)
            bake("EMIT", decals, low)
            if mode == "rgb":
                drgb = px_of(img)
                drgb[..., :3] = to_srgb(drgb[..., :3])
            else:
                dal = px_of(img)[..., :1]
        color[..., :3] = color[..., :3] * (1 - dal) + drgb[..., :3] * dal
    # 4. height and smooth noise from the low mesh itself
    zs = [v.co.z for v in low.data.vertices]
    z0, z1 = min(zs), max(zs)
    def h_build(nt, em):
        g = nt.nodes.new("ShaderNodeNewGeometry")
        sp = nt.nodes.new("ShaderNodeSeparateXYZ")
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = z0
        mr.inputs["From Max"].default_value = z1
        nt.links.new(g.outputs["Position"], sp.inputs[0])
        nt.links.new(sp.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], em.inputs[0])
    def n_build(nt, em):
        g = nt.nodes.new("ShaderNodeNewGeometry")
        a = nt.nodes.new("ShaderNodeTexNoise")
        a.inputs["Scale"].default_value = 0.9
        a.inputs["Detail"].default_value = 3
        b = nt.nodes.new("ShaderNodeTexNoise")
        b.inputs["Scale"].default_value = 2.6
        b.inputs["Detail"].default_value = 2
        c = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(g.outputs["Position"], a.inputs["Vector"])
        nt.links.new(g.outputs["Position"], b.inputs["Vector"])
        nt.links.new(a.outputs["Fac"], c.inputs[0])
        nt.links.new(b.outputs["Fac"], c.inputs[1])
        nt.links.new(c.outputs[0], em.inputs[0])
    maps = {}
    for nm, build in (("height", h_build), ("noise", n_build)):
        m = emission_material(nm + "-emit", build)
        low.data.materials.clear()
        low.data.materials.append(m)
        img = new_image(f"{slug}-{nm}", "Non-Color")
        set_target([m], img)
        bake("EMIT", [], low)
        maps[nm] = px_of(img)
    catidx, names = classify_px(px_of(cat_img))
    # 5. face classes for the mask, read from the baked category map
    uvl = low.data.uv_layers["Weather"]
    face_cls = []
    for p in low.data.polygons:
        u = sum(uvl.data[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uvl.data[i].uv.y for i in p.loop_indices) / p.loop_total
        face_cls.append(names[catidx[min(TEX - 1, int(v * TEX)), min(TEX - 1, int(u * TEX))]])
    # 6. wheels
    wheel_parts = []
    if wheels:
        groups = [prep_wheel(w, cache) for w in wheels]
        wheel_parts = name_wheels(groups)
    for o in hi + decals:
        bpy.data.objects.remove(o, do_unlink=True)
    # recentre like the city pack bake: x centred, y centred, floor at 0
    every = [low] + wheel_parts
    mn, mx = world_box(every)
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in every:
        o.location -= off
    select_only(every)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # 7. levels
    levels = ["light"] if kind == "light" else ["2", "3"]
    out_files = []
    os.makedirs(WEATHER_DIR, exist_ok=True)
    tex_dir = os.path.join(tempfile.gettempdir(), "pack-car-textures")
    os.makedirs(tex_dir, exist_ok=True)
    for lv in levels:
        file_lv = "2" if lv == "light" else lv
        arr = make_level(color, maps["height"], maps["noise"], catidx, names, lv)
        img = save_png(arr, f"{slug}-L{file_lv}-body-color", tex_dir)
        mat = weathered_material(img)
        low.data.materials.clear()
        low.data.materials.append(mat)
        low.name = "body"
        low.data.name = "body"
        path = os.path.join(WEATHER_DIR, f"{slug}-L{file_lv}.glb")
        select_only(every)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                                  export_image_format="JPEG", export_materials="EXPORT", export_cameras=False, export_lights=False)
        out_files.append(path)
    # 8. mask: same mesh, class UVs, flat material, no texture
    mask = low.copy()
    mask.data = low.data.copy()
    bpy.context.scene.collection.objects.link(mask)
    me = mask.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap")
    for p, c in zip(me.polygons, face_cls):
        u, v = UV.get(c, UV["paint"])
        for li in p.loop_indices:
            uv.data[li].uv = (u, v)
    me.materials.clear()
    me.materials.append(flat_material("mask-flat", (0.5, 0.5, 0.5)))
    bpy.data.objects.remove(low, do_unlink=True)
    mask.name = "body"
    me.name = "body"
    path = os.path.join(MASK_DIR, f"{slug}.glb")
    select_only([mask] + wheel_parts)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_materials="EXPORT", export_cameras=False, export_lights=False)
    out_files.append(path)
    mn, mx = world_box([mask] + wheel_parts)
    size = mx - mn
    wheel_tris = sum(tri_count(o) for o in wheel_parts)
    counts = {n: face_cls.count(n) for n in CAT_RGB}
    print("BAKED", slug, "flipped", flipped, "hi_tris", hi_tris, "body_tris", low_tris, "wheel_tris", wheel_tris,
          "size", round(size.x, 3), round(size.y, 3), round(size.z, 3), "classes", counts,
          "files", " ".join(f"{os.path.basename(p)}={os.path.getsize(p)}" for p in out_files), flush=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    src = argv[0]
    names = argv[1:] or list(CARS.keys())
    for n in names:
        bake_one(src, n)


if __name__ == "__main__":
    main()
