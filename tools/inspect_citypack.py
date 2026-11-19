# Read-only size check for the City Pack files. Prints bounds in Blender units.
import bpy
import os
import sys
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
folder = argv[0] if argv else r"C:\Drugs Survival Dev\assets\citypack"

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def bounds_of(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    any_mesh = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        any_mesh = True
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    if not any_mesh:
        return None
    return mins, maxs

print("BLENDER", bpy.app.version_string)
for name in sorted(os.listdir(folder)):
    if not name.lower().endswith(".glb"):
        continue
    clear()
    path = os.path.join(folder, name)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    box = bounds_of(meshes)
    print("FILE", name, "meshes", len(meshes))
    if box:
        mins, maxs = box
        size = maxs - mins
        print(
            "  size x={:.3f} y={:.3f} z={:.3f} min=({:.3f},{:.3f},{:.3f})".format(
                size.x, size.y, size.z, mins.x, mins.y, mins.z
            )
        )
    for obj in meshes:
        mats = [slot.material.name if slot.material else "-" for slot in obj.material_slots]
        print("  OBJ", obj.name, "parent", obj.parent.name if obj.parent else "-", "mats", ",".join(mats))
