# Overlay IAU nomenclature (USGS Gazetteer centre points) on the surface maps to check their registration.
# Usage: python check-texture-registration.py io europa ...   (needs Pillow)
# Reads data-raw/d3/nomenclature/<BODY>_nomenclature_center_pts.kmz, downloaded from
# https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/, and writes data-raw/d3/check/check_<id>.jpg.
# Circles mark the 14 largest named features; each should sit on its feature.
import sys, zipfile, re, math, os
from PIL import Image, ImageDraw
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../..'))
R={'io':1821.5,'europa':1560.8,'ganymede':2631.2,'callisto':2410.3,'mimas':198.2,'enceladus':252.1,'tethys':531.1,'dione':561.4,'rhea':763.5,'iapetus':734.3,'titan':2574.7,'triton':1352.6,'charon':606,'ceres':470,'vesta':262,'phobos':11.1,'deimos':6.2,'miranda':235.8,'ariel':578.9,'umbriel':584.7,'titania':788.9,'oberon':761.4}
def feats(body):
    z=zipfile.ZipFile(f'{ROOT}/data-raw/d3/nomenclature/{body.upper()}_nomenclature_center_pts.kmz')
    s=z.read([n for n in z.namelist() if n.endswith('.kml')][0]).decode('utf8','replace')
    out=[]
    for pm in re.findall(r'<Placemark.*?</Placemark>',s,re.S):
        g=lambda k: (re.search(rf'name="{k}">(.*?)<',pm) or [None,None])[1]
        try: out.append((g('clean_name'),float(g('diameter') or 0),float(g('center_lon')),float(g('center_lat')),g('type')))
        except: pass
    return out
def run(body,n=14,out=None):
    im=Image.open(f'{ROOT}/public/textures/{body}.jpg').convert('RGB')
    W,H=im.size; d=ImageDraw.Draw(im)
    fs=sorted(feats(body),key=lambda f:-f[1])[:n]
    for name,diam,lon,lat,typ in fs:
        lon=((lon+180)%360)-180
        x=(lon+180)/360*W; y=(90-lat)/180*H
        r=max(3,diam/2/R[body]*180/math.pi*W/360)
        rx=r/max(0.2,math.cos(math.radians(lat)))
        d.ellipse([x-rx,y-r,x+rx,y+r],outline=(255,0,0),width=2)
        d.text((x+4,y+4),name,fill=(255,255,0))
    os.makedirs(f'{ROOT}/data-raw/d3/check', exist_ok=True)
    im.save(out or f'{ROOT}/data-raw/d3/check/check_{body}.jpg', quality=80)
for b in sys.argv[1:]: run(b)
