import json, struct
# Turn the Kenney fire truck's orange paint red (like the pack fire truck) in its weathered bakes.
# Only body-color pixels with an orange-red hue change; white, chrome, glass, blue lights stay.
import sys, io
import numpy as np
from PIL import Image
import matplotlib.colors as mc
class glbimg:
    @staticmethod
    def load(path):
        b=open(path,'rb').read(); l=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+l]); off=20+l; bl=struct.unpack('<I',b[off:off+4])[0]; return j,b[off+8:off+8+bl]
    @staticmethod
    def get(j,bin_,name):
        for i,im in enumerate(j['images']):
            if im.get('name')==name:
                bv=j['bufferViews'][im['bufferView']]; o=bv.get('byteOffset',0); return i,bin_[o:o+bv['byteLength']]
    @staticmethod
    def save(path,j,bin_,repl):
        # repl: {image_index: new bytes}; rebuild buffer
        views=j['bufferViews']; out=bytearray(); newviews=[]
        for vi,bv in enumerate(views):
            o=bv.get('byteOffset',0); data=bin_[o:o+bv['byteLength']]
            for ii,im in enumerate(j['images']):
                if im['bufferView']==vi and ii in repl: data=repl[ii]
            while len(out)%4: out.append(0)
            nb=dict(bv); nb['byteOffset']=len(out); nb['byteLength']=len(data); out+=data; newviews.append(nb)
        while len(out)%4: out.append(0)
        j['bufferViews']=newviews; j['buffers'][0]['byteLength']=len(out)
        js=json.dumps(j,separators=(',',':')).encode()
        while len(js)%4: js+=b' '
        total=12+8+len(js)+8+len(out)
        open(path,'wb').write(struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out))
# Usage: python3 tools/recolor_firetruck_red.py [ORANGE_DIR]
# Reads the orange bakes from tools/weather_all.py (ORANGE_DIR, default: assets/cars3d/weathered,
# which must still hold the orange files) and writes the red, grimy ones to assets/cars3d/weathered.
import os
from scipy import ndimage
W = os.path.join(os.path.dirname(__file__), '..', 'assets', 'cars3d', 'weathered') + '/'
SRC = (sys.argv[1].rstrip('/') + '/') if len(sys.argv) > 1 else W
# Black grime spots and streaks, only on this truck (Ted: more dirt, black spots).
# cover: higher = more spots. dark: how close the spots get to GRIME.
GRIME = np.array([0.05, 0.035, 0.025], np.float32)
DIRT = {'L2': dict(cover=0.22, dark=0.75, edge=0.35), 'L3': dict(cover=0.38, dark=0.9, edge=0.55)}
def value_noise(shape, cell, rng, stretch=(1, 1)):
    cy, cx = max(1, int(cell * stretch[0])), max(1, int(cell * stretch[1]))
    g = rng.random((shape[0] // cy + 3, shape[1] // cx + 3)).astype(np.float32)
    n = ndimage.zoom(g, (cy, cx), order=3)[:shape[0], :shape[1]]
    return np.clip(n, 0, 1)
def grime(out, hsv, paint, lv):
    cfg = DIRT[lv]; rng = np.random.default_rng(7 if lv == 'L2' else 11)
    sh = out.shape[:2]
    lum = out @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    blue = (hsv[..., 0] > 0.5) & (hsv[..., 0] < 0.75) & (hsv[..., 1] > 0.25)
    light = (lum > 0.86) | blue | (lum < 0.03)          # lamps, glass, background
    grey = (hsv[..., 1] < 0.25) & ~light               # white/chrome panels: half strength
    where = np.maximum(paint, grey * 0.5) * ~light
    big = value_noise(sh, 48, rng) * 0.6 + value_noise(sh, 16, rng) * 0.4
    spots = smooth(1 - cfg['cover'], 1 - cfg['cover'] + 0.12, big)
    small = smooth(0.84 - cfg['cover'] * 0.25, 0.94 - cfg['cover'] * 0.25, value_noise(sh, 10, rng))
    streak = smooth(0.72, 0.85, value_noise(sh, 6, rng, (12, 1))) * value_noise(sh, 40, rng)
    island = ndimage.uniform_filter((lum > 0.03).astype(np.float32), 13)
    edge = smooth(0.95, 0.55, island) * cfg['edge']
    amt = np.clip(np.maximum.reduce([spots, small * 0.7, streak * 0.8, edge]), 0, 1) * cfg['dark'] * where
    return out * (1 - amt[..., None]) + GRIME * amt[..., None]
SHIFT = 0.005 - 0.027   # Kenney paint hue 0.027 -> pack red 0.005
SAT = 1.35
VAL = 0.68
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
for lv in ('L2', 'L3'):
    path = W + f'firetruck-{lv}.glb'
    j, b = glbimg.load(SRC + f'firetruck-{lv}.glb')
    i, d = glbimg.get(j, b, f'firetruck-{lv}-body-color')
    img = Image.open(io.BytesIO(d)); mode = img.mode
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    hsv = mc.rgb_to_hsv(a)
    h = hsv[..., 0]; hw = np.where(h > 0.5, h - 1, h)   # wrap reds near 1 to negative
    w = smooth(0.25, 0.45, hsv[..., 1]) * (1 - smooth(0.05, 0.075, hw)) * (hw > -0.05)
    new = hsv.copy()
    new[..., 0] = (hw + SHIFT) % 1.0
    new[..., 1] = np.clip(hsv[..., 1] * SAT, 0, 1)
    new[..., 2] = hsv[..., 2] * VAL
    rgb = mc.hsv_to_rgb(new)
    out = a * (1 - w[..., None]) + rgb * w[..., None]
    out = grime(out.astype(np.float32), hsv, w, lv)
    # JPEG (no alpha here) keeps the grimy texture smaller than the old PNG.
    buf = io.BytesIO(); Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(buf, 'JPEG', quality=90, optimize=True)
    j['images'][i]['mimeType'] = 'image/jpeg'
    glbimg.save(path, j, b, {i: buf.getvalue()})
    print(lv, 'changed px', round(float((w > 0.05).mean()), 3), 'bytes', len(d), '->', len(buf.getvalue()))
