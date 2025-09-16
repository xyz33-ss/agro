import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { generateSimData } from "./data/simData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Generate the simulated data at startup ----
const sim = generateSimData();

// Simple helpers for legends (bins + colors) to mimic FS color ramps
const legends = {
  nitrogen: {
    unit: "kg/ha",
    bins: [0,20,40,60,80,100,120,140,160,180,200,220,240],
    colors: ["#c80000","#ff3300","#ff6600","#ff9900","#ffcc00","#ffe600","#e6ff00","#ccff00","#99ff00","#66ff00","#33cc00","#19b300","#009900"]
  },
  ph: {
    unit: "pH",
    bins: [4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0,8.5],
    colors: ["#8b0000","#b22222","#ff8c00","#ffd700","#adff2f","#32cd32","#00fa9a","#1e90ff","#4169e1"]
  },
  stones: {
    unit: "% superficie",
    bins: [0,5,10,15,20,25,30],
    colors: ["#008000","#5fbf00","#a3e200","#ffd700","#ff9900","#ff6600","#ff3300"]
  },
  weeds: {
    unit: "% densidad",
    bins: [0,10,20,40,60,80,100],
    colors: ["#006400","#228b22","#7fff00","#ffd700","#ffa500","#ff4500","#8b0000"]
  }
};

app.get("/api/meta", (req,res) => {
  res.json({
    center: sim.center,
    bbox: sim.bbox,
    zoom: sim.zoom,
    fieldCount: sim.fields.features.length,
    legends
  });
});

app.get("/api/fields", (req,res) => {
  res.json(sim.fields);
});

app.get("/api/grid/:layer", (req,res) => {
  const layer = req.params.layer;
  const allowed = ["ph","nitrogen","stones","weeds"];
  if (!allowed.includes(layer)) return res.status(400).json({error: "invalid layer"});
  res.json(sim.gridGeoJSON(layer));
});

app.get("/api/samples", (req,res) => {
  res.json(sim.samplesGeoJSON());
});

app.post("/api/samples", (req,res) => {
  const { lat, lng, save } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number"){
    return res.status(400).json({error: "lat and lng required"});
  }
  const probe = sim.probeAt([lng, lat]);
  if (save !== false) sim.addSample([lng, lat], probe);
  res.json({location: {lat, lng}, ...probe, saved: save !== false});
});

// Fallback: serve index.html
app.get("*", (req,res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`Precision Farming map on http://localhost:${PORT}`);
});