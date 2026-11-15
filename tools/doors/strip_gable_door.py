# Removes the baked plank-door triangles from a 1Story_GableRoof GLB, in place.
# Only the index list of the house primitive changes; vertices, UVs, materials and images stay byte-identical.
import json,struct,sys
CT={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)}
def strip(path):
    b=bytearray(open(path,'rb').read())
    jl=struct.unpack_from('<I',b,12)[0]; j=json.loads(b[20:20+jl]); bin0=20+jl+8
    prim=j['meshes'][0]['primitives'][0]
    assert j['materials'][prim['material']]['name'].startswith('House_'), 'unexpected material'
    pa=j['accessors'][prim['attributes']['POSITION']]; pv=j['bufferViews'][pa['bufferView']]
    po=bin0+pv.get('byteOffset',0)+pa.get('byteOffset',0); ps=pv.get('byteStride',12)
    ia=j['accessors'][prim['indices']]; iv=j['bufferViews'][ia['bufferView']]
    fmt,sz=CT[ia['componentType']]; io=bin0+iv.get('byteOffset',0)+ia.get('byteOffset',0)
    idx=list(struct.unpack_from('<%d%s'%(ia['count'],fmt),b,io))
    def pos(i): return struct.unpack_from('<3f',b,po+i*ps)
    def inside(p): return abs(p[0])<=0.205 and 0.949<=p[2]<=0.98 and 0.02<=p[1]<=0.96
    keep=[]; drop=0
    for t in range(0,len(idx),3):
        tri=idx[t:t+3]
        if all(inside(pos(i)) for i in tri): drop+=1
        else: keep+=tri
    if drop==0: print(path,'no plank triangles (already stripped?)'); return
    struct.pack_into('<%d%s'%(len(keep),fmt),b,io,*keep)
    # zero the unused tail so nothing stale is left in the view
    tail=io+len(keep)*sz; b[tail:io+ia['count']*sz]=bytes(io+ia['count']*sz-tail)
    ia['count']=len(keep)
    js=json.dumps(j,separators=(',',':')).encode()
    js+=b' '*((4-len(js)%4)%4)
    if len(js)>jl: raise SystemExit('json grew')
    js+=b' '*(jl-len(js))
    b[20:20+jl]=js
    open(path,'wb').write(b)
    print(path,'dropped triangles',drop,'kept',len(keep)//3)
for p in sys.argv[1:]: strip(p)
