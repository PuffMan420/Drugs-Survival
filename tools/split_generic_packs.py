# Split the two generic Sketchfab packs into one GLB per vehicle. Box only.
# Run: blender -b --python tools/split_generic_packs.py -- <folder with the two pack GLBs> <output folder>
import bpy, os, re, math, json, sys
from mathutils import Vector
_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = _args[0] if len(_args) > 0 else "."
OUT = _args[1] if len(_args) > 1 else "split"
os.makedirs(OUT, exist_ok=True)
report = []

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(f):
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f))

def meshes_under(obj):
    out = []
    def walk(o):
        if o.type == 'MESH': out.append(o)
        for c in o.children: walk(c)
    walk(obj); return out

def wbox(objs):
    mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx

def tris(objs):
    n = 0
    for o in objs:
        me = o.data
        me.calc_loop_triangles(); n += len(me.loop_triangles)
    return n

def export_group(keep, slug, wheel_names=None):
    # delete everything else
    keep_set = set(o.name for o in keep)
    for o in list(bpy.data.objects):
        if o.name not in keep_set and o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep:
        o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep: o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    # The pack cars sit at an angle. Find the long axis of the biggest mesh (PCA in XY) and turn it onto Y.
    big = max(keep, key=lambda o: len(o.data.vertices))
    pts = [big.matrix_world @ v.co for v in big.data.vertices]
    mx_ = sum(p.x for p in pts) / len(pts); my_ = sum(p.y for p in pts) / len(pts)
    sxx = sum((p.x - mx_) ** 2 for p in pts); syy = sum((p.y - my_) ** 2 for p in pts); sxy = sum((p.x - mx_) * (p.y - my_) for p in pts)
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy)  # angle of main axis from +X
    rot = math.pi / 2 - theta
    from mathutils import Matrix
    R = Matrix.Rotation(rot, 4, 'Z')
    for o in keep:
        o.matrix_world = R @ o.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    print('YAW', slug, round(math.degrees(theta), 2))
    mn, mx = wbox(keep)
    size = mx - mn
    # long axis onto Y
    if size.x > size.y:
        bpy.ops.transform.rotate(value=math.pi/2, orient_axis='Z')
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        mn, mx = wbox(keep); size = mx - mn
    c = (mn + mx) / 2
    for o in keep:
        o.location -= Vector((c.x, c.y, mn.z))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    if wheel_names:
        for o in keep:
            if o.name in wheel_names: o.name = 'wheel-' + o.name
    path = os.path.join(OUT, slug + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True)
    mats = sorted(set(s.material.name for o in keep for s in o.material_slots if s.material))
    report.append(dict(slug=slug, tris=tris(keep), objects=len(keep), size=[round(size.x,3), round(size.y,3), round(size.z,3)], bytes=os.path.getsize(path), mats=mats, wheels=len(wheel_names or [])))
    print('SPLIT', report[-1])

# Civil pack: one top group per vehicle
reset(); imp('generic_civil_service_vehicles_pack.glb')
root = [o for o in bpy.data.objects if o.name == 'RootNode'][0]
civil = [c.name for c in root.children]
print('CIVIL', civil)
for name in civil:
    reset(); imp('generic_civil_service_vehicles_pack.glb')
    grp = bpy.data.objects[name]
    export_group(meshes_under(grp), 'civil-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'))

# Passenger pack: bodies + nearest wheels
reset(); imp('generic_passenger_car_pack.glb')
root = [o for o in bpy.data.objects if o.name == 'RootNode'][0]
tops = [c.name for c in root.children]
bodies = [n for n in tops if 'body' in n.lower()]
others = [n for n in tops if n not in bodies]
print('BODIES', bodies); print('OTHERS', others)
assign = {}
for b in bodies:
    assign[b] = []
bb = {b: wbox(meshes_under(bpy.data.objects[b])) for b in bodies}
loose = []
for n in others:
    ms = meshes_under(bpy.data.objects[n])
    mn, mx = wbox(ms); c = (mn + mx) / 2
    best = None
    for b, (bmn, bmx) in bb.items():
        inside = all(bmn[i] - 0.05 <= c[i] <= bmx[i] + 0.05 for i in (0, 1))
        if inside:
            d = (c - (bmn + bmx) / 2).length
            if best is None or d < best[0]: best = (d, b)
    if best: assign[best[1]].append(n)
    else: loose.append((n, [round(v,2) for v in c]))
print('ASSIGN', json.dumps(assign)); print('LOOSE', loose)
for b in bodies:
    reset(); imp('generic_passenger_car_pack.glb')
    objs = meshes_under(bpy.data.objects[b])
    wheels = []
    for w in assign[b]:
        wm = meshes_under(bpy.data.objects[w]); objs += wm; wheels += [o.name for o in wm]
    export_group(objs, 'pass-' + re.sub(r'[^a-z0-9]+', '-', b.lower().replace('body', '')).strip('-'), wheels)
json.dump(dict(report=report, loose=loose, assign=assign), open(os.path.join(OUT, 'split_report.json'), 'w'), indent=1)
