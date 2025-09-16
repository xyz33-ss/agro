# Precision Farming Map (FS-style)

Pequeña aplicación **Node.js + Leaflet** inspirada en los mapas de *Farming Simulator* para visualizar capas agronómicas (pH, Nitrógeno, Piedras y Malezas) sobre **imágenes satelitales reales**. Los datos se **simulan** con ruido espacial coherente y se agregan por "predios" generados con **Voronoi**.

## Cómo ejecutar

```bash
# 1) Instalar dependencias
npm install

# 2) Ejecutar el servidor
npm start
# abre http://localhost:3000
```

## Estructura

```
farming-sim-map/
├─ package.json
├─ server.js
├─ data/
│  └─ simData.js        # Genera la simulación (grid, capas, predios, sondeo)
└─ public/
   ├─ index.html
   ├─ styles.css
   └─ app.js
```

## Notas

- Fondo satelital: **Esri World Imagery** (créditos en el mapa).
- Área real: **zona agrícola al S de San Fernando, Chile** (aprox.).
- Los valores son **ficticios pero verosímiles** (pH 4.5–8.5, N 0–240 kg/ha, etc.).
- Puedes hacer **click** en el mapa para **sondear** y **guardar muestras** (se guardan en memoria del servidor).

## Ajustes útiles

- Cambia el `bbox`/`center`/`zoom` en `data/simData.js` para mover el mapa a tu fundo real.
- Sube/baja la resolución del grid con `cols`/`rows` (ojo con rendimiento).
- Edita las **leyendas** y **paletas** en `/api/meta` (ver `server.js`).

¡Listo para iterar y conectar con datos reales cuando los tengas!