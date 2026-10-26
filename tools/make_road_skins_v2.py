import numpy as np
from PIL import Image
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
for k in (2,3,4):
    im=np.asarray(Image.open(f'assets/roads/road-straight-{k}.png').convert('RGB')).astype(float)
    road=im[17:498]                     # gutter + asphalt, 481 rows
    need=S-2*C; rem=len(road)-need; r1=rem//2; r2=rem-r1
    mid=len(road)//2
    lane2,c2=cut(road[mid:],25,mid-40,r2)
    lane1,c1=cut(road[:mid],40,mid-25,r1)
    road=np.concatenate([lane1,lane2]); assert len(road)==need,len(road)
    top=curb(im,k); bot=curb(im[::-1],k+10)[::-1]
    out=np.concatenate([top,road,bot])
    Image.fromarray(np.clip(out,0,255).astype('uint8')).save(f'assets/roads/road-straight-{k}_v2.png')
    print(k,out.shape,'cut rows',c1+17,mid+c2+17)
