// data/simData.js
// Generate simulated precision-farming layers over a real place (sat imagery background).
// The bounding box is set over agricultural land near San Fernando, Chile.

import * as turf from "@turf/turf";

export function generateSimData() {
  // Bounding box around farmland in O'Higgins Region, Chile (approx.)
  const bbox = [-71.089, -34.665, -70.93, -34.56]; // [minX, minY, maxX, maxY]
  const center = { lat: -34.610, lng: -71.01 };
  const zoom = 14;

  // Grid resolution (cells). Keep moderate for performance.
  const cols = 50;
  const rows = 40;

  // Build the grid polygons once
  const dx = (bbox[2] - bbox[0]) / cols;
  const dy = (bbox[3] - bbox[1]) / rows;

  const gridPolys = [];
  const cellCenters = []; // for quick point-in-polygon checks
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const minX = bbox[0] + c*dx;
      const minY = bbox[1] + r*dy;
      const maxX = minX + dx;
      const maxY = minY + dy;
      const poly = turf.polygon([[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]], { r, c });
      gridPolys.push(poly);
      const centroid = [(minX+maxX)/2, (minY+maxY)/2];
      cellCenters.push(centroid);
    }
  }

  // --- Random surfaces with spatial coherence (coarse -> bilinear upsample) ---
  function seededRand(seed) {
    // xorshift32
    let x = seed >>> 0;
    return function() {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return ((x >>> 0) / 4294967296);
    };
  }

  function makeCoarse(width, height, seed) {
    const rnd = seededRand(seed);
    const arr = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) row.push(rnd());
      arr.push(row);
    }
    return arr;
  }

  function bilinearSample(arr, u, v) {
    // arr size: HxW, u,v in [0,1]
    const H = arr.length, W = arr[0].length;
    const x = u*(W-1), y = v*(H-1);
    const x0 = Math.floor(x), x1 = Math.min(W-1, x0+1);
    const y0 = Math.floor(y), y1 = Math.min(H-1, y0+1);
    const fx = x - x0, fy = y - y0;
    const v00 = arr[y0][x0], v10 = arr[y0][x1], v01 = arr[y1][x0], v11 = arr[y1][x1];
    const a = v00*(1-fx) + v10*fx;
    const b = v01*(1-fx) + v11*fx;
    return a*(1-fy) + b*fy;
  }

  function makeSurface(cols, rows, seed, opts={}) {
    const coarse = makeCoarse(8, 6, seed);
    const coarse2 = makeCoarse(16, 12, seed*1664525 + 1013904223);
    const data = new Array(rows).fill(0).map(()=>new Array(cols).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = c/(cols-1);
        const v = r/(rows-1);
        // two-octave fractal-ish noise
        const n1 = bilinearSample(coarse, u, v);
        const n2 = bilinearSample(coarse2, u, v);
        let n = 0.65*n1 + 0.35*n2;
        // slight trend (e.g., slope effect) to look realistic
        n += 0.1*(u - v);
        // clamp
        n = Math.max(0, Math.min(1, n));
        data[r][c] = n;
      }
    }
    return data;
  }

  // Make normalized (0..1) surfaces for each agronomic layer
  const S_ph = makeSurface(cols, rows, 12345);
  const S_n  = makeSurface(cols, rows, 424242);
  const S_st = makeSurface(cols, rows, 888888);
  const S_wd = makeSurface(cols, rows, 987654);

  // Map normalized to realistic units
  function mapPH(x) { return 4.5 + x*4.0; } // 4.5 .. 8.5
  function mapN(x)  { return Math.round(240 * x); } // 0 .. 240 kg/ha
  function mapSt(x) { return Math.round(30 * Math.pow(x, 1.2)); } // 0 .. 30 %
  function mapWd(x) { return Math.round(100 * Math.pow(x, 1.1)); } // 0 .. 100 %

  const ph = S_ph.map(row=>row.map(mapPH));
  const nitrogen = S_n.map(row=>row.map(mapN));
  const stones = S_st.map(row=>row.map(mapSt));
  const weeds = S_wd.map(row=>row.map(mapWd));

  // --- Build Voronoi "fields" to mimic real paddocks ---
  const points = turf.randomPoint(22, { bbox });
  const vor = turf.voronoi(points, { bbox });
  // Filter polygons and compute stats
  let fieldId = 1;
  const fieldFeatures = [];
  for (const feat of vor.features) {
    if (!feat || feat.geometry.type !== "Polygon") continue;
    // area filter: discard tiny slivers
    const area = turf.area(feat);
    if (area < 20000) continue; // ~2 ha threshold
    const id = fieldId++;
    // Gather average values by sampling grid centroids
    let count = 0, sPH=0, sN=0, sST=0, sWD=0;
    for (let idx=0; idx<cellCenters.length; idx++){
      const p = turf.point(cellCenters[idx]);
      if (turf.booleanPointInPolygon(p, feat)){
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        sPH += ph[r][c];
        sN  += nitrogen[r][c];
        sST += stones[r][c];
        sWD += weeds[r][c];
        count++;
      }
    }
    const props = {
      id,
      area_m2: Math.round(area),
      avg_ph: count? +(sPH/count).toFixed(2): null,
      avg_n: count? Math.round(sN/count): null,
      avg_stones: count? Math.round(sST/count): null,
      avg_weeds: count? Math.round(sWD/count): null
    };
    feat.properties = props;
    fieldFeatures.push(feat);
  }
  const fields = turf.featureCollection(fieldFeatures);

  // --- Sampling helpers ---
  function valueAt(lnglat, layer) {
    const [x, y] = lnglat;
    const u = (x - bbox[0]) / (bbox[2]-bbox[0]);
    const v = (y - bbox[1]) / (bbox[3]-bbox[1]);
    const c = Math.max(0, Math.min(cols-1, Math.floor(u * cols)));
    const r = Math.max(0, Math.min(rows-1, Math.floor(v * rows)));
    switch(layer){
      case "ph": return ph[r][c];
      case "nitrogen": return nitrogen[r][c];
      case "stones": return stones[r][c];
      case "weeds": return weeds[r][c];
    }
    return null;
  }

  function probeAt(lnglat){
    return {
      ph: +valueAt(lnglat,"ph").toFixed(2),
      nitrogen: valueAt(lnglat,"nitrogen"),
      stones: valueAt(lnglat,"stones"),
      weeds: valueAt(lnglat,"weeds")
    };
  }

  // Samples storage
  const samples = [];

  function addSample(lnglat, values){
    const fc = turf.featureCollection([turf.point(lnglat, { ...values, ts: Date.now() })]);
    samples.push(fc.features[0]);
  }

  function samplesGeoJSON(){
    return turf.featureCollection(samples);
  }

  // Build GeoJSON grids per layer on demand
  function gridGeoJSON(layer){
    const feats = [];
    let k = 0;
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const base = gridPolys[k++];
        let v;
        switch(layer){
          case "ph": v = ph[r][c]; break;
          case "nitrogen": v = nitrogen[r][c]; break;
          case "stones": v = stones[r][c]; break;
          case "weeds": v = weeds[r][c]; break;
        }
        feats.push(turf.clone(base));
        feats[feats.length-1].properties = { r, c, value: (layer==="ph")? +v.toFixed(2): v };
      }
    }
    return turf.featureCollection(feats);
  }

  return {
    bbox, center, zoom,
    fields,
    gridGeoJSON,
    samplesGeoJSON,
    addSample,
    probeAt
  };
}