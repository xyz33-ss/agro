// public/app.js
const $ = (sel)=>document.querySelector(sel);
const api = (p,opts)=>fetch(p,opts).then(r=>r.json());

const map = L.map("map", { zoomControl: true, attributionControl: true });
const imagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" }
).addTo(map);

let meta, currentLayerName = "nitrogen";
let gridLayer = null;
let fieldsLayer = null;
let samplesLayer = L.geoJSON(null, {
  pointToLayer: (f, latlng)=>L.circleMarker(latlng, {radius:5, color:"#23c55e"})
}).addTo(map);

function colorScale(v, bins, colors){
  // return color for v given bins
  for (let i = bins.length-1; i >= 0; i--){
    if (v >= bins[i]) return colors[i];
  }
  return colors[0];
}

function legendHTML(name){
  const l = meta.legends[name];
  const parts = l.bins.map((b,i)=>{
    return `<div class="legend-row"><span class="legend-color" style="background:${l.colors[i]}"></span> ${b} ${l.unit}</div>`;
  });
  return `<div class="legend-title"><b>${name.toUpperCase()}</b></div>${parts.join("")}`;
}

function computeScore(){
  // naive score using field averages (for demo)
  const feats = fieldsLayer ? fieldsLayer.toGeoJSON().features : [];
  if (!feats.length) return "—";
  let acc = 0;
  for (const f of feats){
    const ph = f.properties.avg_ph || 6.5;
    const w = f.properties.avg_weeds || 0;
    const st = f.properties.avg_stones || 0;
    const phScore = 1 - Math.min(1, Math.abs(ph-6.5)/2.5);
    const weedScore = 1 - (w/100);
    const stoneScore = 1 - Math.min(1, st/30);
    const s = 0.5*phScore + 0.3*weedScore + 0.2*stoneScore;
    acc += s;
  }
  const val = Math.round((acc/feats.length)*100);
  return `${val}/100`;
}

async function init(){
  meta = await api("/api/meta");
  map.setView([meta.center.lat, meta.center.lng], meta.zoom);

  // Fields
  const fc = await api("/api/fields");
  fieldsLayer = L.geoJSON(fc, {
    style: { color:"#ffffff", weight:1, fill:false }
  }).addTo(map);
  // Add labels
  fc.features.forEach(f=>{
    const cent = L.geoJSON(f).getBounds().getCenter();
    L.marker(cent, {
      icon: L.divIcon({ className:"field-label", html: f.properties.id, iconAnchor:[12,12] })
    }).addTo(map);
  });

  // Samples existing
  const samples = await api("/api/samples");
  samplesLayer.addData(samples);

  // Default layer
  await showLayer(currentLayerName);

  $("#score").textContent = computeScore();
  $("#legend").innerHTML = legendHTML(currentLayerName);

  // UI
  document.querySelectorAll(".tool[data-layer]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentLayerName = btn.dataset.layer;
      await showLayer(currentLayerName);
      $("#legend").innerHTML = legendHTML(currentLayerName);
    });
    if (btn.dataset.layer === currentLayerName) btn.classList.add("active");
  });

  $("#toggle-fields").addEventListener("click", ()=>{
    if (map.hasLayer(fieldsLayer)){ map.removeLayer(fieldsLayer); } else { fieldsLayer.addTo(map); }
  });
  $("#toggle-samples").addEventListener("click", async ()=>{
    const data = await api("/api/samples");
    samplesLayer.clearLayers();
    samplesLayer.addData(data);
  });

  // Probe on click
  map.on("click", async (e)=>{
    const body = { lat: e.latlng.lat, lng: e.latlng.lng, save: false };
    const data = await api("/api/samples", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    showProbe(e.latlng, data);
  });

  $("#close-probe").addEventListener("click", ()=>$("#probe").classList.add("hidden"));
  $("#save-sample").addEventListener("click", async ()=>{
    const el = $("#save-sample");
    const lat = el.dataset.lat, lng = el.dataset.lng;
    const body = { lat: Number(lat), lng: Number(lng), save: true };
    const saved = await api("/api/samples", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    samplesLayer.addData({ type:"FeatureCollection", features:[{
      type:"Feature", geometry:{type:"Point", coordinates:[Number(lng), Number(lat)]},
      properties:{...saved}
    }]});
    $("#probe").classList.add("hidden");
    $("#lab-info").textContent = "Muestras en mapa actualizadas.";
  });
}

async function showLayer(name){
  const data = await api(`/api/grid/${name}`);
  if (gridLayer) map.removeLayer(gridLayer);
  const legend = meta.legends[name];
  gridLayer = L.geoJSON(data, {
    style: (f)=>{
      const v = f.properties.value;
      return {
        color: "transparent",
        weight: 0,
        fillColor: colorScale(v, legend.bins, legend.colors),
        fillOpacity: 0.65
      };
    },
    onEachFeature: (f,layer)=>{
      layer.bindPopup(`${name.toUpperCase()}: <b>${f.properties.value}</b> ${legend.unit}`);
    }
  }).addTo(map);
}

function showProbe(latlng, d){
  const el = $("#probe");
  $("#probe-values").innerHTML = `
    <div>pH: <b>${d.ph}</b></div>
    <div>Nitrógeno: <b>${d.nitrogen}</b> kg/ha</div>
    <div>Piedras: <b>${d.stones}</b> %</div>
    <div>Malezas: <b>${d.weeds}</b> %</div>
    <div style="margin-top:4px;color:#aaa">(${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)})</div>
  `;
  const saveBtn = $("#save-sample");
  saveBtn.dataset.lat = latlng.lat;
  saveBtn.dataset.lng = latlng.lng;
  el.classList.remove("hidden");
}

init();