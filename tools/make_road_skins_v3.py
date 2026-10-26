import numpy as np
from PIL import Image, ImageFilter
S=515; C=round(0.1*S)  # 52 px curb = model curb (|z| 0.4..0.5)
rng=np.random.default_rng(7)
def curb(src,seed):
    r=np.random.default_rng(seed)
    b=src[1:16].astype(float)
    sc=[np.abs(np.diff(b[:,x:x+265].mean(2),axis=0)).sum() for x in range(0,S-265,10)]
    x0=int(np.argmin(sc))*10; band=b[:,x0:x0+265]   # cleanest curb run, no drain lip
    H,W=band.shape[:2]; ph,pw=15,96; f=5
    acc=np.zeros((C+ph,S+pw,3)); wt=np.zeros((C+ph,S+pw,1))
    wy=np.minimum(np.arange(ph),np.arange(ph)[::-1]); wx=np.minimum(np.arange(pw),np.arange(pw)[::-1])
    w=(np.clip((wy+1)/f,0,1)[:,None]*np.clip((wx+1)/f,0,1)[None,:])[...,None]
    for y in range(-5,C,ph-f):
        for x in range(-20,S,pw-2*f):
            sx=int(r.integers(0,W-pw)); p=band[:,sx:sx+pw]
            if r.random()<.5: p=p[::-1]
            if r.random()<.5: p=p[:,::-1]
            yy=max(y,0); py=yy-y; cols=(np.arange(x,x+pw))%S
            acc[yy:y+ph][:,cols]+=(p*w)[py:]; wt[yy:y+ph][:,cols]+=w[py:]
    out=(acc/np.maximum(wt,1e-6))[:C,:S]   # wraps in x so pieces tile
    sh=np.ones(C); sh[-3:]=[.92,.85,.75]; sh[:2]=[.9,.97]
    return out*sh[:,None,None]
def energy(a):
    g=np.abs(np.diff(a.mean(2),axis=0)).mean(1); return g
def cut(road,lo,hi,n,f=10):
    e=energy(road); best=min(range(lo,hi-n-f),key=lambda s:e[s:s+n+f].sum()+ (road[s:s+n].std(0).mean()))
    a=road[:best]; b=road[best+n-f:]
    m=np.linspace(0,1,f)[:,None,None]
    blend=a[-f:]*(1-m)+b[:f]*m
    return np.concatenate([a[:-f],blend,b[f:]]),best

def make_v2(k):
    im=np.asarray(Image.open(f'assets/roads/road-straight-{k}.png').convert('RGB')).astype(float)
    road=im[17:498]
    need=S-2*C; rem=len(road)-need; r1=rem//2; r2=rem-r1
    mid=len(road)//2
    lane2,c2=cut(road[mid:],25,mid-40,r2)
    lane1,c1=cut(road[:mid],40,mid-25,r1)
    road=np.concatenate([lane1,lane2])
    top=curb(im,k); bot=curb(im[::-1],k+10)[::-1]
    return np.clip(np.concatenate([top,road,bot]),0,255).astype('uint8').astype(float)

# drain grates in the v2 images (x0,x1,y0,y1), found by dark-pixel scan
DRAINS={2:[(55,153,53,83)],3:[(25,123,53,86),(400,496,434,462)],4:[]}
def undrain(a,boxes,m=10,f=8):
    a=a.copy()
    for x0,x1,y0,y1 in boxes:
        x0-=m;x1+=m+1;y0=max(y0-m,C);y1=min(y1+m+1,S-C)   # never touch the curb band
        w=x1-x0; h=y1-y0
        # same rows, clean stretch of the same gutter: try shifts, pick least texture
        best=None
        for s in range(-300,301,5):
            if abs(s)<w+10: continue
            sx=x0+s
            if sx<0 or sx+w>S: continue
            if any(not(sx+w<=bx0-m or sx>=bx1+m) for bx0,bx1,_,_ in boxes): continue
            p=a[y0:y1,sx:sx+w]; sc=(p.mean(2)<70).sum()*100+np.abs(np.diff(p.mean(2),axis=1)).mean()
            if best is None or sc<best[0]: best=(sc,sx)
        p=a[y0:y1,best[1]:best[1]+w]
        wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
        top=y0==C; bot=y1==S-C
        wy=np.minimum(np.arange(h) if not top else np.full(h,99),np.arange(h)[::-1] if not bot else np.full(h,99))
        wy=np.clip(wy/f,0,1)
        wm=(wy[:,None]*wx[None,:])[...,None]
        a[y0:y1,x0:x1]=a[y0:y1,x0:x1]*(1-wm)+p*wm
    return a


# ---------- v3: one global standard for every straight-road skin ----------
# full piece = 516 px long, half = 258 px; both 515 px wide (curb 52 px each side).
# dash period P = 129 px (half = 2 periods, full = 4). Dash 74 px, gap 55 px.
# Every piece starts and ends in the middle of a gap: dash centres at 64.5 + 129*k.
# Centre line is on z = 0: dash rows centred on row 257 in every variant.
FULL,HALF,P,DL=516,258,129,74
DY0=249                 # dash rows 249..264 (16 px), centre 257 = z 0
E=48                    # end zone blended into the shared seam strip (wide = no tone band)
V2MD5={2:'fa5edd79c10b2faf82c6c8d574d87ef3',3:'3cab88c20d2f2a71b9ab9ecbeee5a01b',4:'81b5c96b0f5720d83b8461d6d65c6b5f'}
YEL=lambda a:np.clip(((a[...,0]-a[...,2])-30)/50,0,1)

def dash_sprite(v2):
    # the real centre dash of straight-2 (cols 208..305, rows ~246..262) with a soft alpha
    d=v2[238:272,200:314].copy(); al=YEL(d)
    al=np.asarray(Image.fromarray((al*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.8)))/255.
    cols=np.nonzero(al.max(0)>.5)[0]; rows=np.nonzero(al.max(1)>.5)[0]
    d=d[rows[0]-3:rows[-1]+4,cols[0]-3:cols[-1]+4]; al=al[rows[0]-3:rows[-1]+4,cols[0]-3:cols[-1]+4]
    # shorten to DL by cutting out the uniform middle (ends keep their real worn shape), no squeeze
    L=DL+6; h=L//2; f=6
    def cut(x):
        a,b=x[:,:h+f//2],x[:,x.shape[1]-(L-h)-f//2:]
        m=np.linspace(0,1,f).reshape((1,f)+(1,)*(x.ndim-2))
        mid=a[:,-f:]*(1-m)+b[:,:f]*m
        return np.concatenate([a[:,:-f],mid,b[:,f:]],1)
    return cut(d),cut(al),rows[0]-3-(238-238)

def remove_dashes(a):
    # rebuild the dash band from asphalt just above and below it, feathered
    a=a.copy(); y0,y1=236,276; h=y1-y0
    up=a[y0-h:y0]; dn=a[y1:y1+h]
    t=np.linspace(0,1,h)[:,None,None]; fill=up*(1-t)+dn*t
    w=np.clip(np.minimum(np.arange(h),np.arange(h)[::-1])/6,0,1)[:,None,None]
    a[y0:y1]=a[y0:y1]*(1-w)+fill*w
    return a

def draw_dashes(a,spr):
    d,al,_=spr; h,L=al.shape; a=a.copy()
    n=a.shape[1]//P
    for k in range(n):
        cx=P/2+k*P; x=int(np.floor(cx-L/2+0.5)); y=257-h//2   # same rounding for every dash
        a[y:y+h,x:x+L]=a[y:y+h,x:x+L]*(1-al[...,None])+d*al[...,None]
    return a

def seam_strip(v2):
    # shared 2E-wide strip, dash-free, from calm asphalt of straight-3; every
    # piece ends with G[:, :E] and starts with G[:, E:], so ANY two pieces meet on
    # neighbouring columns of the same strip
    return v2[:,300:300+2*E].copy()

def ends(a,G,R=150):
    a=a.copy(); n=a.shape[1]
    # 1) spread any overall tone difference to the shared strip over R px, so a
    #    darker/lighter skin eases into the join instead of showing a band
    # robust per-row tone (median ignores a puddle/drain/crack near the end), clamped
    def rowmean(x): return blur(np.repeat(np.median(x,1,keepdims=True),8,1),8)[:,:1]
    dl=np.clip(rowmean(G[:,E:])-rowmean(a[:,E:3*E]),-8,8); dr=np.clip(rowmean(G[:,:E])-rowmean(a[:,n-3*E:n-E]),-8,8)
    x=np.arange(n); rl=np.clip(1-x/R,0,1)**2; rr=np.clip(1-(n-1-x)/R,0,1)**2
    rows=np.zeros(S); rows[C:S-C]=1                                  # asphalt only, curb untouched
    a+=(dl*rl[None,:,None]+dr*rr[None,:,None])*rows[:,None,None]
    r=(0.5-0.5*np.cos(np.linspace(0,np.pi,E)))[None,:,None]   # 0 -> 1 smoothstep
    a[:,:E]=a[:,:E]*r+G[:,E:]*(1-r)
    a[:,n-E:]=a[:,n-E:]*(1-r)+G[:,:E]*r
    return a

# puddles: only straight-2 keeps its puddle; halves must not repeat it, so
# half-2 has it removed (each puddle in the set is unique)
PUDDLES={2:[(196,466,328,454)],3:[],4:[]}
def unpuddle(a,x0,x1,y0,y1,f=14):
    # refill from the calm far lane at the same columns (rows above the dash band)
    a=a.copy(); h=y1-y0; w=x1-x0; sy=90
    p=a[sy:sy+h,x0:x1][::-1]                 # flipped so the gutter-side shading runs the right way
    wy=np.clip(np.minimum(np.arange(h),np.arange(h)[::-1])/f,0,1)
    wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
    m=(wy[:,None]*wx[None,:])[...,None]
    a[y0:y1,x0:x1]=a[y0:y1,x0:x1]*(1-m)+p*m
    return a


def heal(a,x0,x1,y0,y1,r=10,ring=6,f=10):
    """match a region's low-frequency tone to its surroundings: the soft base is
    interpolated from the border just outside the box (Coons patch), the fine
    grain inside is kept. Removes repair rectangles / tone steps without blur."""
    a=a.copy(); lo=np.stack([blur(a[...,i],r) for i in range(3)],-1) if False else None
    lo=np.asarray(Image.fromarray(np.clip(a,0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(r))).astype(float)
    X0,X1,Y0,Y1=max(x0-ring,0),min(x1+ring,a.shape[1]-1),max(y0-ring,0),min(y1+ring,a.shape[0]-1)
    top=lo[Y0,x0:x1]; bot=lo[Y1,x0:x1]; lef=lo[y0:y1,X0]; rig=lo[y0:y1,X1]
    h,w=y1-y0,x1-x0; t=np.linspace(0,1,h)[:,None,None]; u=np.linspace(0,1,w)[None,:,None]
    c00,c01,c10,c11=lo[Y0,X0],lo[Y0,X1],lo[Y1,X0],lo[Y1,X1]
    L=(1-t)*top[None]+t*bot[None]+(1-u)*lef[:,None]+u*rig[:,None]-((1-u)*(1-t)*c00+u*(1-t)*c01+(1-u)*t*c10+u*t*c11)
    new=a[y0:y1,x0:x1]-lo[y0:y1,x0:x1]+L
    wy=np.clip(np.minimum(np.arange(h),np.arange(h)[::-1])/f,0,1)
    wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
    m=(np.minimum(wy[:,None]*0+1,1)*np.ones((h,w)))[...,None]   # full strength inside
    m=np.clip(m*(0.35+0.65*(wy[:,None]*wx[None,:])[...,None])+0,0,1)
    m=np.ones((h,w,1))
    a[y0:y1,x0:x1]=new
    return a

import hashlib,io
def md5img(x):
    b=io.BytesIO(); Image.fromarray(x.astype('uint8')).save(b,'PNG'); return hashlib.md5(b.getvalue()).hexdigest()

v2={k:make_v2(k) for k in (2,3,4)}
for k in (2,3,4): assert md5img(v2[k])==V2MD5[k], f'v2 rebuild mismatch {k}'
spr=dash_sprite(v2[2])
# ---------- road-straight-5 / -6: remixed from the three source images ----------
def calm(k):
    """dash-free, 516-wide v2 of variant k with drains and the straight-2 puddle removed"""
    b=remove_dashes(v2[k]); b=np.concatenate([b,b[:,-1:]],1)
    b=undrain(b,DRAINS[k])
    for box in PUDDLES[k]: b=heal(unpuddle(b,*box),*box)
    for box in PATCHES[k]: b=heal(b,*box)
    # the drains sat in a raised curb lip; rebuild the whole gutter run there from
    # clean gutter of the same rows further along (hard against the curb, feathered
    # only sideways and at the road side) so no trace is left on curb or gutter
    for x0,x1,top,dx in GUTTER_FIX[k]: b=gutter_fill(b,x0,x1,top,dx)
    return b

def lanes(top,bot):
    """top lane rows from one image, bottom lane from another, blended across the dash band"""
    t=np.clip((np.arange(S)-236)/40,0,1)[:,None,None]
    return top*(1-t)+bot*t

PATCHES={2:[],3:[(122,398,140,340)],4:[]}   # 3's repair rectangle (kept on straight-3 itself)
GUTTER_FIX={2:[(0,250,True,260)],3:[(0,170,True,200),(360,516,False,-220)],4:[]}
def gutter_fill(a,x0,x1,top,dx,depth=60,f=16):
    a=a.copy(); w=x1-x0
    y0,y1=(C,C+depth) if top else (S-C-depth,S-C)
    p=a[y0:y1,x0+dx:x1+dx]
    wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
    if x0==0: wx[:f]=1                                  # piece end: the end strip takes over
    if x1==FULL: wx[-f:]=1
    h=y1-y0; wy=np.clip((np.arange(h)[::-1] if top else np.arange(h))/f,0,1)
    m=(wy[:,None]*wx[None,:])[...,None]; a[y0:y1,x0:x1]=a[y0:y1,x0:x1]*(1-m)+p*m; return a

def fill_box(a,x0,x1,y0,y1,src_dy,f=14,src_dx=0):
    """cover a feature with the same columns from src_dy rows away, feathered"""
    a=a.copy(); h=y1-y0; w=x1-x0
    p=a[y0+src_dy:y1+src_dy,x0+src_dx:x1+src_dx]
    wy=np.clip(np.minimum(np.arange(h),np.arange(h)[::-1])/f,0,1)
    wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
    m=(wy[:,None]*wx[None,:])[...,None]; a[y0:y1,x0:x1]=a[y0:y1,x0:x1]*(1-m)+p*m; return a

def blur(x,r): return np.asarray(Image.fromarray(x.astype('uint8')).filter(ImageFilter.GaussianBlur(r))).astype(float)

def transfer_dark(a,src,box,to,strength=1.0,f=10):
    """move only the darker detail (cracks/stains) of src[box] onto a at `to`; the
    base keeps its own tone, so nothing looks like a pasted patch"""
    x0,x1,y0,y1=box; X,Y=to; h=y1-y0; w=x1-x0
    p=src[y0:y1,x0:x1].mean(2); lo=blur(p,6)
    d=np.clip(lo-p,0,None)*strength                     # how much darker than its surroundings
    wy=np.clip(np.minimum(np.arange(h),np.arange(h)[::-1])/f,0,1)
    wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
    d=d*(wy[:,None]*wx[None,:])
    a=a.copy(); a[Y:Y+h,X:X+w]-=d[...,None]*np.array([1.0,0.97,0.95]); return a

def paste_drain(a,src,box,to,f=4):
    """a real drain grate (with its frame) moved to a new place along the curb"""
    x0,x1,y0,y1=box; X,Y=to; h=y1-y0; w=x1-x0
    wy=np.clip(np.minimum(np.arange(h),np.arange(h)[::-1])/f,0,1)
    wx=np.clip(np.minimum(np.arange(w),np.arange(w)[::-1])/f,0,1)
    m=(wy[:,None]*wx[None,:])[...,None]
    a=a.copy(); a[Y:Y+h,X:X+w]=a[Y:Y+h,X:X+w]*(1-m)+src[y0:y1,x0:x1]*m; return a

PUD_SRC=None
def puddle(a,cx,cy,rx,ry,seed,rot=0.0):
    """a new puddle shape: noisy blob mask (own seed/size/aspect) filled with the
    real wet-asphalt texture taken from inside straight-2's puddle"""
    global PUD_SRC
    if PUD_SRC is None:
        q=np.concatenate([v2[2],v2[2][:,-1:]],1)[372:412,250:420]      # inside the real puddle
        PUD_SRC=q
    r=np.random.default_rng(seed)
    H,W=int(ry*2.6),int(rx*2.6); yy,xx=np.mgrid[0:H,0:W]
    u=(xx-W/2)/rx; v=(yy-H/2)/ry
    c,s_=np.cos(rot),np.sin(rot); u,v=u*c-v*s_,u*s_+v*c
    n=blur(r.random((H,W))*255,max(rx,ry)/5)/255.; n=(n-n.mean())/(n.std()+1e-6)
    n2=blur(r.random((H,W))*255,max(rx,ry)/14)/255.; n2=(n2-n2.mean())/(n2.std()+1e-6)
    field=1-(u*u+v*v)+0.5*n+0.22*n2
    rr=u*u+v*v
    m=np.clip(field/0.12,0,1)*np.clip((1.6-rr)/0.5,0,1)   # never reaches the box edge
    m=blur(m*255,1.2)/255.
    # wet texture: tile the real puddle patch with random offsets
    tex=np.zeros((H,W,3)); ph,pw=PUD_SRC.shape[:2]
    for y in range(0,H,ph-8):
        for x in range(0,W,pw-8):
            q=PUD_SRC if r.random()<.5 else PUD_SRC[:,::-1]
            hh=min(ph,H-y); ww=min(pw,W-x); tex[y:y+hh,x:x+ww]=q[:hh,:ww]
    tex=blur(tex,1.5)
    y0=cy-H//2; x0=cx-W//2
    reg=a[y0:y0+H,x0:x0+W]
    # darker rim where water meets dry asphalt
    rim=np.clip(m*(1-m)*4,0,1)*0.15
    a=a.copy(); a[y0:y0+H,x0:x0+W]=reg*(1-m[...,None])+tex*m[...,None]
    a[y0:y0+H,x0:x0+W]*=(1-rim)[...,None]
    return a


c={k:calm(k) for k in (2,3,4)}
# shared end strip: calm, flattened asphalt + curb, no drain, no puddle, no patch edge
G=None
src2,src3,src4=[np.concatenate([v2[k],v2[k][:,-1:]],1) for k in (2,3,4)]

def flatten(a,strength=0.75,r=45):
    """even out big soft tone blotches (old repair rectangles, bands) in the
    asphalt only; fine grain, cracks and the curb stay untouched"""
    lum=a.mean(2); lo=blur(lum,r)
    tgt=lo[C+10:S-C-10].mean()
    w=np.zeros(S); w[C+6:S-C-6]=1; w=blur(np.tile(w[:,None]*255,(1,8)),4)[:,0:1]/255.
    return a-((lo-tgt)*strength*w)[...,None]

G=flatten(c[2])[:,300:300+2*E].copy()

def far_from_near(a):
    """a far lane made from a near lane (vertically flipped, so the gutter shading
    still runs towards its own curb)"""
    return a[::-1]

for k in (2,3,4):
    base=remove_dashes(v2[k])
    full=np.concatenate([base,base[:,-1:]],1)                 # 515 -> 516 (one column, no rescale)
    out=draw_dashes(ends(full,G),spr)
    Image.fromarray(np.clip(out,0,255).astype('uint8')).save(f'assets/roads/road-straight-{k}_v3.png')
    clean=c[k]                                                # halves: no drains, no puddle, no lip trace
    # pick the 258-px window whose end zones are calmest, so no puddle/crack/patch
    # gets cut off at a join (the end zones blend into the shared seam strip)
    g=clean[60:450].mean(2)
    dk=(g<85).sum(0)*1.0   # dark blobs (puddle) must not touch an end zone
    sc=lambda s0:dk[max(s0-4,0):s0+E+4].sum()+dk[s0+HALF-E-4:s0+HALF+4].sum()+g[:,s0:s0+E].std(1).mean()+g[:,s0+HALF-E:s0+HALF].std(1).mean()+np.abs(g[:,s0:s0+E].mean()-g[:,s0+HALF-E:s0+HALF].mean())*.2
    s0=min(range(0,FULL-HALF+1,2),key=sc)
    half=clean[:,s0:s0+HALF]; print(k,'half window',s0)
    out=draw_dashes(ends(half,G),spr)
    Image.fromarray(np.clip(out,0,255).astype('uint8')).save(f'assets/roads/road-straight-half-{k}.png')
    print(k,'ok')



# 5: calm far lane of 2, near lane of 3 with its tyre marks covered; cracks from 4
#    moved to new spots (subtle), one drain on the near curb, one small puddle
b5=flatten(lanes(c[2],c[3]))
b5=fill_box(b5,316,506,318,452,0,src_dx=-196)              # hide 3's tyre marks
b5=transfer_dark(b5,src4,(90,200,70,210),(300,72),0.7)     # crack cluster, far lane
b5=transfer_dark(b5,src4,(430,500,300,390),(60,330),0.5)   # small crack, near lane
b5=paste_drain(b5,src3,(392,504,428,463),(170,428))        # drain on the near curb
b5=puddle(b5,110,140,46,24,seed=51,rot=0.15)               # small puddle, far lane
# 6: calm far lane of 3 (flipped sideways), near lane of 4 with grass toned down,
#    a thin crack, one drain on the far curb, one long thin puddle
b6=flatten(lanes(c[3][:, ::-1],c[4]))
b6=fill_box(b6,0,516,392,452,-70,f=20)                     # soften 4's grass band
b6=transfer_dark(b6,src4,(300,345,60,150),(240,80),0.6)    # thin crack, far lane
b6=transfer_dark(b6,src4,(150,200,295,335),(120,330),0.5)  # hairline, near lane
b6=paste_drain(b6,src2,(45,163,52,90),(360,52))            # drain on the far curb
b6=puddle(b6,330,400,78,20,seed=62,rot=-0.06)              # long thin puddle, near lane
# 7: plain clean road. far lane = 2's near lane (puddle healed) turned to face the far
#    curb, near lane = 3's far lane (repair patch healed) turned to face the near curb; tyre marks covered,
#    only two faint hairline cracks
far7=far_from_near(c[2])[:, ::-1]; near7=far_from_near(c[3])
b7=lanes(far7,near7)
b7=fill_box(b7,370,516,60,215,0,src_dx=-200)               # 2's tyre marks (now far lane, right)
b7=flatten(b7)
b7=transfer_dark(b7,src4,(430,500,60,150),(380,90),0.4)    # hairline, far lane
b7=transfer_dark(b7,src4,(150,200,295,335),(90,360),0.35)  # hairline, near lane
for k,b in ((5,b5),(6,b6),(7,b7)):
    out=draw_dashes(ends(b,G),spr)
    Image.fromarray(np.clip(out,0,255).astype('uint8')).save(f'assets/roads/road-straight-{k}.png')
    print(k,'ok')
