# Makes darker door copies with a sharp, self-made wood texture.
# Run headless:  blender -b --python tools/doors/make_dark_doors.py
# Reads  assets/buildings/textured/parts/Door1.glb, Door3.glb, Door5.glb (left untouched)
# Writes assets/buildings/textured/parts/Door1_dark.glb, Door3_dark.glb, Door5_dark.glb
# The originals use one brown cell of a 32x32 palette. The copies get new box UVs
# and a 1024x1024 tileable dark wood picture made here with numpy (no outside assets).
import os
import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PARTS = os.path.join(ROOT, "assets", "buildings", "textured", "parts")
DOORS = ["Door1", "Door3", "Door5"]
SIZE = 1024
TILE = 0.5  # one texture repeat per 0.5 file units (door is about 0.44 wide)


def periodic_noise(rng, size, sx, sy):
    # Filtered white noise. FFT filtering keeps it tileable.
    white = rng.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None] * size
    fx = np.fft.fftfreq(size)[None, :] * size
    filt = np.exp(-((fx / sx) ** 2) - ((fy / sy) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt))
    out -= out.mean()
    return out / (out.std() + 1e-8)


def wood_pixels(seed=7):
    rng = np.random.default_rng(seed)
    v, u = np.mgrid[0:SIZE, 0:SIZE] / SIZE  # rows = along the grain
    warp = periodic_noise(rng, SIZE, 3.0, 1.5)
    streak = periodic_noise(rng, SIZE, 90.0, 3.0)  # long thin streaks along the grain
    fine = periodic_noise(rng, SIZE, 260.0, 12.0)
    lines = np.sin(2 * np.pi * (22 * u + 0.35 * warp))  # integer count keeps it tileable
    rings = np.clip(lines * 0.5 + 0.5, 0, 1) ** 3
    t = 0.5 + 0.18 * streak + 0.07 * fine - 0.28 * rings
    t = np.clip(t, 0.0, 1.0)[..., None]
    dark = np.array([0.105, 0.058, 0.034])  # sRGB 0..1
    light = np.array([0.33, 0.205, 0.125])
    rgb = dark + (light - dark) * t
    rgba = np.concatenate([rgb, np.ones((SIZE, SIZE, 1))], axis=2)
    return rgba.astype(np.float32)


def make_image():
    img = bpy.data.images.new("Door_Wood_Dark", SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(wood_pixels().ravel())
    img.pack()
    return img


def make_material(img):
    mat = bpy.data.materials.new("Door_Wood_Dark")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def box_uv(ob, offset):
    me = ob.data
    uv = me.uv_layers.active or me.uv_layers.new()
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 1:  # front / back
                a, b = co.x, co.z
            elif ax == 0:  # sides
                a, b = co.y, co.z
            else:  # top / bottom
                a, b = co.x, co.y
            # grain runs along V (up the door)
            uv.data[li].uv = (a / TILE + offset[0], b / TILE + offset[1])


def main():
    img = make_image()
    mat = make_material(img)
    preview = os.environ.get("DOOR_WOOD_PREVIEW")
    if preview:
        img.filepath_raw = preview
        img.file_format = "PNG"
        img.save()
    for i, name in enumerate(DOORS):
        for ob in list(bpy.context.scene.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(PARTS, name + ".glb"))
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        for ob in meshes:
            box_uv(ob, (0.37 * i, 0.61 * i))
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            ob.name = name + "_dark"
        bpy.ops.object.select_all(action="DESELECT")
        for ob in meshes:
            ob.select_set(True)
        out = os.path.join(PARTS, name + "_dark.glb")
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format="GLB",
            use_selection=True,
            export_image_format="JPEG",
            export_image_quality=90,
            export_materials="EXPORT",
        )
        print("wrote", out, os.path.getsize(out))


main()
