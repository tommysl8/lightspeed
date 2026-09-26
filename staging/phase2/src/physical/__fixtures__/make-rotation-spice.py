# Reference orientations from the SPICE Toolkit (CSPICE N0067 via spiceypy) using pck00011.tpc,
# for testing staging/phase2/src/rotation.ts. Output: body-fixed -> ECLIPJ2000 matrices and the
# BODEUL angles (RA, Dec, W) at several TDB epochs.
import json, spiceypy as sp, math
ROOT='C:/Users/tommy/OneDrive/Desktop/SpaceXYZ'
sp.furnsh(f'{ROOT}/data-raw/d3/pck00011.tpc')
bodies=json.load(open(f'{ROOT}/staging/phase2/bodies.json',encoding='utf8'))['bodies']
epochs=[-36525.0,-6939.5,0.0,5000.25,9764.5,36525.0,73049.5,109575.0]
out={'generator':'spiceypy '+sp.__version__+' / CSPICE '+sp.tkvrsn('TOOLKIT'),'kernel':'pck00011.tpc','epochsTdbDays':epochs,'bodies':{}}
for b in bodies:
    r=b.get('rotation',{})
    if r.get('model')!='iau-2015': continue
    naif=b['naifId']; rows=[]
    for d in epochs:
        et=d*86400.0
        # BODEUL is not wrapped by spiceypy; TIPBOD gives J2000 -> body-fixed.
        tip=sp.tipbod('J2000',naif,et)
        ecl=sp.pxform('J2000','ECLIPJ2000',et)
        m=sp.mxmt(ecl,tip)          # body-fixed -> ECLIPJ2000 = ecl * tip^T
        # recover ra/dec/w from tip (rows: body axes in J2000)
        z=tip[2]; x=tip[0]
        dec=math.degrees(math.asin(z[2])); ra=math.degrees(math.atan2(z[1],z[0]))%360
        rows.append({'d':d,'bodyToEcliptic':[list(map(float,row)) for row in m],'poleRaDeg':ra,'poleDecDeg':dec})
    out['bodies'][b['id']]=rows
json.dump(out,open(f'{ROOT}/staging/phase2/src/physical/__fixtures__/rotation-spice.json','w'),indent=0)
print(len(out['bodies']),'bodies')
