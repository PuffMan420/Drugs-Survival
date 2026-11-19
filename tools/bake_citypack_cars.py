# Bake City Pack cars into the same dirt-skin layout as assets/cars3d/weathered.
# The game matches paint faces by vertex position, then tints the body-weathered
# material. L2 is light dirt. L3 is heavy dirt. Wheel objects use the names
# wheel-front-left, wheel-front-right, wheel-back-left, wheel-back-right.
#
# Run:
#   blender --background --python tools/bake_citypack_cars.py -- car.glb
# With no name, every car in assets/citypack is baked.

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "citypack")
MASK_DIR = os.path.join(ROOT, "assets", "cars3d")
WEATHER_DIR = os.path.join(MASK_DIR, "weathered")
PREVIEW_DIR = os.path.join(ROOT, "tools", "citypack-preview")

# Paint cells the game already understands. Headlights must NOT use the
# headlight cell: that cell also folds the lamp mesh.
# Blender flips V on glTF export, so these are stored as 1 - the game's V.
def game_uv(u, v):
    return (u, 1.0 - v)


UV = {
    "paint": game_uv(0.5 / 16.0, 0.5 / 4.0),
    "glass": game_uv(1.5 / 16.0, 3.5 / 4.0),
    "head": game_uv(5.5 / 16.0, 3.5 / 4.0),
    "tail": game_uv(5.5 / 16.0, 3.5 / 4.0),
    "siren": game_uv(7.5 / 16.0, 3.5 / 4.0),
    "trim": game_uv(7.5 / 16.0, 2.5 / 4.0),
}

CARS = {
    "car.glb": "citypack-car",
    "car-2.glb": "citypack-car-2",
    "suv.glb": "citypack-suv",
    "pickup-truck.glb": "citypack-pickup",
    "sports-car.glb": "citypack-sports",
    "sports-car-2.glb": "citypack-sports-2",
    "police-car.glb": "citypack-police",
    "van.glb": "citypack-van",
    "bus.glb": "citypack-bus",
}

TEX = 512


def argv_after_dd():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    active = None
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
        active = obj
    if active is not None:
        bpy.context.view_layer.objects.active = active
    return active


def apply_all(objects):
    select_only(objects)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def world_box(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world[axis])
                maxs[axis] = max(maxs[axis], world[axis])
    return mins, maxs


def rotate_z(objects, turns):
    if turns % 4 == 0:
        return
    select_only(objects)
    bpy.ops.transform.rotate(value=math.pi * 0.5 * turns, orient_axis="Z")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def center_x(objects):
    mins, maxs = world_box(objects)
    mid = (mins.x + maxs.x) / 2.0
    select_only(objects)
    bpy.ops.transform.translate(value=(-mid, 0, 0))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def object_center(obj):
    total = Vector((0, 0, 0))
    for corner in obj.bound_box:
        total += obj.matrix_world @ Vector(corner)
    return total / 8.0


def is_front_name(name):
    low = name.lower()
    return "frontleft" in low or "frontright" in low or "frontwheel" in low or "front_l" in low or "front_r" in low


def is_back_name(name):
    return "backwheel" in name.lower()


def join_many(objects, name):
    objects = [obj for obj in objects if obj and obj.name in bpy.data.objects]
    if not objects:
        return None
    select_only(objects)
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def loose_parts(obj):
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [item for item in bpy.context.selected_objects if item.type == "MESH"]


def split_by_x(obj):
    xs = [vert.co.x for vert in obj.data.vertices]
    if not xs:
        return [obj]
    mid = (min(xs) + max(xs)) * 0.5
    select_only([obj])
    bpy.ops.object.mode_set(mode="OBJECT")
    for vert in obj.data.vertices:
        vert.select = vert.co.x >= mid
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [item for item in bpy.context.selected_objects if item.type == "MESH"]


def side_join(parts, base):
    if len(parts) <= 2:
        return parts
    left = []
    right = []
    for obj in parts:
        if object_center(obj).x < 0:
            left.append(obj)
        else:
            right.append(obj)
    made = []
    if left:
        made.append(join_many(left, base + "-a"))
    if right:
        made.append(join_many(right, base + "-b"))
    return made


def prepare_wheels(meshes):
    fronts = []
    backs = []
    body = []
    for obj in meshes:
        if is_front_name(obj.name):
            fronts.append(obj)
        elif is_back_name(obj.name):
            backs.append(obj)
        else:
            body.append(obj)
    wheel_parts = list(fronts)
    for obj in backs:
        parts = loose_parts(obj)
        if len(parts) == 1:
            parts = split_by_x(parts[0])
        wheel_parts.extend(side_join(parts, "back"))
    return body, wheel_parts


def face_length_along_y(objects):
    mins, maxs = world_box(objects)
    if maxs.x - mins.x > (maxs.y - mins.y) * 1.15:
        rotate_z(objects, 1)


def point_front_to_minus_y(objects, front_hint):
    if front_hint:
        front_y = sum(object_center(obj).y for obj in front_hint) / len(front_hint)
        others = [obj for obj in objects if obj not in front_hint]
        if others:
            back_y = sum(object_center(obj).y for obj in others) / len(others)
        else:
            back_y = 0
        if front_y > back_y:
            rotate_z(objects, 2)
        return
    body = objects[0]
    verts = body.data.vertices
    if not verts:
        return
    ys = [vert.co.y for vert in verts]
    y0 = min(ys)
    y1 = max(ys)
    span = max(0.001, y1 - y0)
    low = []
    high = []
    for vert in verts:
        if (vert.co.y - y0) / span < 0.2:
            low.append(vert.co.z)
        elif (vert.co.y - y0) / span > 0.8:
            high.append(vert.co.z)
    if low and high and (sum(low) / len(low)) > (sum(high) / len(high)):
        rotate_z(objects, 2)


def material_image(mat):
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            return node.image
    return None


def category_from_name(name):
    low = (name or "").lower()
    if "window" in low or "glass" in low or "windscreen" in low:
        return "glass"
    if "siren" in low or "bluelight" in low:
        return "siren"
    if "brake" in low or "tail" in low:
        return "tail"
    if "head" in low or "whitelight" in low:
        return "head"
    if low in ("black", "grey", "gray") or "rubber" in low or "tyre" in low or "tire" in low:
        return "trim"
    if "chrome" in low or low.startswith("metal"):
        return "trim"
    return None


def sample_category(image, pixels, u, v):
    width, height = image.size
    x = int((((u % 1.0) + 1.0) % 1.0) * (width - 1))
    y = int((((v % 1.0) + 1.0) % 1.0) * (height - 1))
    index = (y * width + x) * 4
    r, g, b = pixels[index], pixels[index + 1], pixels[index + 2]
    luma = r * 0.2126 + g * 0.7152 + b * 0.0722
    if luma > 0.72 and r > 0.7 and g > 0.55 and b < 0.7:
        return "head"
    if r > 0.45 and r > g * 1.45 and r > b * 1.45 and luma > 0.25:
        return "tail"
    if b > r * 1.15 and b > 0.25 and g > 0.2 and r < 0.55 and luma < 0.75:
        return "glass"
    if luma < 0.08:
        return "trim"
    return "paint"


def face_categories(obj):
    import bmesh

    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.active
    cache = {}
    cats = []
    for face in bm.faces:
        mat = None
        if face.material_index < len(obj.material_slots):
            mat = obj.material_slots[face.material_index].material
        named = category_from_name(mat.name if mat else "")
        if named:
            cats.append(named)
            continue
        image = material_image(mat)
        if image is None or uv_layer is None:
            cats.append("paint")
            continue
        if image.name not in cache:
            cache[image.name] = (image, list(image.pixels))
        image, pixels = cache[image.name]
        u = sum(loop[uv_layer].uv.x for loop in face.loops) / len(face.loops)
        v = sum(loop[uv_layer].uv.y for loop in face.loops) / len(face.loops)
        cats.append(sample_category(image, pixels, u, v))
    bm.free()
    return cats


def paint_category_colors(obj, cats):
    mesh = obj.data
    if "cat" in mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes["cat"])
    attr = mesh.color_attributes.new("cat", "FLOAT_COLOR", "CORNER")
    colors = {
        "paint": (1, 0, 0, 1),
        "glass": (0, 1, 0, 1),
        "head": (0, 0, 1, 1),
        "tail": (1, 1, 0, 1),
        "siren": (0, 1, 1, 1),
        "trim": (1, 0, 1, 1),
    }
    data = attr.data
    corner = 0
    for face_index, poly in enumerate(mesh.polygons):
        color = colors[cats[face_index]]
        for _loop in poly.loop_indices:
            data[corner].color = color
            corner += 1


def collapse_to_one_material(obj):
    # The game reads one mesh named body. Several materials become a group,
    # and the paint mask then cannot find that body.
    import bmesh

    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for face in bm.faces:
        face.material_index = 0
    bm.to_mesh(mesh)
    bm.free()
    keep = mesh.materials[0] if mesh.materials else bpy.data.materials.new("mask-flat")
    mesh.materials.clear()
    mesh.materials.append(keep)


def set_class_uvs(obj, cats):
    import bmesh

    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    layer = bm.loops.layers.uv.active
    if layer is None:
        layer = bm.loops.layers.uv.new("UVMap")
    for face, cat in zip(bm.faces, cats):
        u, v = UV.get(cat, UV["paint"])
        for loop in face.loops:
            loop[layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def smart_uv(obj):
    mesh = obj.data
    if "Weather" not in mesh.uv_layers:
        mesh.uv_layers.new(name="Weather")
    mesh.uv_layers.active = mesh.uv_layers["Weather"]
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.03)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.uv_layers.active = mesh.uv_layers["Weather"]


def new_image(name):
    image = bpy.data.images.new(name, TEX, TEX, alpha=False)
    image.colorspace_settings.name = "sRGB"
    return image


def bake_diffuse(obj, image):
    select_only([obj])
    image.colorspace_settings.name = "sRGB"
    for mat in obj.data.materials:
        if mat is None:
            continue
        mat.use_nodes = True
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.nodes.active = node
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    scene.render.bake.margin_type = "EXTEND"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})


def bake_emit(obj, image, connect):
    select_only([obj])
    saved = [slot.material for slot in obj.material_slots]
    mat = bpy.data.materials.new("citypack-bake-temp")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    connect(nodes, links, emit)
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    links.new(emit.outputs["Emission"], output.inputs["Surface"])
    if not obj.material_slots:
        obj.data.materials.append(mat)
    else:
        for slot in obj.material_slots:
            slot.material = mat
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    bpy.ops.object.bake(type="EMIT")
    for index, old in enumerate(saved):
        obj.material_slots[index].material = old
    bpy.data.materials.remove(mat)


def connect_height(z0, z1):
    def connect(nodes, links, emit):
        geom = nodes.new("ShaderNodeNewGeometry")
        sep = nodes.new("ShaderNodeSeparateXYZ")
        span = nodes.new("ShaderNodeMapRange")
        links.new(geom.outputs["Position"], sep.inputs["Vector"])
        links.new(sep.outputs["Z"], span.inputs["Value"])
        span.inputs["From Min"].default_value = z0
        span.inputs["From Max"].default_value = max(z1, z0 + 0.001)
        span.inputs["To Min"].default_value = 0
        span.inputs["To Max"].default_value = 1
        links.new(span.outputs["Result"], emit.inputs["Color"])
    return connect


def connect_category(nodes, links, emit):
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "cat"
    links.new(attr.outputs["Color"], emit.inputs["Color"])


def read_px(image):
    return list(image.pixels)


def write_px(image, pixels):
    image.pixels = pixels
    image.update()


def noise(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n & 0xFFFFFF) / float(0xFFFFFF)


def cat_of(r, g, b):
    best = "paint"
    best_d = 99
    table = {
        "paint": (1, 0, 0),
        "glass": (0, 1, 0),
        "head": (0, 0, 1),
        "tail": (1, 1, 0),
        "siren": (0, 1, 1),
        "trim": (1, 0, 1),
    }
    for name, color in table.items():
        dist = abs(r - color[0]) + abs(g - color[1]) + abs(b - color[2])
        if dist < best_d:
            best = name
            best_d = dist
    return best


def make_level(color_px, height_px, cat_px, level):
    count = TEX * TEX
    color = list(color_px)
    rough = [0.0] * (count * 4)
    emit = [0.0] * (count * 4)
    # L2 is a dusty wash. L3 is caked dirt, darker and rougher.
    grime = 0.34 if level == 2 else 0.78
    speck = 0.22 if level == 2 else 0.55
    dirt_rgb = (0.62, 0.48, 0.32) if level == 2 else (0.42, 0.30, 0.18)
    for i in range(count):
        x = i % TEX
        y = i // TEX
        base = i * 4
        kind = cat_of(cat_px[base], cat_px[base + 1], cat_px[base + 2])
        h = height_px[base]
        n = noise(x, y)
        amount = 0.0
        if kind == "paint":
            amount = ((1.0 - h) ** 1.35) * grime + (0.18 if n > 0.9 else 0.0) * speck
            amount = max(0.0, min(0.92, amount))
            for channel in range(3):
                color[base + channel] = color[base + channel] * (1.0 - amount) + color[base + channel] * dirt_rgb[channel] * amount
        elif kind == "trim":
            amount = ((1.0 - h) ** 1.5) * grime * 0.45
            for channel in range(3):
                color[base + channel] *= 1.0 - amount
        roughness = 0.58 + amount * 0.36
        emission = (0.0, 0.0, 0.0)
        if kind == "glass":
            roughness = 0.08
        elif kind == "head":
            roughness = 0.22
            emission = (1.0, 0.94, 0.72)
        elif kind == "tail":
            roughness = 0.28
            emission = (1.0, 0.05, 0.03)
        elif kind == "siren":
            roughness = 0.24
            emission = (0.15, 0.35, 1.0)
        rough[base] = roughness
        rough[base + 1] = roughness
        rough[base + 2] = roughness
        rough[base + 3] = 1.0
        emit[base] = emission[0]
        emit[base + 1] = emission[1]
        emit[base + 2] = emission[2]
        emit[base + 3] = 1.0
        color[base + 3] = 1.0
    return color, rough, emit


def image_from_pixels(name, pixels, colorspace):
    image = bpy.data.images.new(name, TEX, TEX, alpha=True)
    image.colorspace_settings.name = colorspace
    write_px(image, pixels)
    image.pack()
    return image


def assign_weathered(obj, slug, level, color, rough, emit):
    color_img = image_from_pixels(f"{slug}-L{level}-body-color", color, "sRGB")
    rough_img = image_from_pixels(f"{slug}-L{level}-body-rough", rough, "Non-Color")
    emit_img = image_from_pixels(f"{slug}-L{level}-body-emit", emit, "sRGB")
    mat = bpy.data.materials.new("body-weathered-next")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError("Principled BSDF is missing")

    def tex(image, colorspace):
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        image.colorspace_settings.name = colorspace
        return node

    base = tex(color_img, "sRGB")
    rough_node = tex(rough_img, "Non-Color")
    emit_node = tex(emit_img, "sRGB")
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(rough_node.outputs["Color"], bsdf.inputs["Roughness"])
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.0
    emit_input = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    links.new(emit_node.outputs["Color"], bsdf.inputs[emit_input])
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 1.0
    import bmesh
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for face in bm.faces:
        face.material_index = 0
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.clear()
    mesh.materials.append(mat)
    for old in list(bpy.data.materials):
        if old != mat and (old.name == "body-weathered" or old.name.startswith("body-weathered.")):
            bpy.data.materials.remove(old)
    mat.name = "body-weathered"
    weather = obj.data.uv_layers.get("Weather")
    if weather:
        obj.data.uv_layers.active = weather


def export_glb(objects, path, body):
    body.name = "body"
    body.data.name = "body"
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def split_wheel_materials(obj):
    # One material per mesh. The traffic draw keeps the first material only,
    # so a tyre and a rim on the same mesh would drop the second colour.
    if len(obj.material_slots) <= 1:
        return [obj]
    base = obj.name
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [item for item in bpy.context.selected_objects if item.type == "MESH"]
    parts.sort(key=lambda item: item.name)
    for index, part in enumerate(parts):
        part.name = base if index == 0 else f"{base}.{index}"
        part.data.name = part.name
    return parts


def name_wheels(parts):
    if not parts:
        return []
    ordered = sorted(parts, key=lambda obj: object_center(obj).y)
    half = max(1, len(ordered) // 2)
    front = ordered[:half]
    back = ordered[half:]
    if len(ordered) < 2:
        front = ordered
        back = []
    named = []
    for group, label in ((front, "front"), (back, "back")):
        group = sorted(group, key=lambda obj: object_center(obj).x)
        sides = ["left", "right"] if len(group) > 1 else ["left"]
        for obj, side in zip(group, sides):
            obj.name = f"wheel-{label}-{side}"
            obj.data.name = obj.name
            for part in split_wheel_materials(obj):
                named.append(part)
    return named


def save_preview(slug, level, pixels):
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    image = image_from_pixels(f"preview-{slug}-L{level}", pixels, "sRGB")
    path = os.path.join(PREVIEW_DIR, f"{slug}-L{level}.png")
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def bake_one(src_name, slug):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, src_name))
    meshes = mesh_objects()
    apply_all(meshes)
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    meshes = mesh_objects()
    face_length_along_y(meshes)
    front_hint = [obj for obj in mesh_objects() if is_front_name(obj.name)]
    point_front_to_minus_y(mesh_objects(), front_hint)
    center_x(mesh_objects())
    body_parts, wheel_parts = prepare_wheels(mesh_objects())
    if not body_parts:
        raise RuntimeError(f"{src_name} has no body")
    body = join_many(body_parts, "body-src")
    wheels = name_wheels([obj for obj in wheel_parts if obj and obj.name in bpy.data.objects])
    cats = face_categories(body)
    mask = body.copy()
    mask.data = body.data.copy()
    bpy.context.scene.collection.objects.link(mask)
    mask.name = "body-mask"
    set_class_uvs(mask, cats)
    collapse_to_one_material(mask)
    paint_category_colors(body, cats)
    smart_uv(body)
    color_img = new_image(slug + "-color")
    height_img = new_image(slug + "-height")
    cat_img = new_image(slug + "-cat")
    zs = [vert.co.z for vert in body.data.vertices]
    bake_emit(body, cat_img, connect_category)
    bake_diffuse(body, color_img)
    bake_emit(body, height_img, connect_height(min(zs), max(zs)))
    color_px = read_px(color_img)
    height_px = read_px(height_img)
    cat_px = read_px(cat_img)
    for level in (2, 3):
        color, rough, emit = make_level(color_px, height_px, cat_px, level)
        save_preview(slug, level, color)
        assign_weathered(body, slug, level, color, rough, emit)
        kept = [obj for obj in wheels if obj.name in bpy.data.objects]
        export_glb([body] + kept, os.path.join(WEATHER_DIR, f"{slug}-L{level}.glb"), body)
        body.name = "body-src"
    export_glb([mask] + [obj for obj in wheels if obj.name in bpy.data.objects], os.path.join(MASK_DIR, f"{slug}.glb"), mask)
    mins, maxs = world_box([mask] + [obj for obj in wheels if obj.name in bpy.data.objects])
    size = maxs - mins
    print(
        "BAKED",
        slug,
        "wheels",
        len(wheels),
        "size",
        round(size.x, 3),
        round(size.y, 3),
        round(size.z, 3),
    )


def main():
    wanted = argv_after_dd()
    names = wanted if wanted else list(CARS.keys())
    for name in names:
        if name not in CARS:
            raise SystemExit(f"Unknown car {name}")
        print("START", name)
        bake_one(name, CARS[name])


if __name__ == "__main__":
    main()
