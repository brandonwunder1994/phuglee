# M3 — Professional Map Redesign (MapLibre GL)

> **Status:** `complete`  
> **Replaces:** D3/SVG pin stack (M2) — structurally unable to handle 94+ pins per state  
> **Created:** 2026-07-05

## Why redo

| Problem | Root cause |
|---------|------------|
| Pins overlap in Ohio/Texas/Georgia | D3 SVG + manual collision runs once in pre-zoom space; metro clusters still stack |
| Map loads wrong / feels broken | Dual async loads (coverage + topojson), transition races, 600KB JSON blocking paint |
| Not professional | No WebGL clustering, no proper basemap, pin-first UX in dense regions |

## Research — what professional maps do

| Reference | Pattern | Apply to Form Forge |
|-----------|---------|---------------------|
| [Mapbox cluster example](https://docs.mapbox.com/mapbox-gl-js/example/cluster/) | WebGL clusters expand on click; individual points only at high zoom | State drill-down uses clustered GeoJSON source |
| [Felt sales dashboard](https://felt.com/gallery/sales-territories) | Point map + sidebar filters + fly-to | Keep sidebar list as primary selection |
| [Felt Pre-K choropleth](https://felt.com/gallery/pre-k-access-and-funding) | Choropleth national → drill to detail | National = state fill only, no city pins |
| [CARTO 2025 maps](https://carto.com/blog/5-best-spatial-analytics-and-visualizations-of-2025/) | Dark basemap + layered thematic data | Carto dark raster + gold/cyan accent layers |
| [MapLibre clustering](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/) | Free, no API key, GPU-accelerated | Chosen stack |

## Locked UX

1. **National** — dark basemap + gold choropleth states. Zero city markers.
2. **State click** — flyTo bounds, load state cities into clustered source.
3. **Selection** — sidebar list primary; map shows clusters + single highlighted point.
4. **Cluster click** — zoom to expand cluster (standard MapLibre behavior).
5. **Search** — unchanged; flies to state on pick.

## Stack

- **MapLibre GL JS 4.x** (CDN, no API key)
- **Carto dark basemap** (free raster tiles)
- **US states GeoJSON** (topojson client convert, same as before)
- **`/api/coverage/geojson`** — city FeatureCollection endpoint