// Builds public/textures/<id>.jpg: equirectangular surface maps of moons, dwarf planets and
// asteroids, made only from mosaics whose licence allows redistribution (USGS Astrogeology and
// NASA products, all public domain). Sources, credits and conventions are listed in MAPS below
// and in staging/phase2/assets.md.
//
// Output convention, identical for every map:
//   simple cylindrical (equirectangular) projection, planetocentric latitude +90° in the top row
//   to −90° in the bottom row; EAST longitude increasing to the right with the prime meridian
//   (0°) at the image centre. Column i covers east longitude [−180 + 360·i/W, −180 + 360·(i+1)/W).
//   In the IAU body-fixed frame (+x at 0°N 0°E, +y at 0°N 90°E, +z at the north pole) a texel
//   at (lat, lon) sits at (cos lat cos lon, cos lat sin lon, sin lat).
//
// How the big USGS mosaics are read: they are 30–350 MB uncompressed GeoTIFFs with one image row
// per strip. Rather than downloading them whole, the script reads the TIFF directory with an HTTP
// range request, then fetches ROWS_PER_BAND source rows per output row (spread evenly through the
// band of source rows that output row covers) and box-averages each of those rows horizontally at
// full resolution. The reduced raster (with a coverage channel) is cached in data-raw/d3/maps/, so
// a second run downloads nothing. Delete a cached *.reduced.png to fetch that map again.
//
// Unimaged areas: USGS mosaics store "no data" as 0. Output texels that are partly or wholly
// unimaged are blended towards a flat fill equal to the mean of the imaged surface (weighted by
// area), so partial maps (Charon, Triton, the Uranian moons) show a neutral, albedo-matched tone
// where no spacecraft has looked. The imaged fraction of each map is reported.
//
// Requires sharp (JPEG/PNG/TIFF codec). It is not a project dependency: install it anywhere and
// point LIGHTSPEED_TOOLS at that folder, e.g.
//   npm install --prefix ../lightspeed-tools sharp
//   LIGHTSPEED_TOOLS=../lightspeed-tools node scripts/build-textures.mjs [id ...]
// Pass --check to also write annotated preview sheets (nomenclature overlay) to data-raw/d3/check/.

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'd3', 'maps');
const OUT = join(ROOT, 'public', 'textures');
const ROWS_PER_BAND = 3;
const CONCURRENCY = 8;
const JPEG_QUALITY = 85;

const USGS = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic';
const NASA3D = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images%20and%20Textures';

// ─── The maps ───────────────────────────────────────────────────────────────────────────────
//
// src.kind:
//   'usgs-tiff'  striped uncompressed GeoTIFF on the USGS server; geometry from its PDS3 label
//   'zip-tiff'   a GeoTIFF inside a zip on the USGS server (read by range, inflated in memory)
//   'wms'        USGS planetary WMS GetMap (EPSG:4326, −180..180)
//   'url-tiff'   a small TIFF fetched whole (NASA 3D Resources)
// Geometry: centerLonEast = east longitude at continuous source x = xCenter (pixels from the left
// edge); east longitude increases to the right in every source used here (checked per map by
// overlaying IAU nomenclature, see --check).

export const MAPS = [
  {
    id: 'io',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km' },
    title: 'Io Galileo SSI / Voyager Color Merged Global Mosaic 1km',
    page: 'https://astrogeology.usgs.gov/search/map/io_voyager_galileo_ssi_global_mosaic_1km',
    credit: 'NASA/JPL-Caltech/USGS Astrogeology Science Center (Galileo SSI and Voyager 1/2 data)',
    colour: 'Colour from Galileo SSI violet, green and near-infrared (756 nm) images merged onto the 1 km mosaic; close to, but a little more saturated than, natural colour.',
  },
  {
    id: 'europa',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Europa_Voyager_GalileoSSI_global_mosaic_500m' },
    title: 'Europa Voyager - Galileo SSI Global Mosaic 500m',
    page: 'https://astrogeology.usgs.gov/search/map/Europa/Voyager-Galileo/Europa_Voyager_GalileoSSI_global_mosaic_500m',
    credit: 'NASA/JPL-Caltech/USGS Astrogeology Science Center (Galileo SSI and Voyager data)',
    colour: 'Greyscale (clear/green-filter albedo). Tint with the body colour if wanted.',
  },
  {
    id: 'ganymede',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m' },
    title: 'Ganymede Voyager - Galileo SSI Global Color Mosaic 1.4km',
    page: 'https://astrogeology.usgs.gov/search/map/Ganymede/Voyager-Galileo/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m',
    credit: 'NASA/JPL-Caltech/USGS Astrogeology Science Center (Galileo SSI and Voyager data)',
    colour: 'Colour from Voyager and Galileo filter images; enhanced relative to natural colour.',
  },
  {
    id: 'callisto',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Callisto_Voyager_GalileoSSI_global_mosaic_1km' },
    title: 'Callisto Voyager - Galileo SSI Global Mosaic 1km',
    page: 'https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km',
    credit: 'NASA/JPL-Caltech/USGS Astrogeology Science Center (Galileo SSI and Voyager data)',
    colour: 'Greyscale.',
  },
  {
    id: 'mimas',
    size: [1024, 512],
    src: {
      kind: 'zip-tiff',
      url: `${USGS}/Mimas/Cassini_DLR_Mimas.zip`,
      entry: 'Cassini_DLR/MI_170630_DLR_basemap.tif',
      centerLonEast: 0,
    },
    title: 'Mimas Cassini ISS Global Mosaic (DLR, 30 June 2017), 216 m/pixel',
    page: 'https://astrogeology.usgs.gov/search/map/mimas_cassini_global_mosaic_216m',
    credit: 'NASA/JPL-Caltech/Space Science Institute/DLR (mosaic by T. Roatsch, DLR); hosted by USGS Astrogeology',
    colour: 'Greyscale (Cassini ISS clear filter).',
  },
  {
    id: 'enceladus',
    size: [1024, 512],
    src: { kind: 'usgs-tiff', product: 'Enceladus_Cassini_mosaic_global_110m' },
    title: 'Enceladus Cassini Global Mosaic 110m',
    page: 'https://astrogeology.usgs.gov/search/map/enceladus_cassini_global_mosaic_110m',
    credit: 'NASA/JPL-Caltech/Space Science Institute/DLR; hosted by USGS Astrogeology',
    colour: 'Greyscale (Cassini ISS clear filter).',
  },
  {
    id: 'tethys',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Tethys_Cassini_mosaic_global_293m' },
    title: 'Tethys Cassini Global Mosaic 293m',
    page: 'https://astrogeology.usgs.gov/search/map/tethys_cassini_global_mosaic_293m',
    credit: 'NASA/JPL-Caltech/Space Science Institute/DLR; hosted by USGS Astrogeology',
    colour: 'Greyscale.',
  },
  {
    id: 'dione',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Dione_Cassini_Voyager_mosaic_global_154m' },
    title: 'Dione Cassini - Voyager Global Mosaic 154m',
    page: 'https://astrogeology.usgs.gov/search/map/dione_cassini_voyager_global_mosaic_154m',
    credit: 'NASA/JPL-Caltech/Space Science Institute/DLR (Cassini and Voyager data); hosted by USGS Astrogeology',
    colour: 'Greyscale.',
  },
  {
    id: 'rhea',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Rhea_Cassini_Voyager_mosaic_global_417m' },
    title: 'Rhea Cassini - Voyager Global Mosaic 417m',
    page: 'https://astrogeology.usgs.gov/search/map/rhea_cassini_voyager_global_mosaic_417m',
    credit: 'NASA/JPL-Caltech/Space Science Institute/DLR (Cassini and Voyager data); hosted by USGS Astrogeology',
    colour: 'Greyscale.',
  },
  {
    id: 'iapetus',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Iapetus_Cassini_Voyager_mosaic_global_783m' },
    title: 'Iapetus Cassini - Voyager Global Mosaic 783m',
    page: 'https://astrogeology.usgs.gov/search/map/iapetus_cassini_voyager_global_mosaic_803m',
    credit: 'NASA/JPL-Caltech/Space Science Institute/DLR (Cassini and Voyager data); hosted by USGS Astrogeology',
    colour: 'Greyscale. The two-tone leading/trailing hemispheres are real albedo.',
  },
  {
    id: 'titan',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Titan_ISS_P19658_Mosaic_Global_4km' },
    title: 'Titan Cassini ISS Global Mosaic 4km',
    page: 'https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4km',
    credit: 'NASA/JPL-Caltech/Space Science Institute; hosted by USGS Astrogeology',
    colour:
      'Greyscale surface albedo at 938 nm (near-infrared), seen through the haze. In visible light Titan is a featureless orange haze ball: render the haze colour and treat this map as the view through it.',
  },
  {
    id: 'triton',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Triton_Voyager2_ClrMosaic_GlobalFill_600m' },
    title: 'Triton Voyager 2 Global Color Mosaic 600m',
    page: 'https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m',
    credit: 'NASA/JPL-Caltech/Lunar and Planetary Institute (P. Schenk); hosted by USGS Astrogeology',
    colour:
      'Orange, violet and ultraviolet Voyager 2 filters shown as red, green and blue: enhanced colour, a close approximation to natural colour. Voyager 2 saw only the southern hemisphere and a band north of the equator; the north was in darkness.',
  },
  {
    id: 'charon',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit' },
    title: 'Charon New Horizons Global Mosaic 300m (July 2017)',
    page: 'https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m',
    credit: 'NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute/Lunar and Planetary Institute; hosted by USGS Astrogeology',
    colour: 'Greyscale (LORRI and MVIC panchromatic). The far southern hemisphere was in polar night during the 2015 flyby.',
  },
  {
    id: 'ceres',
    size: [2048, 1024],
    src: { kind: 'usgs-tiff', product: 'Ceres_Dawn_FC_DLR_global_20ppd_Oct2015' },
    title: 'Ceres Dawn FC Global Mosaic 400m (DLR, October 2015)',
    page: 'https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_400m',
    credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (Dawn Framing Camera; mosaic by DLR); hosted by USGS Astrogeology',
    colour: 'Greyscale (Framing Camera clear filter).',
  },
  {
    id: 'vesta',
    size: [1024, 512],
    src: { kind: 'usgs-tiff', product: 'Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd' },
    title: 'Vesta Dawn FC HAMO Global Mosaic 60m (DLR, 2013)',
    page: 'https://astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_mosaic_60m',
    credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (Dawn Framing Camera; mosaic by DLR); hosted by USGS Astrogeology',
    colour: 'Greyscale. Longitudes are in the IAU "Claudia double-prime" system (crater Claudia at 146° E).',
  },
  {
    id: 'phobos',
    size: [1024, 512],
    src: { kind: 'usgs-tiff', product: 'Phobos_ME_SRC_Mosaic_Global_16ppd' },
    title: 'Phobos Mars Express SRC Global Mosaic 12m (16 pixels/degree)',
    page: 'https://astrogeology.usgs.gov/search/map/phobos_mars_express_src_global_mosaic_12m',
    credit: 'ESA/DLR/FU Berlin (Mars Express HRSC Super Resolution Channel; mosaic by K.-D. Matz/DLR); hosted by USGS Astrogeology',
    colour: 'Greyscale.',
  },
  {
    id: 'deimos',
    size: [1024, 512],
    src: {
      kind: 'wms',
      url: 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/deimos_simp_cyl.map',
      layer: 'VIKING',
      fetchSize: [2048, 1024],
    },
    title: 'Deimos Global Mosaic (Viking Orbiter), P. Stooke 2001',
    page: 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/deimos_simp_cyl.map&request=GetCapabilities&service=WMS',
    credit: 'NASA/JPL (Viking Orbiter images); map by Philip Stooke (University of Western Ontario) with C. Jongkind and M. Arntz, control by P. Thomas (Cornell); served by USGS Astrogeology',
    colour: 'Greyscale.',
  },
  ...['miranda', 'ariel', 'umbriel', 'titania', 'oberon'].map((id) => ({
    id,
    size: [1024, 512],
    src: {
      kind: 'url-tiff',
      url: `${NASA3D}/Uranus%20-%20${id[0].toUpperCase()}${id.slice(1)}/Uranus%20-%20${id[0].toUpperCase()}${id.slice(1)}.tif`,
      // Checked against IAU feature positions (Arden and Elsinore Coronae on Miranda, Wunda on
      // Umbriel, Hamlet and Othello on Oberon): 0° E at the image centre, east to the right.
      centerLonEast: 0,
      nullMax: 15,
    },
    title: `${id[0].toUpperCase()}${id.slice(1)} Voyager 2 global map (NASA 3D Resources)`,
    page: `https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures/Uranus%20-%20${id[0].toUpperCase()}${id.slice(1)}`,
    credit: 'NASA/JPL (Voyager 2 images, USGS-controlled mosaic); distributed by NASA 3D Resources',
    colour:
      'Greyscale. Voyager 2 flew past in January 1986, when Uranus’s south pole faced the Sun: only the southern hemisphere was lit and imaged. The source is 1440 × 720, so this map stays at 1024 × 512.',
  })),
];

// ─── Small utilities ────────────────────────────────────────────────────────────────────────

function loadSharp() {
  const dirs = [process.env.LIGHTSPEED_TOOLS, ROOT].filter(Boolean);
  for (const d of dirs) {
    try {
      return createRequire(join(resolve(d), 'noop.js'))('sharp');
    } catch {
      /* try the next folder */
    }
  }
  throw new Error('sharp not found. npm install --prefix <folder> sharp, then set LIGHTSPEED_TOOLS=<folder>.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, range) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: range ? { Range: `bytes=${range[0]}-${range[1]}` } : {} });
      if (res.status === 503 || res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      if (range && res.status !== 206) throw Object.assign(new Error(`server ignored Range for ${url}`), { fatal: true });
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e.fatal || attempt >= 5) throw e;
      await sleep(500 * 2 ** attempt);
    }
  }
}

async function cachedGet(url, file) {
  if (existsSync(file)) return readFileSync(file);
  const buf = await httpGet(url);
  writeFileSync(file, buf);
  return buf;
}

async function pool(items, n, fn) {
  let next = 0;
  const workers = Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** Parse a PDS3 label (KEY = VALUE lines) into a flat object of the keys we need. */
function parsePds3(text) {
  const out = {};
  for (const m of text.matchAll(/^\s*([A-Z_0-9]+)\s*=\s*("?)([^"\r\n<]*)/gm)) {
    if (!(m[1] in out)) out[m[1]] = m[3].trim();
  }
  return out;
}

/** Minimal classic-TIFF directory reader (little-endian). Returns tags as arrays of numbers. */
function readTiffDir(buf, base = 0) {
  if (buf.toString('latin1', 0, 2) !== 'II') throw new Error('only little-endian TIFF supported');
  const magic = buf.readUInt16LE(2);
  if (magic !== 42) throw new Error(`not a classic TIFF (magic ${magic})`);
  const ifd = buf.readUInt32LE(4) - base;
  const n = buf.readUInt16LE(ifd);
  const tags = {};
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    const tag = buf.readUInt16LE(e);
    const type = buf.readUInt16LE(e + 2);
    const count = buf.readUInt32LE(e + 4);
    const bytes = (size[type] ?? 1) * count;
    const at = bytes <= 4 ? e + 8 : buf.readUInt32LE(e + 8) - base;
    tags[tag] = { type, count, at, bytes };
  }
  return tags;
}

function tagValues(buf, t) {
  if (!t) return undefined;
  if (t.at + t.bytes > buf.length) return null; // outside the fetched header
  const v = [];
  for (let i = 0; i < t.count; i++) {
    if (t.type === 3) v.push(buf.readUInt16LE(t.at + 2 * i));
    else if (t.type === 4) v.push(buf.readUInt32LE(t.at + 4 * i));
    else if (t.type === 12) v.push(buf.readDoubleLE(t.at + 8 * i));
    else if (t.type === 1 || t.type === 2) v.push(buf[t.at + i]);
    else throw new Error(`TIFF tag type ${t.type} not handled`);
  }
  return v;
}

// ─── Source readers: each returns { W, H, bands, centerLonEast, xCenter, getRow(band,row) } ──

async function openUsgsTiff(spec) {
  const base = `${USGS}/${spec.product}`;
  const label = parsePds3((await cachedGet(`${base}_pds3.lbl`, join(RAW, `${spec.product}_pds3.lbl`))).toString('latin1'));
  const dirFile = join(RAW, `${spec.product}.tiffdir.json`);
  let dir;
  if (existsSync(dirFile)) dir = JSON.parse(readFileSync(dirFile, 'utf8'));
  else {
    const head = await httpGet(`${base}.tif`, [0, 65535]);
    const tags = readTiffDir(head);
    const W = tagValues(head, tags[256])[0];
    const H = tagValues(head, tags[257])[0];
    const bands = tagValues(head, tags[277])?.[0] ?? 1;
    const bits = tagValues(head, tags[258])[0];
    const compression = tagValues(head, tags[259])[0];
    const planar = tagValues(head, tags[284])?.[0] ?? 1;
    const rps = tagValues(head, tags[278])[0];
    if (bits !== 8 || compression !== 1 || (bands > 1 && planar !== 2)) {
      throw new Error(`${spec.product}: expected 8-bit uncompressed planar strips; got bits ${bits} comp ${compression} planar ${planar}`);
    }
    const t = tags[273];
    let offsets = tagValues(head, t);
    if (offsets === null) {
      const buf = await httpGet(`${base}.tif`, [t.at, t.at + t.bytes - 1]);
      offsets = [];
      for (let i = 0; i < t.count; i++) offsets.push(t.type === 3 ? buf.readUInt16LE(2 * i) : buf.readUInt32LE(4 * i));
    }
    dir = { W, H, bands, rowsPerStrip: rps, offsets };
    writeFileSync(dirFile, JSON.stringify(dir));
  }
  const W = Number(label.LINE_SAMPLES);
  const H = Number(label.LINES);
  if (W !== dir.W || H !== dir.H) throw new Error(`${spec.product}: label ${W}x${H} vs TIFF ${dir.W}x${dir.H}`);
  const east = label.POSITIVE_LONGITUDE_DIRECTION === 'EAST';
  const clon = Number(label.CENTER_LONGITUDE);
  return {
    W,
    H,
    bands: dir.bands,
    centerLonEast: east ? clon : -clon,
    // Continuous x of the centre meridian (ISIS labels give it as |offset| + 0.5, to within a pixel).
    xCenter: Math.abs(Number(label.SAMPLE_PROJECTION_OFFSET)) + 0.5,
    url: `${base}.tif`,
    label,
    getRow: (band, row) => {
      // Strips hold rowsPerStrip whole rows; bands are stored one after another (planar).
      const rps = dir.rowsPerStrip;
      const strip = band * Math.ceil(H / rps) + Math.floor(row / rps);
      const at = dir.offsets[strip] + (row % rps) * W;
      return httpGet(`${base}.tif`, [at, at + W - 1]);
    },
  };
}

async function decodeToRaster(sharp, buf) {
  const { data, info } = await sharp(buf, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
  const bands = info.channels >= 3 ? 3 : 1;
  const plane = (b) => {
    const p = Buffer.alloc(info.width * info.height);
    for (let i = 0, j = b; i < p.length; i++, j += info.channels) p[i] = data[j];
    return p;
  };
  const planes = Array.from({ length: bands }, (_, b) => plane(b));
  return { W: info.width, H: info.height, bands, planes };
}

function inMemorySource(r, centerLonEast, xCenter) {
  return {
    ...r,
    centerLonEast,
    xCenter,
    getRow: async (band, row) => r.planes[band].subarray(row * r.W, (row + 1) * r.W),
  };
}

async function openZipTiff(sharp, spec) {
  // Read the zip's central directory from its tail, then only the one entry we need.
  const headRes = await fetch(spec.url, { method: 'HEAD' });
  const len = Number(headRes.headers.get('content-length'));
  const end = await httpGet(spec.url, [len - 65536, len - 1]);
  const eocd = end.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdSize = end.readUInt32LE(eocd + 12);
  const cdOff = end.readUInt32LE(eocd + 16);
  const cd = end.subarray(cdOff - (len - 65536), cdOff - (len - 65536) + cdSize);
  let p = 0;
  let entry;
  while (p < cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10);
    const csize = cd.readUInt32LE(p + 20);
    const nlen = cd.readUInt16LE(p + 28);
    const elen = cd.readUInt16LE(p + 30);
    const clen = cd.readUInt16LE(p + 32);
    const lho = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nlen);
    if (name === spec.entry) entry = { method, csize, lho };
    p += 46 + nlen + elen + clen;
  }
  if (!entry) throw new Error(`${spec.entry} not in ${spec.url}`);
  const lh = await httpGet(spec.url, [entry.lho, entry.lho + 29]);
  const start = entry.lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const comp = await httpGet(spec.url, [start, start + entry.csize - 1]);
  const tif = entry.method === 8 ? inflateRawSync(comp) : comp;
  const r = await decodeToRaster(sharp, tif);
  // GeoTIFF tie point: x of the left edge in metres; with the pixel scale that gives the centre.
  const tags = readTiffDir(tif);
  const scale = tagValues(tif, tags[33550]);
  const tie = tagValues(tif, tags[33922]);
  const xCenter = -tie[3] / scale[0];
  return inMemorySource(r, spec.centerLonEast, xCenter);
}

async function openWms(sharp, spec) {
  const [w, h] = spec.fetchSize;
  const mapName = new URL(spec.url).searchParams.get('map').split('/').pop().replace('.map', '');
  const file = join(RAW, `wms_${mapName}_${spec.layer}_${w}x${h}.png`);
  const url = `${spec.url}&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${spec.layer}&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/png`;
  const r = await decodeToRaster(sharp, await cachedGet(url, file));
  return inMemorySource(r, 0, r.W / 2);
}

async function openUrlTiff(sharp, spec, id) {
  const r = await decodeToRaster(sharp, await cachedGet(spec.url, join(RAW, `${id}_nasa3d.tif`)));
  // These maps were made from JPEG-era sources: near-black speckle along the terminator is
  // treated as unimaged too.
  return { ...inMemorySource(r, spec.centerLonEast, r.W / 2), nullMax: spec.nullMax ?? 0 };
}

// ─── Reduction: area-average the source onto the output grid ───────────────────────────────

async function reduce(src, Wo, Ho, rowsPerBand) {
  const { W, H, bands } = src;
  const nullMax = src.nullMax ?? 0; // values <= nullMax count as unimaged
  const acc = Array.from({ length: bands }, () => new Float64Array(Wo * Ho));
  const wacc = new Float64Array(Wo * Ho); // imaged (non-null) weight
  const tot = new Float64Array(Wo * Ho); // total weight
  // Column integration limits for each output column, in continuous source x (may wrap).
  const scale = W / 360;
  const xs = new Float64Array(Wo + 1);
  for (let i = 0; i <= Wo; i++) {
    const lon = -180 + (360 * i) / Wo;
    let x = src.xCenter + (lon - src.centerLonEast) * scale;
    x = ((x % W) + W) % W;
    xs[i] = x;
  }
  const jobs = [];
  for (let j = 0; j < Ho; j++) {
    const y0 = (j * H) / Ho;
    const y1 = ((j + 1) * H) / Ho;
    const k = Math.min(rowsPerBand, Math.max(1, Math.round(y1 - y0)));
    const rows = new Set();
    for (let s = 0; s < k; s++) rows.add(Math.min(H - 1, Math.floor(y0 + ((s + 0.5) * (y1 - y0)) / k)));
    for (const r of rows) jobs.push([j, r]);
  }
  let done = 0;
  await pool(jobs, src.planes ? 1 : CONCURRENCY, async ([j, r]) => {
    const rowsData = [];
    for (let b = 0; b < bands; b++) rowsData.push(await src.getRow(b, r));
    // Prefix sums of value*valid and valid along the row (synchronous: safe to share buffers).
    const pv = Array.from({ length: bands }, () => new Float64Array(W + 1));
    const pw = new Float64Array(W + 1);
    for (let c = 0; c < W; c++) {
      let valid = 0;
      for (let b = 0; b < bands; b++) if (rowsData[b][c] > nullMax) valid = 1;
      pw[c + 1] = pw[c] + valid;
      for (let b = 0; b < bands; b++) pv[b][c + 1] = pv[b][c] + valid * rowsData[b][c];
    }
    const integ = (P, vals, x) => {
      const f = Math.floor(x);
      if (f >= W) return P[W];
      return P[f] + (x - f) * vals(f);
    };
    const span = (P, vals, a, b) => (b >= a ? integ(P, vals, b) - integ(P, vals, a) : P[W] - integ(P, vals, a) + integ(P, vals, b));
    const validAt = (c) => pw[c + 1] - pw[c];
    for (let i = 0; i < Wo; i++) {
      const a = xs[i];
      const b = xs[i + 1] === 0 ? W : xs[i + 1];
      const o = j * Wo + i;
      const width = b >= a ? b - a : W - a + b;
      tot[o] += width;
      wacc[o] += span(pw, validAt, a, b);
      for (let q = 0; q < bands; q++) acc[q][o] += span(pv[q], (c) => pv[q][c + 1] - pv[q][c], a, b);
    }
    done++;
    if (!src.planes && done % 500 === 0) process.stdout.write(`\r    ${done}/${jobs.length} rows`);
  });
  if (!src.planes) process.stdout.write(`\r    ${jobs.length}/${jobs.length} rows\n`);
  return { acc, wacc, tot, bands };
}

/** Pack a reduction into an 8-bit raster with a coverage channel (for the cache). */
function packReduced({ acc, wacc, tot, bands }, Wo, Ho) {
  const ch = bands + 1;
  const out = Buffer.alloc(Wo * Ho * ch);
  for (let o = 0; o < Wo * Ho; o++) {
    for (let b = 0; b < bands; b++) out[o * ch + b] = wacc[o] > 0 ? Math.round(acc[b][o] / wacc[o]) : 0;
    out[o * ch + bands] = Math.round((255 * wacc[o]) / tot[o]);
  }
  return { data: out, channels: ch };
}

/** Fill unimaged texels with the area-weighted mean of fully imaged ones. */
function fillAndFlatten(data, channels, Wo, Ho) {
  const bands = channels - 1;
  const mean = new Float64Array(bands);
  let wsum = 0;
  let cover = 0;
  let area = 0;
  for (let j = 0; j < Ho; j++) {
    const w = Math.cos(((90 - ((j + 0.5) * 180) / Ho) * Math.PI) / 180);
    for (let i = 0; i < Wo; i++) {
      const o = (j * Wo + i) * channels;
      const f = data[o + bands] / 255;
      cover += w * f;
      area += w;
      if (f > 0.99) {
        for (let b = 0; b < bands; b++) mean[b] += w * data[o + b];
        wsum += w;
      }
    }
  }
  for (let b = 0; b < bands; b++) mean[b] /= wsum;
  const out = Buffer.alloc(Wo * Ho * bands);
  for (let o = 0; o < Wo * Ho; o++) {
    const f = data[o * channels + bands] / 255;
    for (let b = 0; b < bands; b++) out[o * bands + b] = Math.round(f * data[o * channels + b] + (1 - f) * mean[b]);
  }
  return { pixels: out, bands, fill: Array.from(mean, (v) => Math.round(v)), imagedFraction: cover / area };
}

// ─── Main ───────────────────────────────────────────────────────────────────────────────────

async function build(sharp, map) {
  const [Wo, Ho] = map.size;
  const cache = join(RAW, `${map.id}.reduced.${Wo}x${Ho}.png`);
  let data;
  let channels;
  if (existsSync(cache)) {
    const r = await sharp(cache).raw().toBuffer({ resolveWithObject: true });
    data = r.data;
    channels = r.info.channels;
  } else {
    const s = map.src;
    const src =
      s.kind === 'usgs-tiff'
        ? await openUsgsTiff(s)
        : s.kind === 'zip-tiff'
          ? await openZipTiff(sharp, s)
          : s.kind === 'wms'
            ? await openWms(sharp, s)
            : await openUrlTiff(sharp, s, map.id);
    console.log(`  source ${src.W} x ${src.H}, ${src.bands} band(s), centre lon ${src.centerLonEast}° E at x = ${src.xCenter.toFixed(2)}`);
    const red = await reduce(src, Wo, Ho, s.kind === 'usgs-tiff' ? ROWS_PER_BAND : Infinity);
    ({ data, channels } = packReduced(red, Wo, Ho));
    await sharp(data, { raw: { width: Wo, height: Ho, channels } }).png({ compressionLevel: 9 }).toFile(cache);
  }
  let { pixels, bands, fill, imagedFraction } = fillAndFlatten(data, channels, Wo, Ho);
  // Some decoders hand a greyscale source back as three equal channels: store those as grey.
  if (bands === 3) {
    let grey = true;
    for (let o = 0; o < pixels.length && grey; o += 3) grey = pixels[o] === pixels[o + 1] && pixels[o] === pixels[o + 2];
    if (grey) {
      const g = Buffer.alloc(Wo * Ho);
      for (let o = 0; o < g.length; o++) g[o] = pixels[3 * o];
      pixels = g;
      bands = 1;
      fill = fill.slice(0, 1);
    }
  }
  const file = join(OUT, `${map.id}.jpg`);
  await sharp(pixels, { raw: { width: Wo, height: Ho, channels: bands } })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toFile(file);
  const bytes = statSync(file).size;
  return { id: map.id, file: `public/textures/${map.id}.jpg`, width: Wo, height: Ho, bands, bytes, fill, imagedFraction };
}

async function main() {
  const sharp = loadSharp();
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const map of MAPS) {
    if (ids.length && !ids.includes(map.id)) continue;
    console.log(`${map.id}: ${map.title}`);
    const r = await build(sharp, map);
    console.log(`  -> ${r.file} ${r.width}x${r.height} ${r.bands === 1 ? 'grey' : 'RGB'} ${(r.bytes / 1024).toFixed(0)} KB, imaged ${(100 * r.imagedFraction).toFixed(1)}%, fill ${r.fill}`);
    report.push(r);
  }
  const reportFile = join(RAW, 'textures-report.json');
  const old = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : [];
  const merged = [...old.filter((o) => !report.some((r) => r.id === o.id)), ...report];
  writeFileSync(reportFile, JSON.stringify(merged, null, 1));
  const total = merged.reduce((s, r) => s + r.bytes, 0);
  console.log(`total ${(total / 1048576).toFixed(2)} MB in ${merged.length} maps`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
