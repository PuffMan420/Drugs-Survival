import re,random,cairosvg,sys
from shapely.geometry import Polygon,LineString,Point,box
from PIL import Image
random.seed(int(sys.argv[1]) if len(sys.argv)>1 else 7)
U=16  # map units per road piece
src=open('city-thin-roads-v2.svg').read().split('\n')
pts=lambda t:[tuple(map(float,p.split(','))) for p in re.search(r'points="([^"]*)"',t).group(1).split()]
head=[l for l in src if l.startswith('<?xml') or l.startswith('<svg') or l.startswith('<rect')]
bg=[l for l in src if (l.startswith('<polygon') or l.startswith('<path')) and '#c5e8c5' not in l]
land=[Polygon(pts(l)) for l in src if l.startswith('<polygon') and '#ece5db' in l][0]
water=[Polygon(pts(l)) for l in src if l.startswith('<polygon') and '#a9d9fe' in l][0]
import numpy as np
open('/tmp/bg.svg','w').write('\n'.join(head+bg+['</svg>']))
cairosvg.svg2png(url='/tmp/bg.svg',write_to='/tmp/bg.png',output_width=2304)
BG=np.array(Image.open('/tmp/bg.png').convert('RGB')).astype(int)
WET=(abs(BG-[0xa9,0xd9,0xfe]).sum(2)<40)
from scipy.ndimage import binary_dilation
WETB=binary_dilation(WET,iterations=14)
GX,GY=126,70
# yellow lines in piece coords: (orientation, fixed, a, b)
Yl=[('h',12,20,118),('v',118,12,64),('h',64,13,118),('v',13,8,64),('h',32,13,118),('v',60,12,64),('v',98,32,64)]
PARK=(80,12,92,32)
def seg(o,f,a,b): return [(f,a),(f,b)] if o=='v' else [(a,f),(b,f)]
def on_yellow(p,q):
    for o,f,a,b in Yl:
        if o=='h' and p[1]==q[1]==f and a<=min(p[0],q[0]) and max(p[0],q[0])<=b: return True
        if o=='v' and p[0]==q[0]==f and a<=min(p[1],q[1]) and max(p[1],q[1])<=b: return True
    return False
# districts with own lattice -> jogs at borders
def lattice(lo,hi,fixed,AVOID=()):
    xs=set(fixed); x=lo
    while x<hi:
        x+=random.choice([4,4,6,6,8]); 
        if x<hi-2 and all(abs(x-v)>=3 for v in xs|set(AVOID)): xs.add(x)
    return sorted(xs)
D=[ (0,2,52,20), (0,26,60,64), (60,2,126,32), (60,32,98,70), (98,32,126,70), (0,64,126,70)]
edges={}  # (p,q)->kind
def add(p,q,k): 
    key=tuple(sorted([p,q])); 
    if key not in edges or k=='y': edges[key]=k
for o,f,a,b in Yl:
    for t in range(a,b):
        add(*( [(f,t),(f,t+1)] if o=='v' else [(t,f),(t+1,f)] ),'y')
def wetpx(x,y): return WETB[int(round(y+111.3)),int(round(x+192))]
def okseg(p,q):
    n=max(abs(p[0]-q[0]),abs(p[1]-q[1]))*U
    return not any(wetpx(p[0]*U+(q[0]-p[0])*U*t/n,p[1]*U+(q[1]-p[1])*U*t/n) for t in range(n+1))
def inpark(p,q):
    x0,y0,x1,y1=PARK; return x0<min(p[0],q[0])<x1 or x0<max(p[0],q[0])<x1 if p[1]==q[1] and y0<p[1]<y1 else (x0<p[0]<x1 and y0<=min(p[1],q[1]) and max(p[1],q[1])<=y1)
cand=[]
for (x0,y0,x1,y1) in D:
    xs=lattice(x0,x1,[v for v in (13,60,80,92,98,118) if x0<=v<=x1],(0,13,34,60,74,80,92,98,118,126))
    ys=lattice(y0,y1,[v for v in (12,22,32,64) if y0<=v<=y1],(2,12,20,22,26,32,64,70))
    for x in xs:
        for i in range(len(ys)-1):
            cand.append([(x,y) for y in range(ys[i],ys[i+1]+1)])
    for y in ys:
        for i in range(len(xs)-1):
            cand.append([(x,y) for x in range(xs[i],xs[i+1]+1)])
# a candidate "street link" is a run between lattice lines
links=[]
for c in cand:
    if all(on_yellow(c[i],c[i+1]) for i in range(len(c)-1)): continue
    if any(inpark(c[i],c[i+1]) for i in range(len(c)-1)) and not (c[0][1]==c[-1][1]==22): continue
    if not okseg(c[0],c[-1]): continue
    links.append(c)
# forced: park edges + park road + its extensions, overpass continuations
force=[]
def run(p,q):
    if p[0]==q[0]: s=1 if q[1]>p[1] else -1; return [(p[0],y) for y in range(p[1],q[1]+s,s)]
    s=1 if q[0]>p[0] else -1; return [(x,p[1]) for x in range(p[0],q[0]+s,s)]
force+= [run((80,6),(80,38)), run((92,6),(92,38)), run((74,22),(98,22))]
# canal crossings (white) : one on SW
force+= [run((34,12),(34,32)), run((74,12),(74,32)), run((98,12),(98,32))]
# union-find spanning connectivity
par={}
def f(a):
    while par.setdefault(a,a)!=a: a=par[a]
    return a
def u(a,b): par[f(a)]=f(b)
for (p,q),k in edges.items(): u(p,q)
W=[]
for c in force:
    W.append(c); [u(c[i],c[i+1]) for i in range(len(c)-1)]
random.shuffle(links)
extra=[]
for c in links:
    if f(c[0])!=f(c[-1]): W.append(c); u(c[0],c[-1]); [u(c[i],c[i+1]) for i in range(len(c)-1)]
    else: extra.append(c)
tree=len(W)
for c in extra:
    if random.random()<0.7: W.append(c)
# dead ends: a few stubs into blocks (half links)
for c in random.sample(extra,min(10,len(extra))):
    if c not in W and len(c)>=5: W.append(c[:len(c)//2+1])
OVER={(80,12),(92,12),(80,32),(92,32)}
# collect white unit edges
we=set()
for c in W:
    for i in range(len(c)-1):
        k=tuple(sorted([c[i],c[i+1]]))
        if not on_yellow(*k): we.add(k)
# remove links only touching nothing (isolated comps)
import collections
adj=collections.defaultdict(set)
for a,b in we: adj[a].add(b); adj[b].add(a)
ynodes=set(n for k in edges for n in k)
seen=set(); comps=[]
for n in list(adj):
    if n in seen: continue
    st=[n]; comp=set()
    while st:
        x=st.pop()
        if x in comp: continue
        comp.add(x); st+= list(adj[x])
    seen|=comp; comps.append(comp)
for comp in comps:
    if not (comp & (ynodes-OVER)):
        we={e for e in we if e[0] not in comp}
for _ in range(3):
    deg=collections.Counter()
    for a,b in we: deg[a]+=1; deg[b]+=1
    for n in ynodes: deg[n]+=2
    leaves=[n for n in deg if deg[n]==1]
    for lf in leaves:
        # walk back up to 2 edges; drop if short stub
        path=[lf]; cur=lf
        while len(path)<4:
            nb=[b if a==cur else a for a,b in we if cur in (a,b) and (b if a==cur else a) not in path]
            if len(nb)!=1: break
            cur=nb[0]; path.append(cur)
            if deg[cur]!=2: break
        if len(path)<=3 and deg[path[-1]]>2:
            for i in range(len(path)-1): we.discard(tuple(sorted([path[i],path[i+1]])))
# merge into straight runs for drawing/counting
def runs(es):
    H=collections.defaultdict(set);V=collections.defaultdict(set)
    for a,b in es:
        (H[a[1]] if a[1]==b[1] else V[a[0]]).add(min(a[0],b[0]) if a[1]==b[1] else min(a[1],b[1]))
    out=[]
    for y,s in H.items():
        s=sorted(s); st=s[0]; pr=s[0]
        for v in s[1:]+[None]:
            if v!=pr+1: out.append(((st,y),(pr+1,y))); st=v
            pr=v if v is not None else pr
    for x,s in V.items():
        s=sorted(s); st=s[0]; pr=s[0]
        for v in s[1:]+[None]:
            if v!=pr+1: out.append(((x,st),(x,pr+1))); st=v
            pr=v if v is not None else pr
    return out
WR=runs(we); YR=runs([k for k,v in edges.items()])
def wet(p,q): 
    l=LineString([(p[0]*U,p[1]*U),(q[0]*U,q[1]*U)]); return l.intersection(water)
P=lambda a:' '.join(f'{x*U},{y*U}' for x,y in a)
o=head+bg
x0,y0,x1,y1=PARK
o.append(f'<rect x="{x0*U}" y="{y0*U}" width="{(x1-x0)*U}" height="{(y1-y0)*U}" fill="#c5e8c5" stroke="#9cc79c" stroke-width="2"/>')
for r in WR+YR:
    w=wet(*r)
    if not w.is_empty: o.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x,y in LineString(w.coords if hasattr(w,"coords") else w.geoms[0].coords).buffer(0).exterior.coords[:0]) or ""}" />' if False else f'<line x1="{w.bounds[0]-(8 if r[0][1]==r[1][1] else 0)}" y1="{w.bounds[1]-(8 if r[0][0]==r[1][0] else 0)}" x2="{w.bounds[2]+(8 if r[0][1]==r[1][1] else 0)}" y2="{w.bounds[3]+(8 if r[0][0]==r[1][0] else 0)}" stroke="#3a3a3a" stroke-width="16"/>')
for r in WR: o.append(f'<polyline points="{P(r)}" fill="none" stroke-linecap="square" stroke="#020202" stroke-width="8"/>')
for r in WR: o.append(f'<polyline points="{P(r)}" fill="none" stroke-linecap="square" stroke="#ffffff" stroke-width="6"/>')
for r in YR: o.append(f'<polyline points="{P(r)}" fill="none" stroke-linecap="square" stroke="#555" stroke-width="10"/>')
for r in YR: o.append(f'<polyline points="{P(r)}" fill="none" stroke-linecap="square" stroke="#fafa7a" stroke-width="7"/>')
for x,y in OVER:
    o.append(f'<line x1="{x*U}" y1="{y*U-22}" x2="{x*U}" y2="{y*U+22}" stroke="#2ecc40" stroke-width="14"/>')
    o.append(f'<line x1="{x*U}" y1="{y*U-26}" x2="{x*U}" y2="{y*U+26}" stroke="#ffffff" stroke-width="6"/>')
o.append('</svg>')
open('city-grid-roads.svg','w').write('\n'.join(o))
cairosvg.svg2png(url='city-grid-roads.svg',write_to='city-grid.png',output_width=1600)
cells=o[:-1]+[f'<line x1="{i*U}" y1="-111" x2="{i*U}" y2="1224" stroke="#000" stroke-opacity="0.12" stroke-width="0.6"/>' for i in range(-12,133)]+[f'<line x1="-192" y1="{j*U}" x2="2112" y2="{j*U}" stroke="#000" stroke-opacity="0.12" stroke-width="0.6"/>' for j in range(-7,77)]+['</svg>']
open('/tmp/cells.svg','w').write('\n'.join(cells))
cairosvg.svg2png(url='/tmp/cells.svg',write_to='city-grid-cells.png',output_width=2400)
a=Image.open('city-thin.png').convert('RGB');b=Image.open('city-grid.png').convert('RGB')
c=Image.new('RGB',(a.width*2+60,a.height+40),(40,40,40));c.paste(a,(20,20));c.paste(b,(a.width+40,20));c.save('compare-grid.png')
print('white runs',len(WR),'yellow runs',len(YR),'tree',tree)
