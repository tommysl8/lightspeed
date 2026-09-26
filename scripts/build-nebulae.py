"""Builds the nebula billboards: public/images/nebulae/<id>.jpg and staging/galaxy/nebulae.json.

Images: ESA/Hubble, ESA/Webb, ESO and NSF NOIRLab public image archives. All four state that their images are
released under Creative Commons Attribution 4.0 International and may be reproduced provided the full credit line is
shown clearly and visibly next to the image (https://esahubble.org/copyright/, https://esawebb.org/copyright/,
https://www.eso.org/public/outreach/copyright/, https://noirlab.edu/public/copyright/). Each object below records
its image id, page URL and the exact credit line from its page.

Geometry: each archive page gives the image centre (RA, Dec), field of view and "North is X deg left/right of
vertical". We use those to crop (when needed) and to size the billboard: width_pc = 2 d tan(fov / 2).

Distances: see the per-object 'distance' spec and galaxy.md. Gaia-based values get a 0.015 mas parallax systematic
added in quadrature (Lindegren et al. 2021, A&A 649, A4).

Inputs (downloaded once, cached): data-raw/galaxy/nebulae/<imageId>.jpg; archive pages cached next to them.
Also data-raw/galaxy/HR24_clusters.dat.gz (Hunt & Reffert 2024) for cluster distances.

Run: python scripts/build-nebulae.py   (Python 3.10+, numpy, Pillow; network only for images not yet cached)
"""

from __future__ import annotations

import gzip
import html
import json
import math
import re
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw" / "galaxy" / "nebulae"
OUT_IMG = ROOT / "public" / "images" / "nebulae"
OUT_JSON = ROOT / "staging" / "galaxy" / "nebulae.json"
HR24 = ROOT / "data-raw" / "galaxy" / "HR24_clusters.dat.gz"
MAX_PX = 512
JPEG_Q = 90
EDGE_FADE = 0.08  # fraction of each side over which the billboard fades to black
PLX_SYS_MAS = 0.015

PAGES = {
    "hubble": "https://esahubble.org/images/{id}/",
    "webb": "https://esawebb.org/images/{id}/",
    "eso": "https://www.eso.org/public/images/{id}/",
    "noirlab": "https://noirlab.edu/public/images/{id}/",
}

# Literature distances (pc). Keys are referenced from OBJECTS.
LIT = {
    "Kounkel2017_ONC": dict(d=388, minus=5, plus=5, ref="Kounkel M. et al. 2017, ApJ 834, 142 (VLBA parallaxes, GOBELINS II)", doi="10.3847/1538-4357/834/2/142", method="VLBA radio parallaxes of young stars"),
    "Kounkel2017_NGC2024": dict(d=420, minus=20, plus=20, ref="Kounkel M. et al. 2017, ApJ 834, 142 ('roughly ~420 pc towards NGC 2024'; the +-20 pc is our reading of 'roughly')", doi="10.3847/1538-4357/834/2/142", method="VLBA radio parallaxes"),
    "Kuhn2019_M20": dict(d=1264, minus=68, plus=76, ref="Kuhn M.A. et al. 2019, ApJ 870, 32, Table 1 (Gaia DR2)", doi="10.3847/1538-4357/aaef8c", method="Gaia DR2 parallaxes of cluster members"),
    "Kuhn2019_M17": dict(d=1680, minus=110, plus=130, ref="Kuhn M.A. et al. 2019, ApJ 870, 32, Table 1 (Gaia DR2)", doi="10.3847/1538-4357/aaef8c", method="Gaia DR2 parallaxes of cluster members"),
    "Kuhn2020_NAP": dict(d=795, minus=25, plus=25, ref="Kuhn M.A. et al. 2020, ApJ 899, 128 (Gaia DR2)", doi="10.3847/1538-4357/aba19a", method="Gaia DR2 parallaxes of young stars"),
    "Smith2006_EtaCar": dict(d=2350, minus=50, plus=50, ref="Smith N. 2006, ApJ 644, 1151", doi="10.1086/503766", method="expansion parallax of the Homunculus"),
    "Meaburn2008_NGC6302": dict(d=1170, minus=140, plus=140, ref="Meaburn J. et al. 2008, MNRAS 385, 269", doi="10.1111/j.1365-2966.2007.12782.x", method="expansion proper motions over 50 years"),
    "Ueta2006_Egg": dict(d=420, minus=60, plus=60, ref="Ueta T., Murakawa K., Meixner M. 2006, ApJ 641, 1113 ('about 420 pc'; the +-60 pc is our allowance, not quoted)", doi="10.1086/500642", method="expansion proper motions (HST NICMOS)"),
    "Trimble1973_Crab": dict(d=2000, minus=500, plus=500, ref="Trimble V. 1973, PASP 85, 579", doi="10.1086/129507", method="expansion parallax and radial velocities"),
    "Fesen2021_CygLoop": dict(d=725, minus=15, plus=15, ref="Fesen R.A., Weil K.E., Cisneros I. 2021, MNRAS 507, 244", doi="10.1093/mnras/stab2066", method="Gaia EDR3 parallaxes of stars in and behind the shell"),
    "Reed1995_CasA": dict(d=3400, minus=100, plus=300, ref="Reed J.E. et al. 1995, ApJ 440, 706", doi="10.1086/175308", method="3D kinematics of the ejecta knots"),
    "Dodson2003_Vela": dict(d=293, minus=17, plus=19, ref="Dodson R. et al. 2003, ApJ 596, 1137", doi="10.1086/378089", method="VLBI parallax of the Vela pulsar"),
    "Pietrzynski2019_LMC": dict(d=49590, minus=544, plus=544, ref="Pietrzynski G. et al. 2019, Nature 567, 200 (49.59 +- 0.09 stat +- 0.54 sys kpc)", doi="10.1038/s41586-019-0999-4", method="detached eclipsing binaries"),
    "Graczyk2020_SMC": dict(d=62440, minus=934, plus=934, ref="Graczyk D. et al. 2020, ApJ 904, 13 (62.44 +- 0.47 stat +- 0.81 sys kpc)", doi="10.3847/1538-4357/abbb2b", method="detached eclipsing binaries"),
}

# Gaia EDR3 geometric distances (Bailer-Jones et al. 2021, AJ 161, 147; VizieR I/352) of the central/ionising star.
BJ = {
    "M57": (2090486618786534784, 782.5, 750.8, 811.5),
    "NGC7293": (6628874205642084224, 198.6, 196.9, 200.2),
    "M27": (1827256624493300096, 386.8, 380.6, 394.2),
    "NGC6543": (1633325248915154176, 1316.9, 1273.7, 1371.6),
    "NGC3132": (5420219732228461184, 753.6, 735.5, 768.2),
    "NGC7009": (6889338034837425920, 1182.5, 1116.4, 1261.7),
    "IC418": (2985789113026163584, 1321.1, 1268.8, 1383.5),
    "MyCn18": (5851342841411810304, 4812.8, 3342.3, 9103.8),
    "BD+60_2522": (2014149897293278848, 2829.5, 2729.8, 2963.0),
    "WR7": (3032940844556081408, 4117.6, 3717.9, 4659.4),
    "WR136": (2061690233159124352, 1669.0, 1631.0, 1710.9),
    "HD200775": (2270245431209611776, 351.8, 346.8, 356.5),
}

# The curated list. crop: None (full frame) or dict(ra, dec, w, h) in degrees/arcmin (centre and size).
OBJECTS = [
    # --- star-forming regions (H II regions and their clouds) ---
    dict(id="orion-nebula", name="Orion Nebula", alt=["M42", "M43", "NGC 1976"], kind="HII region", site="eso", img="eso1723a", size="screen", simbad="M 42", dist=("lit", "Kounkel2017_ONC"),
         blurb="The nearest large stellar nursery, lit by the Trapezium stars. About 2,000 young stars in the cluster."),
    dict(id="horsehead", name="Horsehead Nebula", alt=["Barnard 33"], kind="dark nebula", site="eso", img="eso0202a", size="screen", simbad="Barnard 33", dist=("hr24", "Sigma_Orionis"),
         blurb="A dark pillar of dust silhouetted against the glowing IC 434, which is lit by sigma Orionis."),
    dict(id="flame-nebula", name="Flame Nebula", alt=["NGC 2024"], kind="HII region", site="eso", img="eso0949a", size="screen", simbad="NGC 2024", dist=("lit", "Kounkel2017_NGC2024"),
         blurb="Infrared image (VISTA): the dust hides a young cluster that visible light cannot reach.", band="near-infrared"),
    dict(id="m78", name="M78", alt=["NGC 2068"], kind="reflection nebula", site="eso", img="eso1105a", size="screen", simbad="M 78", dist=("hr24", "NGC_2068"),
         blurb="Blue starlight scattered by dust in the Orion B cloud."),
    dict(id="rosette-nebula", name="Rosette Nebula", alt=["NGC 2237", "NGC 2244"], kind="HII region", site="noirlab", img="noirlab2424a", size="screen", simbad="NGC 2237", dist=("hr24", "NGC_2244"),
         blurb="A hollow shell of ionised gas blown out by the young cluster NGC 2244 at its centre."),
    dict(id="ngc-2264", name="NGC 2264: Cone Nebula and Christmas Tree Cluster", alt=["NGC 2264"], kind="HII region", site="eso", img="eso0848a", size="screen", simbad="NGC 2264", dist=("hr24", "NGC_2264"),
         blurb="A young cluster and its nebula; the dark Cone Nebula points up from the bottom of the frame."),
    dict(id="cone-nebula", name="Cone Nebula", alt=[], kind="dark nebula", site="eso", img="eso2215a", size="screen", simbad="Cone Nebula", dist=("hr24", "NGC_2264"), parent="ngc-2264",
         blurb="A pillar of cold gas and dust being eroded by ultraviolet light from nearby hot stars."),
    dict(id="eagle-nebula", name="Eagle Nebula", alt=["M16", "NGC 6611"], kind="HII region", site="eso", img="eso0926a", size="screen", simbad="M 16", dist=("hr24", "NGC_6611"),
         blurb="Star cluster NGC 6611 and the nebula it lights, home of the Pillars of Creation."),
    dict(id="pillars-of-creation", name="Pillars of Creation", alt=[], kind="dark nebula", site="hubble", img="heic1501a", size="screen", simbad="M 16", dist=("hr24", "NGC_6611"), parent="eagle-nebula",
         blurb="Columns of gas a few light years tall, being evaporated by the cluster's ultraviolet light."),
    dict(id="lagoon-nebula", name="Lagoon Nebula", alt=["M8", "NGC 6523", "NGC 6530"], kind="HII region", site="eso", img="eso1403a", size="screen", simbad="M 8", dist=("hr24", "NGC_6530"),
         blurb="A giant cloud of glowing hydrogen around the young cluster NGC 6530."),
    dict(id="trifid-nebula", name="Trifid Nebula", alt=["M20", "NGC 6514"], kind="HII region", site="eso", img="eso0930a", size="screen", simbad="M 20", dist=("lit", "Kuhn2019_M20"),
         blurb="Red emission split by dark dust lanes, next to a blue reflection nebula."),
    dict(id="omega-nebula", name="Omega Nebula", alt=["M17", "Swan Nebula", "NGC 6618"], kind="HII region", site="eso", img="eso1119a", size="screen", simbad="NGC 6618", dist=("lit", "Kuhn2019_M17"),
         blurb="One of the brightest and most massive star-forming regions in the Galaxy."),
    dict(id="carina-nebula", name="Carina Nebula", alt=["NGC 3372"], kind="HII region", site="eso", img="eso1250a", size="screen", simbad="NGC 3372", dist=("hr24", "Trumpler_16"),
         blurb="A complex four times the size of the Orion Nebula, with Eta Carinae and dozens of O stars."),
    dict(id="cosmic-cliffs", name="Cosmic Cliffs (NGC 3324)", alt=["NGC 3324"], kind="HII region", site="webb", img="weic2205a", size="screen", simbad="NGC 3324", dist=("hr24", "NGC_3324"), parent="carina-nebula",
         blurb="Webb's first-image view of the edge of the cavity carved by NGC 3324.", band="near-infrared"),
    dict(id="eta-carinae", name="Homunculus Nebula around Eta Carinae", alt=["eta Car"], kind="LBV nebula", site="hubble", img="opo9623a", size="screen", simbad="eta Car", dist=("lit", "Smith2006_EtaCar"), parent="carina-nebula",
         blurb="Two lobes of gas and dust thrown off in the 1840s 'Great Eruption' of a star of about 100 solar masses."),
    dict(id="cats-paw-nebula", name="Cat's Paw Nebula", alt=["NGC 6334"], kind="HII region", site="eso", img="eso1003a", size="screen", simbad="NGC 6334", dist=("hr24", "NGC_6334"),
         blurb="A very active star-forming complex. A water-maser parallax (0.752 +- 0.069 mas, Reid et al. 2019 Table 1) gives 1.33 kpc, closer than Gaia."),
    dict(id="lobster-nebula", name="Lobster Nebula", alt=["NGC 6357", "War and Peace Nebula"], kind="HII region", site="eso", img="eso1705a", size="publicationjpg", simbad="NGC 6357", dist=("hr24", "NGC_6357"),
         crop=dict(ra=261.18, dec=-34.20, w=60, h=60), blurb="Shaped by Pismis 24, a cluster with some of the most massive stars known."),
    dict(id="ngc-3603", name="NGC 3603", alt=[], kind="HII region", site="eso", img="eso1005a", size="screen", simbad="NGC 3603", dist=("hr24", "NGC_3603"),
         blurb="The most massive visible young cluster in the Milky Way, about 7 kpc away."),
    dict(id="westerlund-2", name="Westerlund 2 and Gum 29", alt=["Gum 29", "RCW 49"], kind="HII region", site="hubble", img="heic1509a", size="screen", simbad="Westerlund 2", dist=("hr24", "Westerlund_2"),
         blurb="A 2-million-year-old cluster of about 3,000 stars, Hubble's 25th-anniversary image."),
    dict(id="running-chicken-nebula", name="Running Chicken Nebula", alt=["IC 2944", "IC 2948"], kind="HII region", site="eso", img="eso2320a", size="publicationjpg", simbad="IC 2944", dist=("hr24", "IC_2944"),
         crop=dict(ra=174.4, dec=-63.35, w=90, h=80), blurb="A large H II region in Centaurus with dark Thackeray's globules."),
    dict(id="north-america-nebula", name="North America and Pelican Nebulae", alt=["NGC 7000", "IC 5070"], kind="HII region", site="noirlab", img="noao-n7000mosblock", size="screen", simbad="NGC 7000", dist=("lit", "Kuhn2020_NAP"),
         blurb="One H II region split in two by a foreground dust cloud; the ionising 'Bajamar Star' hides behind it."),
    dict(id="bubble-nebula", name="Bubble Nebula", alt=["NGC 7635"], kind="wind-blown bubble", site="hubble", img="heic1608a", size="screen", simbad="NGC 7635", dist=("bj", "BD+60_2522"),
         blurb="A 7-light-year bubble blown by the wind of the young O star BD+60 2522."),
    dict(id="thors-helmet", name="Thor's Helmet", alt=["NGC 2359"], kind="Wolf-Rayet nebula", site="eso", img="eso1238a", size="screen", simbad="NGC 2359", dist=("bj", "WR7"),
         blurb="A bubble inflated by the fierce wind of the Wolf-Rayet star WR 7."),
    dict(id="seagull-nebula", name="Seagull Nebula", alt=["IC 2177", "Sh2-292", "Sh2-296"], kind="HII region", site="eso", img="eso1913a", size="screen", simbad="IC 2177", dist=("hr24", "vdBergh_92"),
         blurb="A wide H II complex on the Monoceros-Canis Major border."),
    dict(id="prawn-nebula", name="Prawn Nebula", alt=["IC 4628", "Gum 56"], kind="HII region", site="eso", img="eso1340a", size="screen", simbad="IC 4628", dist=("hr24", "ESO_332-13"),
         blurb="A star-forming cloud in Scorpius lit by young massive stars."),
    dict(id="crescent-nebula", name="Crescent Nebula", alt=["NGC 6888"], kind="Wolf-Rayet nebula", site="noirlab", img="noao-04494", size="screen", simbad="NGC 6888", dist=("bj", "WR136"),
         blurb="Shells of gas swept up by the Wolf-Rayet star WR 136 ramming its earlier, slower wind."),
    dict(id="iris-nebula", name="Iris Nebula", alt=["NGC 7023"], kind="reflection nebula", site="noirlab", img="noao-ngc7023", size="screen", simbad="NGC 7023", dist=("bj", "HD200775"),
         blurb="Dust lit by the young star HD 200775."),
    dict(id="pleiades-nebulosity", name="Pleiades reflection nebula", alt=["M45"], kind="reflection nebula", site="noirlab", img="noao-m45", size="screen", simbad="M 45", dist=("hr24", "Melotte_22"),
         blurb="The cluster is passing through an unrelated dust cloud; the blue haze is starlight scattered by it."),
    # --- Magellanic Clouds ---
    dict(id="tarantula-nebula", name="Tarantula Nebula", alt=["30 Doradus", "NGC 2070"], kind="HII region", site="eso", img="eso0650a", size="publicationjpg", simbad="30 Dor", dist=("lit", "Pietrzynski2019_LMC"),
         crop=dict(ra=84.6767, dec=-69.1009, w=40, h=40), blurb="The most powerful star-forming region in the Local Group, in the Large Magellanic Cloud."),
    dict(id="ngc-346", name="NGC 346", alt=["N66"], kind="HII region", site="webb", img="weic2301a", size="screen", simbad="NGC 346", dist=("lit", "Graczyk2020_SMC"),
         blurb="The brightest star-forming region in the Small Magellanic Cloud, seen by Webb.", band="near-infrared"),
    dict(id="sn-1987a", name="SN 1987A", alt=[], kind="supernova remnant", site="hubble", img="heic1704a", size="screen", simbad="SN 1987A", dist=("lit", "Pietrzynski2019_LMC"),
         blurb="The nearest supernova seen since 1604; its blast wave is lighting up a ring thrown off 20,000 years earlier."),
    # --- planetary nebulae and their precursors ---
    dict(id="ring-nebula", name="Ring Nebula", alt=["M57", "NGC 6720"], kind="planetary nebula", site="hubble", img="heic1310a", size="screen", simbad="M 57", dist=("bj", "M57"),
         blurb="A dying Sun-like star's outer layers, now a glowing barrel seen almost end-on."),
    dict(id="helix-nebula", name="Helix Nebula", alt=["NGC 7293"], kind="planetary nebula", site="eso", img="eso0907a", size="screen", simbad="NGC 7293", dist=("bj", "NGC7293"),
         blurb="One of the nearest planetary nebulae, about 200 pc away."),
    dict(id="dumbbell-nebula", name="Dumbbell Nebula", alt=["M27", "NGC 6853"], kind="planetary nebula", site="eso", img="eso9846a", size="screen", simbad="M 27", dist=("bj", "M27"),
         blurb="The first planetary nebula ever found (Messier, 1764)."),
    dict(id="cats-eye-nebula", name="Cat's Eye Nebula", alt=["NGC 6543"], kind="planetary nebula", site="hubble", img="heic0414a", size="screen", simbad="NGC 6543", dist=("bj", "NGC6543"),
         blurb="Concentric shells puffed off every ~1,500 years before the final ejection."),
    dict(id="butterfly-nebula", name="Butterfly Nebula", alt=["NGC 6302", "Bug Nebula"], kind="planetary nebula", site="hubble", img="heic0910h", size="screen", simbad="NGC 6302", dist=("lit", "Meaburn2008_NGC6302"),
         blurb="Gas streaming out at 950,000 km/h from one of the hottest stars known (about 250,000 K)."),
    dict(id="southern-ring-nebula", name="Southern Ring Nebula", alt=["NGC 3132"], kind="planetary nebula", site="webb", img="weic2207b", size="screen", simbad="NGC 3132", dist=("bj", "NGC3132"),
         blurb="Webb found the dying star is the fainter of a pair; the bright companion's distance is used here.", band="near-infrared"),
    dict(id="hourglass-nebula", name="Hourglass Nebula", alt=["MyCn 18"], kind="planetary nebula", site="hubble", img="opo9607a", size="screen", simbad="PN MyCn 18", dist=("bj", "MyCn18"),
         blurb="A young planetary nebula with a pinched waist. Its distance is poorly known (Gaia parallax error 32%)."),
    dict(id="saturn-nebula", name="Saturn Nebula", alt=["NGC 7009"], kind="planetary nebula", site="eso", img="eso1731a", size="screen", simbad="NGC 7009", dist=("bj", "NGC7009"),
         blurb="MUSE image of a planetary nebula with jets ending in 'ansae' like Saturn's rings seen edge-on."),
    dict(id="spirograph-nebula", name="Spirograph Nebula", alt=["IC 418"], kind="planetary nebula", site="hubble", img="opo0028a", size="screen", simbad="IC 418", dist=("bj", "IC418"),
         blurb="A young planetary nebula with an intricate textured shell."),
    dict(id="egg-nebula", name="Egg Nebula", alt=["CRL 2688", "V1610 Cyg"], kind="pre-planetary nebula", site="hubble", img="heic2604a", size="screen", simbad="V1610 Cyg", dist=("lit", "Ueta2006_Egg"),
         blurb="A star caught a few hundred years into becoming a planetary nebula; searchlight beams escape its dusty cocoon."),
    # --- supernova remnants ---
    dict(id="crab-nebula", name="Crab Nebula", alt=["M1", "NGC 1952"], kind="supernova remnant", site="hubble", img="heic0515a", size="screen", simbad="M 1", dist=("lit", "Trimble1973_Crab"),
         blurb="Debris of the supernova of 1054, powered by a pulsar spinning 30 times a second."),
    dict(id="cygnus-loop", name="Cygnus Loop (Veil Nebula)", alt=["NGC 6960", "NGC 6992", "Veil Nebula"], kind="supernova remnant", site="noirlab", img="noao1209a", size="screen", simbad="Cygnus Loop", dist=("lit", "Fesen2021_CygLoop"),
         blurb="A 36-pc shell from a star that exploded 10,000 to 20,000 years ago."),
    dict(id="cassiopeia-a", name="Cassiopeia A", alt=["Cas A", "SN 1680"], kind="supernova remnant", site="hubble", img="heic0609a", size="screen", simbad="Cas A", dist=("lit", "Reed1995_CasA"),
         blurb="The youngest known remnant of a core-collapse supernova in the Galaxy; its light reached Earth around 1680."),
    dict(id="pencil-nebula", name="Pencil Nebula", alt=["NGC 2736"], kind="supernova remnant", site="eso", img="eso1236a", size="screen", simbad="NGC 2736", dist=("lit", "Dodson2003_Vela"),
         blurb="A shock front in the Vela supernova remnant, moving at 650,000 km/h."),
]

# SIMBAD positions (ICRS, J2000) and catalogue dimensions (arcmin), fetched once; see galaxy.md.
SIMBAD = {
    "M 42": (83.8201, -5.3876, 66.0), "Barnard 33": (85.2458, -2.4583, 6.0), "NGC 2024": (85.429, -1.842, None),
    "M 78": (86.6908, 0.0792, None), "NGC 2237": (97.65042, 4.98072, None), "NGC 2264": (100.2171, 9.8769, None),
    "Cone Nebula": (100.28, 9.88, None), "M 16": (274.6880, -13.7920, None), "M 8": (270.904, -24.387, None),
    "M 20": (270.675, -22.972, 28.0), "NGC 6618": (275.196, -16.172, None), "NGC 3372": (161.25929, -59.69994, None),
    "NGC 3324": (159.3408, -58.6150, None), "eta Car": (161.2647742, -59.6844309, None), "NGC 6334": (260.21842, -36.13067, None),
    "NGC 6357": (261.185, -34.203, None), "NGC 3603": (168.7411, -61.2422, None), "Westerlund 2": (155.9921, -57.7636, None),
    "IC 2944": (174.58333, -63.37278, None), "NGC 7000": (314.696, 44.330, None), "NGC 7635": (350.2012, 61.2017, None),
    "NGC 2359": (109.625, -13.226667, None), "IC 2177": (106.104, -10.455, None), "IC 4628": (254.2278, -40.5123, None),
    "NGC 6888": (303.0272579, 38.3549401, None), "NGC 7023": (315.4037, 68.1633, None), "M 45": (56.6008, 24.1139, None),
    "30 Dor": (84.67665, -69.100933, None), "NGC 346": (14.7683333, -72.1775, None), "SN 1987A": (83.86661833, -69.26975372, None),
    "M 57": (283.3962365, 33.0291342, 1.153), "NGC 7293": (337.4106059, -20.8371520, 13.4), "M 27": (299.9015133, 22.7211978, 6.7),
    "NGC 6543": (269.6391832, 66.6329863, 0.623), "NGC 6302": (258.4354, -37.1031, 0.47), "NGC 3132": (151.7573568, -40.4364252, 0.75),
    "PN MyCn 18": (204.8960817, -67.3810418, 0.059), "NGC 7009": (316.0450647, -11.3634944, 0.707), "IC 418": (81.8675248, -12.6973006, 0.263),
    "V1610 Cyg": (315.57612, 36.69361, 0.562), "M 1": (83.6324, 22.0174, 7.0), "Cygnus Loop": (312.75, 30.67, 230.0),
    "Cas A": (350.8584, 58.8113, 5.0), "NGC 2736": (135.05, -45.95, None),
}

# ICRS -> galactic (Hipparcos definition, rows = galactic axes)
A_G = np.array([
    [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
    [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
    [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
])


def fetch(url: str, dest: Path) -> Path:
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (lightspeed data build)"})
        with urllib.request.urlopen(req, timeout=300) as r:
            dest.write_bytes(r.read())
    return dest


def clean_credit(c: str) -> str:
    """Undo spacing introduced by links in the page HTML. The whole credit is kept: some pages continue it with
    the science and processing teams (heic1509a, Westerlund 2), and ESA/Hubble asks for the full credit, unaltered."""
    c = re.sub(r"\(\s+", "(", c)
    c = re.sub(r"\s+\)", ")", c)
    c = re.sub(r"\s*/\s*", "/", c)
    c = re.sub(r"\s+([,.;])", r"\1", c)
    c = re.sub(r"\)-\s+", ")-", c)
    c = re.sub(r"\s+", " ", c).strip()
    # The page sets the team lists after the credit line as separate paragraphs; keep that break.
    return c.replace(" The original observations", "\nThe original observations")


def page_meta(site: str, img: str) -> dict:
    url = PAGES[site].format(id=img)
    raw = fetch(url, RAW / f"page_{img}.html").read_text(encoding="utf8", errors="replace")
    t = re.sub(r"<script.*?</script>", "", raw, flags=re.S)
    t = re.sub(r"<style.*?</style>", "", t, flags=re.S)
    t = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)))

    def g(p: str):
        m = re.search(p, t)
        return m.group(1).strip() if m else None

    title = re.search(r"<title>(.*?)</title>", raw, re.S)
    ra = g(r"Position \(RA\):\s*([\d .]+)")
    dec = g(r"Position \(Dec\):\s*([-+\d°' .\"]+)")
    fov = g(r"Field of view:\s*([\d.]+ x [\d.]+) arcminutes")
    ori = re.search(r"Orientation:\s*North is ([-\d.]+)\S? (left|right) of vertical", t)
    credit = g(r"Credit:\s*(.*?)\s*(?:More Information|Usage of|About the Image|Are you a journalist)")
    urls = dict(re.findall(r'href="(https?://[^"]+/(screen|publicationjpg|large)/' + re.escape(img) + r'\.jpg)"', raw))
    urls = {v: k for k, v in urls.items()}
    rah = [float(x) for x in ra.split()]
    dp = re.findall(r"[-+]?[\d.]+", dec)
    sign = -1 if dec.strip().startswith("-") else 1
    return dict(
        url=url,
        title=html.unescape(title.group(1).split("|")[0].strip()) if title else img,
        credit=clean_credit(credit or ""),
        ra=15 * (rah[0] + rah[1] / 60 + rah[2] / 3600),
        dec=sign * (abs(float(dp[0])) + float(dp[1]) / 60 + float(dp[2]) / 3600),
        fov=[float(x) for x in fov.split(" x ")],
        north=float(ori.group(1)) * (1 if ori.group(2) == "left" else -1),
        downloads=urls,
    )


def tangent(ra0: float, dec0: float, ra: float, dec: float) -> tuple[float, float]:
    """Gnomonic standard coordinates (xi east, eta north) in arcmin."""
    a0, d0, a, d = map(math.radians, (ra0, dec0, ra, dec))
    cosc = math.sin(d0) * math.sin(d) + math.cos(d0) * math.cos(d) * math.cos(a - a0)
    xi = math.cos(d) * math.sin(a - a0) / cosc
    eta = (math.cos(d0) * math.sin(d) - math.sin(d0) * math.cos(d) * math.cos(a - a0)) / cosc
    return math.degrees(xi) * 60, math.degrees(eta) * 60


def untangent(ra0: float, dec0: float, xi: float, eta: float) -> tuple[float, float]:
    x, y = math.radians(xi / 60), math.radians(eta / 60)
    a0, d0 = math.radians(ra0), math.radians(dec0)
    rho = math.hypot(x, y)
    if rho == 0:
        return ra0, dec0
    c = math.atan(rho)
    dec = math.asin(math.cos(c) * math.sin(d0) + y * math.sin(c) * math.cos(d0) / rho)
    ra = a0 + math.atan2(x * math.sin(c), rho * math.cos(d0) * math.cos(c) - y * math.sin(d0) * math.sin(c))
    return math.degrees(ra) % 360, math.degrees(dec)


def sky_to_pixel(meta: dict, W: int, H: int, ra: float, dec: float) -> tuple[float, float]:
    xi, eta = tangent(meta["ra"], meta["dec"], ra, dec)
    th = math.radians(meta["north"])
    north = (-math.sin(th), math.cos(th))  # image (right, up) components of north
    east = (-math.cos(th), -math.sin(th))
    right = xi * east[0] + eta * north[0]
    up = xi * east[1] + eta * north[1]
    s = meta["fov"][0] / W  # arcmin per pixel
    return W / 2 + right / s, H / 2 - up / s


def pixel_to_sky(meta: dict, W: int, H: int, px: float, py: float) -> tuple[float, float]:
    s = meta["fov"][0] / W
    right, up = (px - W / 2) * s, (H / 2 - py) * s
    th = math.radians(meta["north"])
    north = (-math.sin(th), math.cos(th))
    east = (-math.cos(th), -math.sin(th))
    xi = right * east[0] + up * east[1]
    eta = right * north[0] + up * north[1]
    return untangent(meta["ra"], meta["dec"], xi, eta)


def hr24_distances() -> dict:
    out = {}
    with gzip.open(HR24, "rt", encoding="utf8") as f:
        for line in f:
            if not line.strip():
                continue
            name = line[0:20].strip()
            d16, d50, d84 = (float(line[a - 1 : b]) for a, b in ((584, 598), (600, 614), (616, 631)))
            out[name] = (d50, d16, d84)
    return out


def distance(spec: tuple, hr: dict) -> dict:
    kind, key = spec
    if kind == "lit":
        L = LIT[key]
        return dict(pc=L["d"], minusPc=L["minus"], plusPc=L["plus"], method=L["method"], ref=L["ref"], doi=L["doi"])
    if kind == "hr24":
        d50, d16, d84 = hr[key]
        sys = PLX_SYS_MAS * (d50 / 1000) ** 2 * 1000
        return dict(pc=round(d50, 1), minusPc=round(math.hypot(d50 - d16, sys), 1), plusPc=round(math.hypot(d84 - d50, sys), 1),
                    method=f"Gaia DR3 parallaxes of members of the cluster {key.replace('_', ' ')} (16th-84th percentiles, plus a {PLX_SYS_MAS} mas systematic)",
                    ref="Hunt E.L., Reffert S. 2024, A&A 686, A42 (VizieR J/A+A/686/A42)", doi="10.1051/0004-6361/202348662")
    if kind == "bj":
        sid, r, lo, hi = BJ[key]
        sys = PLX_SYS_MAS * (r / 1000) ** 2 * 1000
        return dict(pc=r, minusPc=round(math.hypot(r - lo, sys), 1), plusPc=round(math.hypot(hi - r, sys), 1),
                    method=f"Gaia EDR3 geometric distance of the central/ionising star, Gaia DR3 {sid} (16th-84th percentiles, plus a {PLX_SYS_MAS} mas systematic)",
                    ref="Bailer-Jones C.A.L. et al. 2021, AJ 161, 147 (VizieR I/352)", doi="10.3847/1538-3881/abd806")
    raise ValueError(kind)


def process_image(src: Path, meta: dict, crop: dict | None, out: Path) -> dict:
    im = Image.open(src).convert("RGB")
    W, H = im.size
    fov_w, fov_h = meta["fov"]
    if crop:
        cx, cy = sky_to_pixel(meta, W, H, crop["ra"], crop["dec"])
        s = fov_w / W
        w_px, h_px = crop["w"] / s, crop["h"] / s
        x0 = min(max(0.0, cx - w_px / 2), W - w_px)
        y0 = min(max(0.0, cy - h_px / 2), H - h_px)
        box = (int(round(x0)), int(round(y0)), int(round(x0 + w_px)), int(round(y0 + h_px)))
        im = im.crop(box)
        ccx, ccy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        cra, cdec = pixel_to_sky(meta, W, H, ccx, ccy)
        fov_w, fov_h = (box[2] - box[0]) * s, (box[3] - box[1]) * s
    else:
        cra, cdec = meta["ra"], meta["dec"]
    scale = min(1.0, MAX_PX / max(im.size))
    im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    # Black level: subtract the 2nd percentile per channel so empty sky adds (almost) nothing.
    floor = np.percentile(a.reshape(-1, 3), 2, axis=0)
    a = np.clip((a - floor) / np.maximum(1e-3, 1 - floor), 0, 1)
    # Fade the outer EDGE_FADE of each side to black so the billboard has no visible border.
    h, w = a.shape[:2]
    def taper(n: int) -> np.ndarray:
        x = (np.arange(n) + 0.5) / n
        e = np.clip(np.minimum(x, 1 - x) / EDGE_FADE, 0, 1)
        return e * e * (3 - 2 * e)
    a *= (taper(h)[:, None] * taper(w)[None, :])[..., None]
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(out, "JPEG", quality=JPEG_Q, optimize=True)
    return dict(centerRaDeg=round(cra, 5), centerDecDeg=round(cdec, 5), widthArcmin=round(fov_w, 3), heightArcmin=round(fov_h, 3),
                northAngleDeg=meta["north"], pixels=[w, h], bytes=out.stat().st_size, blackLevel=[round(float(x), 4) for x in floor])


def galactic_xyz(ra: float, dec: float, d_pc: float) -> list[float]:
    a, d = math.radians(ra), math.radians(dec)
    v = np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])
    g = A_G @ v
    return [round(float(x) * d_pc, 2) for x in g]


def main() -> None:
    hr = hr24_distances()
    rows = []
    for o in OBJECTS:
        meta = page_meta(o["site"], o["img"])
        size = o.get("size", "screen")
        url = meta["downloads"].get(size) or meta["downloads"].get("screen")
        src = fetch(url, RAW / f"{o['img']}_{size}.jpg")
        bb = process_image(src, meta, o.get("crop"), OUT_IMG / f"{o['id']}.jpg")
        dist = distance(o["dist"], hr)
        d = dist["pc"]
        sra, sdec, sdim = SIMBAD[o["simbad"]]
        ang = lambda arcmin: round(2 * d * math.tan(math.radians(arcmin / 60) / 2), 3)
        l_b = A_G @ np.array([math.cos(math.radians(sdec)) * math.cos(math.radians(sra)), math.cos(math.radians(sdec)) * math.sin(math.radians(sra)), math.sin(math.radians(sdec))])
        rows.append(dict(
            id=o["id"], name=o["name"], otherNames=o["alt"], kind=o["kind"], parent=o.get("parent"),
            position=dict(raDeg=sra, decDeg=sdec, lDeg=round(math.degrees(math.atan2(l_b[1], l_b[0])) % 360, 4), bDeg=round(math.degrees(math.asin(l_b[2])), 4),
                          source=f"SIMBAD ({o['simbad']})"),
            distance=dist,
            helioGalacticPc=galactic_xyz(sra, sdec, d),
            catalogueSizeArcmin=sdim, catalogueSizePc=ang(sdim) if sdim else None,
            billboard=dict(image=f"images/nebulae/{o['id']}.jpg", **bb, widthPc=ang(bb["widthArcmin"]), heightPc=ang(bb["heightArcmin"]),
                           helioGalacticPc=galactic_xyz(bb["centerRaDeg"], bb["centerDecDeg"], d)),
            imageSource=dict(archive={"hubble": "ESA/Hubble", "webb": "ESA/Webb", "eso": "ESO", "noirlab": "NSF NOIRLab"}[o["site"]], id=o["img"], title=meta["title"],
                             page=meta["url"], file=url, band=o.get("band", "visible"), cropped=bool(o.get("crop")),
                             fullFrame=dict(centerRaDeg=round(meta["ra"], 5), centerDecDeg=round(meta["dec"], 5), fovArcmin=meta["fov"], northAngleDeg=meta["north"])),
            credit=meta["credit"], licence="CC BY 4.0",
            modificationNote=("Image modified for Lightspeed: " + ("cropped, " if o.get("crop") else "") +
                              "resized, black level subtracted and edges faded (see imageProcessing)."),
            blurb=o["blurb"],
        ))
        print(f"{o['id']:26s} {o['img']:20s} d={d:>8.0f} pc  billboard {bb['widthArcmin']:.1f}' = {rows[-1]['billboard']['widthPc']:.2f} pc  {bb['pixels']} {bb['bytes']//1024} KB")
    doc = dict(
        schema="lightspeed.nebulae/1",
        note="Positions: SIMBAD (ICRS). billboard.center* is the centre of the shipped image (after any crop), which is where the billboard should be placed; its width/height in pc follow from the image's field of view and the adopted distance. northAngleDeg: north on the image is this many degrees counterclockwise from image-up (negative = clockwise); east is 90 deg counterclockwise from north (standard sky orientation, not mirrored). helioGalacticPc: heliocentric galactic Cartesian (x -> l = 0, y -> l = 90, z -> NGP).",
        imageProcessing=f"Downloaded from the archive page, cropped where noted, resized so the longer side is at most {MAX_PX} px (Lanczos), the 2nd-percentile black level subtracted per channel, the outer {int(EDGE_FADE*100)}% of each side faded to black with a smoothstep, saved as sRGB JPEG (quality {JPEG_Q}). Intended for additive blending.",
        licence="Every image is CC BY 4.0 (ESA/Hubble, ESA/Webb, ESO, NSF NOIRLab). Wherever an image is shown, show its 'credit' string unaltered, followed by its 'modificationNote' (CC BY 4.0 section 3(a)(1)(B) requires saying that the image was modified), with a link to 'imageSource.page' and to the licence, https://creativecommons.org/licenses/by/4.0/.",
        objects=rows,
    )
    OUT_JSON.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf8", newline="\n")
    total = sum(r["billboard"]["bytes"] for r in rows)
    print(f"{len(rows)} objects, images {total/1e6:.2f} MB total")


if __name__ == "__main__":
    main()
