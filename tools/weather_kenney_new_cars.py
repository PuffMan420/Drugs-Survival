# Copy of the Kenney weather_all.py run for the four new Kenney Car Kit bodies
# (512 colour, 256 roughness/emit maps, race car at 0.45 of the dirt).
# R must hold the four GLBs plus colormap.png; O gets the -L2/-L3 GLBs.
# Weather every Kenney car the game loads. Textures/materials only, geometry untouched.
import bpy,bmesh,sys,colorsys,json,math as pm
from mathutils import Vector
R='/workspace/vera-cars/kenney/in/'; O='/workspace/vera-cars/kenney/out/'
NORMAL=['delivery-flat','tractor','tractor-shovel']
SPORTS=['race']
LV={'2':1.0,'3':1.6}
JOBS=[(m,l) for m in NORMAL for l in ('2','3')]+[(m,'2') for m in SPORTS]
if '--' in sys.argv: JOBS=[j for j in JOBS if j[0] in sys.argv[sys.argv.index('--')+1:]]
REPORT={}
def is_wheel(o): return o.name.startswith('wheel')
def classify(objs,img):
    W,H=img.size;px=img.pixels[:]
    allv=[o.matrix_world@v.co for o in objs for v in o.data.vertices]
    ymin=min(v.y for v in allv);ymax=max(v.y for v in allv)
    info={}
    for o in objs:
        me=o.data;uv=me.uv_layers[0].data;mw=o.matrix_world;nm=mw.to_3x3().normalized()
        cats=[];faces=[]
        for p in me.polygons:
            u,v=uv[p.loop_indices[0]].uv;x=min(W-1,int(u%1*W));y=min(H-1,int(v%1*H));i=(y*W+x)*4
            r,g,b=px[i],px[i+1],px[i+2];h,s,val=colorsys.rgb_to_hsv(r,g,b)
            vs=[mw@me.vertices[k].co for k in p.vertices];c=sum(vs,Vector())/len(vs);n=(nm@p.normal).normalized()
            faces.append((p,(r,g,b),(h,s,val),vs,c,n))
        info[o.name]=faces
    from collections import defaultdict
    def cell(o,p):
        u,v=o.data.uv_layers[0].data[p.loop_indices[0]].uv;return (int(u%1*16),int(v%1*4))
    area=defaultdict(float)
    for o in objs:
        for p in o.data.polygons: area[cell(o,p)]+=p.area
    res={}
    for o in objs:
        cats=[]
        for (p,col,hsv,vs,c,n) in info[o.name]:
            ce=cell(o,p);mx=max(abs(q.x) for q in vs)
            cat=0
            if ce==(1,0): cat=1
            elif ce==(3,0): cat=2
            elif ce==(5,0): cat=3
            elif ce==(7,0): cat=7
            elif ce==(5,1): cat=6
            elif ce==(7,1): cat=5
            elif ce==(13,1) and area[ce]<1.0: cat=5
            if cat==5 and mx<0.22 and (abs(c.y-ymin)<0.08 or abs(c.y-ymax)<0.08) and c.z<0.5: cat=4
            cats.append(cat)
        res[o.name]=cats
    return res,info,ymin,ymax
def build(model,lvl):
    A=LV[lvl]*(0.45 if model in SPORTS else 1.0);name=f'{model}-L{lvl}';rep={}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=R+model+'.glb')
    img=[i for i in bpy.data.images if 'colormap' in i.name][0];img.filepath=R+'colormap.png';img.reload()
    wheels=[o for o in bpy.data.objects if o.type=='MESH' and is_wheel(o)]
    parts=[o for o in bpy.data.objects if o.type=='MESH' and not is_wheel(o)]
    cats,info,ymin,ymax=classify(parts,img)
    body=bpy.data.objects['body']
    # side glass (+x) islands on body -> frontmost window
    sg=[(p,vs) for (p,col,hsv,vs,c,n),ct in zip(info['body'],cats['body']) if ct==1 and n.x>0.5]
    door=None;frame=None
    if sg:
        groups=[]
        for p,vs in sg:
            ks=set(p.vertices);hit=[g for g in groups if g[0]&ks]
            ng=[ks,list(vs)]
            for g in hit: ng[0]|=g[0];ng[1]+=g[1];groups.remove(g)
            groups.append(ng)
        g=min(groups,key=lambda g:min(v.y for v in g[1]))
        pts=[(round(v.y,4),round(v.z,4)) for v in g[1]];pts=sorted(set(pts))
        def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
        lo=[];up=[]
        for q in pts:
            while len(lo)>=2 and cross(lo[-2],lo[-1],q)<=0: lo.pop()
            lo.append(q)
        for q in reversed(pts):
            while len(up)>=2 and cross(up[-2],up[-1],q)<=0: up.pop()
            up.append(q)
        hull=lo[:-1]+up[:-1]
        zlo=min(q[1] for q in hull);bot=[q[0] for q in hull if q[1]<zlo+0.02]
        gx=min(v.x for v in g[1])
        frame=dict(hull=hull,gx=gx)
        yf,yr=min(bot),max(bot)
        # need a vertical painted side panel under the window
        ok=False
        for (p,col,hsv,vs,c,n),ct in zip(info['body'],cats['body']):
            if ct==0 and n.x>0.97 and abs(n.z)<0.05:
                ys=[v.y for v in vs];zs=[v.z for v in vs]
                if min(ys)<=(yf+yr)/2<=max(ys) and min(zs)<zlo-0.06<max(zs): ok=True;px_=max(v.x for v in vs)
        if ok and yr-yf>0.2: door=dict(yf=yf,yr=yr,zlo=zlo,x=px_)
    rep['door']=bool(door);rep['frame']=bool(frame)
    rep['counts']={k:sum(1 for c in cats['body'] if c==k) for k in range(7)}
    # plate params per end
    plates={}
    for end,yy in (('f',ymin),('b',ymax)):
        zs=[v.z for o in parts for (p,col,hsv,vs,c,n),ct in zip(info[o.name],cats[o.name]) if ct==4 and abs(c.y-yy)<0.08 and abs(n.y)>0.9 for v in vs]
        xs=[abs(v.x) for o in parts for (p,col,hsv,vs,c,n),ct in zip(info[o.name],cats[o.name]) if ct==4 and abs(c.y-yy)<0.08 and abs(n.y)>0.9 for v in vs]
        plates[end]=(min(zs),max(zs),max(xs)) if zs else None
    rep['plates']={k:bool(v) for k,v in plates.items()}
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=4;s.cycles.device='CPU'
    for o in parts:
        a=o.data.attributes.new('cat','FLOAT','FACE')
        for i,cv in enumerate(cats[o.name]): a.data[i].value=cv
        old=o.data.materials[0];m=old.copy();m.name=f'{o.name}-weathered';o.data.materials[0]=m
        shade(m,A,wheels,door,frame,plates)
        bake(o,m,name,512)
    for w in wheels:
        wm=w.data.materials[0].copy();wm.name='wheel-matte';[x for x in wm.node_tree.nodes if x.type=='BSDF_PRINCIPLED'][0].inputs['Roughness'].default_value=0.85;w.data.materials[0]=wm
    bpy.ops.export_scene.gltf(filepath=O+f'{name}.glb',export_format='GLB')
    REPORT[name]=rep
    return name
def shade(m,A,wheels,door,frame,plates):
    nt=m.node_tree;N=nt.nodes.new;L=nt.links.new
    bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
    tex=[n for n in nt.nodes if n.type=='TEX_IMAGE'][0];tex.interpolation='Closest'
    def mr(x,a,b,c,d):
        n=N('ShaderNodeMapRange');n.inputs[1].default_value=a;n.inputs[2].default_value=b;n.inputs[3].default_value=c;n.inputs[4].default_value=d;L(x,n.inputs[0]);return n.outputs[0]
    def math(op,a,b,clamp=True):
        n=N('ShaderNodeMath');n.operation=op;n.use_clamp=clamp
        for i,v in enumerate((a,b)):
            if isinstance(v,(int,float)): n.inputs[i].default_value=v
            else: L(v,n.inputs[i])
        return n.outputs[0]
    def mix(f,a,b,mode='MIX'):
        n=N('ShaderNodeMix');n.data_type='RGBA';n.blend_type=mode
        if isinstance(f,(int,float)): n.inputs[0].default_value=f
        else: L(f,n.inputs[0])
        for s_,v in ((6,a),(7,b)):
            if isinstance(v,tuple): n.inputs[s_].default_value=v
            else: L(v,n.inputs[s_])
        return n.outputs[2]
    def noise(vec,scale,detail=4,stretch=None):
        if stretch:
            mp=N('ShaderNodeMapping');mp.inputs['Scale'].default_value=stretch;L(vec,mp.inputs[0]);vec=mp.outputs[0]
        n=N('ShaderNodeTexNoise');n.inputs['Scale'].default_value=scale;n.inputs['Detail'].default_value=detail;L(vec,n.inputs[0]);return n.outputs['Fac']
    def band(v,c0,w): return mr(math('ABSOLUTE',math('SUBTRACT',v,c0,False),0),w*1.6,w,0,1)
    def box(v,a,b): return math('MULTIPLY',mr(v,a-0.004,a+0.004,0,1),mr(v,b-0.004,b+0.004,1,0))
    def AND(*ms):
        r=ms[0]
        for q in ms[1:]: r=math('MULTIPLY',r,q)
        return r
    def OR(*ms):
        r=ms[0]
        for q in ms[1:]: r=math('MAXIMUM',r,q)
        return r
    geo=N('ShaderNodeNewGeometry');P=geo.outputs['Position']
    sx=N('ShaderNodeSeparateXYZ');L(P,sx.inputs[0]);X,Y,Z=sx.outputs[0],sx.outputs[1],sx.outputs[2]
    sn=N('ShaderNodeSeparateXYZ');L(geo.outputs['Normal'],sn.inputs[0])
    ax=math('ABSOLUTE',X,0)
    at=N('ShaderNodeAttribute');at.attribute_type='GEOMETRY';at.attribute_name='cat';CAT=at.outputs['Fac']
    def cm(k): return mr(math('ABSOLUTE',math('SUBTRACT',CAT,k,False),0),0.4,0.1,0,1)
    paint,win,hlm,tlm,plm,trim=cm(0),cm(1),cm(2),cm(3),cm(4),cm(5)
    col=tex.outputs[0]
    hs=N('ShaderNodeHueSaturation');hs.inputs['Saturation'].default_value=0.93;hs.inputs['Value'].default_value=0.92;L(col,hs.inputs['Color'])
    c=mix(paint,col,hs.outputs[0])
    glass=mix(mr(noise(P,6,3,(1,1,0.3)),0.5,0.8,0,0.25*A),(0.035,0.04,0.05,1),(0.2,0.18,0.15,1))
    c=mix(win,c,glass)
    low=mr(Z,0.05,0.55,0.75,0)
    arch=None
    for w in wheels:
        v=N('ShaderNodeVectorMath');v.operation='DISTANCE';L(P,v.inputs[0]);v.inputs[1].default_value=w.matrix_world.translation
        a=mr(v.outputs['Value'],0.32,0.62,0.8,0);arch=a if arch is None else math('MAXIMUM',arch,a)
    blot=mr(noise(P,3.5,5),0.4,0.72,0,0.35)
    streak=mr(noise(P,3,6,(10,10,1)),0.45,0.75,0,0.25)
    g=math('ADD',math('MAXIMUM',low,arch),math('MULTIPLY',blot,math('ADD',low,0.35)))
    g=math('ADD',g,math('MULTIPLY',streak,math('SUBTRACT',1,math('MULTIPLY',low,0.5))))
    g=math('MULTIPLY',g,mr(noise(P,9,3),0.3,0.7,0.6,1.0));g=math('MULTIPLY',g,A*0.75)
    g=math('MULTIPLY',g,math('SUBTRACT',1,math('MULTIPLY',win,0.75)))
    rust=AND(mr(noise(P,7,6),0.62,0.74,0,1),paint,math('MULTIPLY',low,1.3),min(1,A*0.8))
    c=mix(rust,c,(0.28,0.1,0.035,1))
    scr=AND(mr(noise(P,18,2,(1,8,1)),0.68,0.74,0,1),paint,0.35*min(1.2,A))
    c=mix(scr,c,(0.55,0.5,0.45,1))
    c=mix(g,c,(0.13,0.1,0.075,1))
    dk=N('ShaderNodeMix');dk.data_type='RGBA';dk.blend_type='MULTIPLY';dk.inputs[0].default_value=1;L(c,dk.inputs[6]);dk.inputs[7].default_value=(0.5,0.48,0.48,1)
    DK=dk.outputs[2]
    side=mr(math('ABSOLUTE',sn.outputs[0],0),0.5,0.6,0,1)
    if frame:
        off=0.012;segs=frame['hull'];dmin=None
        for i in range(len(segs)):
            (y0,z0),(y1,z1)=segs[i],segs[(i+1)%len(segs)]
            # distance from (Y,Z) to segment
            cy=N('ShaderNodeCombineXYZ');L(Y,cy.inputs[0]);L(Z,cy.inputs[1])
            vA=N('ShaderNodeVectorMath');vA.operation='SUBTRACT';L(cy.outputs[0],vA.inputs[0]);vA.inputs[1].default_value=(y0,z0,0)
            d=Vector((y1-y0,z1-z0,0));ll=max(d.length_squared,1e-6)
            dt=N('ShaderNodeVectorMath');dt.operation='DOT_PRODUCT';L(vA.outputs[0],dt.inputs[0]);dt.inputs[1].default_value=d/ll
            t=math('MULTIPLY',dt.outputs['Value'],1.0)  # clamped 0..1
            sc=N('ShaderNodeVectorMath');sc.operation='SCALE';sc.inputs[0].default_value=d;L(t,sc.inputs['Scale'])
            df=N('ShaderNodeVectorMath');df.operation='DISTANCE';L(vA.outputs[0],df.inputs[0]);L(sc.outputs[0],df.inputs[1])
            dmin=df.outputs['Value'] if dmin is None else math('MINIMUM',dmin,df.outputs['Value'],False)
        fr=AND(paint,side,mr(ax,frame['gx']-0.08,frame['gx']-0.06,0,1),band(dmin,off,0.003))
        c=mix(math('MULTIPLY',fr,0.9),c,DK)
    if door:
        vert=AND(mr(math('ABSOLUTE',sn.outputs[0],0),0.97,0.99,0,1),mr(math('ABSOLUTE',sn.outputs[2],0),0.06,0.02,0,1),mr(ax,door['x']-0.03,door['x']-0.01,0,1))
        panel=AND(vert,paint,mr(Z,door['zlo']+0.01,door['zlo']-0.005,0,1))
        seams=AND(panel,OR(band(Y,door['yf']+0.028,0.006),band(Y,door['yr']-0.005,0.006)))
        c=mix(math('MULTIPLY',seams,0.9),c,DK)
        hy=door['yr']-0.09;hz=door['zlo']-0.055
        lt=N('ShaderNodeMix');lt.data_type='RGBA';lt.inputs[0].default_value=0.08;L(c,lt.inputs[6]);lt.inputs[7].default_value=(0.6,0.58,0.56,1)
        c=mix(math('MULTIPLY',AND(panel,box(Z,hz,hz+0.015),box(Y,hy,hy+0.05)),0.8),c,lt.outputs[2])
        c=mix(math('MULTIPLY',AND(panel,box(Z,hz-0.007,hz),box(Y,hy,hy+0.05)),0.4),c,DK)
    # matte near-invisible trim
    c=mix(math('MULTIPLY',trim,mr(Z,0.45,0.6,0.6,0.2)),c,(0.11,0.11,0.115,1))
    sc2=AND(trim,mr(Z,0.42,0.2,0,1),mr(noise(P,25,3,(1,1,4)),0.66,0.72,0,1),0.3*min(1.2,A))
    c=mix(sc2,c,(0.22,0.21,0.2,1))
    # lights
    c=mix(hlm,c,(1.0,0.93,0.78,1));c=mix(tlm,c,(0.22,0.005,0.005,1))
    em=mix(tlm,mix(hlm,(0,0,0,1),(1.0,0.93,0.76,1)),(0.12,0.003,0.002,1))
    # plates
    fr_=plates.get('f') or plates.get('b');bk=plates.get('b') or plates.get('f')
    if fr_:
        isf=math('LESS_THAN',Y,0,False)
        def sel(a,b): return math('ADD',math('MULTIPLY',isf,a,False),math('MULTIPLY',math('SUBTRACT',1,isf,False),b,False),False)
        z0=sel(fr_[0],bk[0]);z1=sel(fr_[1],bk[1]);hw=sel(fr_[2],bk[2])
        pface=AND(plm,mr(math('ABSOLUTE',sn.outputs[1],0),0.85,0.95,0,1))
        rz=math('DIVIDE',math('SUBTRACT',Z,z0,False),math('SUBTRACT',z1,z0,False),False)  # 0..1
        rx=math('DIVIDE',ax,hw,False)
        inner=AND(pface,box(rx,-1,0.86),box(rz,0.14,0.86))
        xx=math('DIVIDE',X,hw,False)
        chars=AND(inner,box(rz,0.3,0.7),OR(*[box(xx,x0-0.065,x0+0.065) for x0 in (-0.62,-0.41,-0.2,0.15,0.36,0.57)]))
        c=mix(pface,c,(0.06,0.06,0.07,1));c=mix(inner,c,(0.78,0.78,0.74,1));c=mix(math('MULTIPLY',chars,0.75),c,(0.1,0.1,0.12,1))
        c=mix(AND(inner,mr(noise(P,30,4),0.5,0.7,0,0.35)),c,(0.3,0.25,0.18,1))
    c=mix(math('MULTIPLY',g,0.6),c,(0.13,0.1,0.075,1))
    L(c,bsdf.inputs['Base Color']);L(em,bsdf.inputs['Emission Color']);bsdf.inputs['Emission Strength'].default_value=1.0
    rough=math('ADD',0.45,math('ADD',math('MULTIPLY',g,0.6),math('MULTIPLY',rust,0.3)))
    rough=math('SUBTRACT',rough,math('MULTIPLY',win,0.4));rough=math('ADD',rough,math('MULTIPLY',trim,0.4))
    L(rough,bsdf.inputs['Roughness'])
    for k in ('Metallic',):
        if bsdf.inputs[k].links: nt.links.remove(bsdf.inputs[k].links[0])
        bsdf.inputs[k].default_value=0
def bake(o,m,name,res):
    s=bpy.context.scene;nt=m.node_tree;N=nt.nodes.new;L=nt.links.new
    bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    uvb=o.data.uv_layers.new(name='bake');o.data.uv_layers.active=uvb
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=0.01);bpy.ops.object.mode_set(mode='OBJECT')
    imgs={}
    for kind,cs in (('color','sRGB'),('rough','Non-Color'),('emit','sRGB')):
        rr=res if kind=='color' else max(64,res//2);im=bpy.data.images.new(f'{name}-{o.name}-{kind}',rr,rr);im.colorspace_settings.name=cs
        n=N('ShaderNodeTexImage');n.image=im;nt.nodes.active=n
        uvn=N('ShaderNodeUVMap');uvn.uv_map='bake';L(uvn.outputs[0],n.inputs[0])
        s.render.bake.margin=8
        if kind=='color':
            s.render.bake.use_pass_direct=False;s.render.bake.use_pass_indirect=False;s.render.bake.use_pass_color=True;bpy.ops.object.bake(type='DIFFUSE')
        elif kind=='rough': bpy.ops.object.bake(type='ROUGHNESS')
        else: bpy.ops.object.bake(type='EMIT')
        im.filepath_raw=O+'textures/'+f'{name}-{o.name}-{kind}.png';im.file_format='PNG';im.save();imgs[kind]=n
    for n in list(nt.nodes):
        if n not in (bsdf,imgs['color'],imgs['rough'],imgs['emit']) and n.type not in ('OUTPUT_MATERIAL','UVMAP'): nt.nodes.remove(n)
    L(imgs['color'].outputs[0],bsdf.inputs['Base Color'])
    sc=N('ShaderNodeSeparateColor');L(imgs['rough'].outputs[0],sc.inputs[0]);L(sc.outputs[1],bsdf.inputs['Roughness'])
    L(imgs['emit'].outputs[0],bsdf.inputs['Emission Color']);bsdf.inputs['Emission Strength'].default_value=4.0
    o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.attributes.remove(o.data.attributes['cat'])
def render(glb,out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    vs=[o.matrix_world@v.co for o in bpy.data.objects if o.type=='MESH' for v in o.data.vertices]
    size=max(max(v.y for v in vs)-min(v.y for v in vs),max(v.z for v in vs)); k=size/2.55
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=40;s.render.resolution_x=480;s.render.resolution_y=480
    w=bpy.data.worlds.new('w');s.world=w;w.color=(0.45,0.47,0.52)
    bpy.ops.mesh.primitive_plane_add(size=40);gp=bpy.context.object;gm=bpy.data.materials.new('g');gm.use_nodes=True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.2,0.2,0.21,1);gp.data.materials.append(gm)
    bpy.ops.object.light_add(type='SUN',rotation=(0.6,0.2,0.8));bpy.context.object.data.energy=3.5
    bpy.ops.object.camera_add(location=(1.9*k,-2.6*k,6.2*k));c=bpy.context.object;s.camera=c
    t=bpy.data.objects.new('t',None);s.collection.objects.link(t);t.location=(0,0,0.4*k)
    cn=c.constraints.new('TRACK_TO');cn.target=t;c.data.lens=55
    s.render.filepath=out;bpy.ops.render.render(write_still=True)
import os;os.makedirs(O+'textures',exist_ok=True);os.makedirs(O+'renders',exist_ok=True)
for m,l in JOBS:
    n=build(m,l)
    rp=O+'report.json';d=json.load(open(rp)) if os.path.exists(rp) else {}
    d.update(REPORT);json.dump(d,open(rp,'w'),indent=1)
