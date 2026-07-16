/* global maplibregl */

const $ = (s) => document.querySelector(s);

const EMPTY_FC = { type: "FeatureCollection", features: [] };
const STATE_SOURCE = "us-states";
const CITIES_SOURCE = "state-cities";
const SELECTED_SOURCE = "selected-city";
const CITY_BOUNDARY_SOURCE = "city-boundary";
const ROAD_SOURCE = "openmaptiles";
const ROAD_TILES_URL = "https://tiles.openfreemap.org/planet";
const TERRAIN_HILLSHADE_TILES = "https://tiles.openstreetmap.us/raster/hillshade/{z}/{x}/{y}.jpg";
const TERRAIN_PEAKS_LAYER = "terrain-peaks";
// Natural features (water, forests, relief) fade in at national zoom.
const TERRAIN_MIN_ZOOM = 2.8;
// Highways and streets fade in once you zoom past the national overview.
const ROAD_MIN_ZOOM = 5.1;

let map = null;
let coverage = null;
let cityDetails = new Map();
let stateFeatures = [];
let stateByName = new Map();
let currentState = null;
let selectedCityId = null;
let searchQuery = "";
let layerPortal = true;
let layerCompleted = true;
let referenceCities = [];
let refLabelContainer = null;
let refLabelFrame = null;
let calloutRoot = null;
let calloutSvg = null;
let calloutInsets = null;
let calloutFrame = null;
let clusterLabelContainer = null;
let clusterLabelFrame = null;
let mapTooltip = null;
let selectedPulseEl = null;
let selectedPulseFrame = null;
let boundaryFetchToken = 0;
const expandedCountiesByState = new Map();

// Coverage choropleth + pin palette (green family)
const COVERAGE_COLOR_LOW = "#2a8f5c";
const COVERAGE_COLOR_HIGH = "#45c47e";
const DATA_UNAVAILABLE_BASE = "#8f2a2a";
const DATA_UNAVAILABLE_ACCENT = "#c84848";

const US_HOME_CENTER = [-96.2, 38.8];
const US_HOME_ZOOM = 3.4;
const US_FIT_MIN_ZOOM = 1.8;
// Tight lower-48 frame until state geometry loads (excludes Canada, Mexico, AK, HI).
const LOWER_48_FALLBACK_BOUNDS = [
  [-125.0, 24.48],
  [-66.9, 49.42],
];

// Declared early for zoom-gesture tracking (assigned before initMap runs).
let zoomAtGestureStart = US_HOME_ZOOM;
let nationalHomeZoom = US_HOME_ZOOM;
let nationalHomeCenter = US_HOME_CENTER;
let lower48FitBounds = null;
let lower48MaxBounds = null;

const NO_DATA_STATE_COLOR = "#3a4658";

function extendBoundsWithCoords(bounds, coords) {
  if (typeof coords[0] === "number") bounds.extend(coords);
  else coords.forEach((c) => extendBoundsWithCoords(bounds, c));
}

function boundsFromStateGeojson(statesGeo, marginDeg = 0.08) {
  const bounds = new maplibregl.LngLatBounds();
  statesGeo.features.forEach((feature) => {
    const { geometry } = feature;
    if (geometry.type === "Polygon") geometry.coordinates.forEach((ring) => extendBoundsWithCoords(bounds, ring));
    else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((poly) => poly.forEach((ring) => extendBoundsWithCoords(bounds, ring)));
    }
  });
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return new maplibregl.LngLatBounds(
    [sw.lng - marginDeg, sw.lat - marginDeg],
    [ne.lng + marginDeg, ne.lat + marginDeg]
  );
}

function usNationalBounds() {
  const bounds = lower48FitBounds || lower48MaxBounds;
  return bounds || new maplibregl.LngLatBounds(LOWER_48_FALLBACK_BOUNDS[0], LOWER_48_FALLBACK_BOUNDS[1]);
}

function applyLower48Bounds(statesGeo) {
  lower48FitBounds = boundsFromStateGeojson(statesGeo, 0);
  lower48MaxBounds = boundsFromStateGeojson(statesGeo, 0.18);
  if (map) map.setMaxBounds(lower48MaxBounds);
}

function nationalFitPadding() {
  const legend = document.querySelector(".map-legend");
  const legendRect = legend?.getBoundingClientRect();
  return {
    top: 36,
    bottom: Math.max(52, Math.ceil(legendRect?.height || 0) + 28),
    left: Math.max(48, Math.ceil(legendRect?.width || 0) + 24),
    right: 56,
  };
}

// Lead requests cannot be filed in these states — shown with red hatch on map.
const LEADS_UNAVAILABLE_STATES = new Set([
  "Alabama",
  "Arkansas",
  "Delaware",
  "Kentucky",
  "South Carolina",
  "Virginia",
]);

const CALLOUT_MAX_ZOOM = 5.6;
const CALLOUT_PANEL_W = 96;
const CALLOUT_INSET_H = 34;
const CALLOUT_INSET_GAP = 5;
const CALLOUT_PANEL_TOP = 52;

// Northeast / mid-Atlantic states that are hard to hit at national zoom.
const SMALL_STATE_CALLOUTS = [
  { name: "Vermont", abbrev: "VT", anchor: [-72.59, 44.02] },
  { name: "New Hampshire", abbrev: "NH", anchor: [-71.66, 43.88] },
  { name: "Massachusetts", abbrev: "MA", anchor: [-70.86, 41.92] },
  { name: "Rhode Island", abbrev: "RI", anchor: [-71.43, 41.56] },
  { name: "Connecticut", abbrev: "CT", anchor: [-72.76, 41.43] },
  { name: "New Jersey", abbrev: "NJ", anchor: [-74.81, 40.06] },
  { name: "Maryland", abbrev: "MD", anchor: [-76.69, 38.81] },
  { name: "District of Columbia", abbrev: "DC", anchor: [-77.04, 38.9] },
];

const countByState = () => Object.fromEntries((coverage?.states || []).map((s) => [s.name, s.count]));

function stateHasCoverage(name) {
  return (countByState()[name] || 0) > 0;
}

function isLeadsUnavailable(name) {
  return LEADS_UNAVAILABLE_STATES.has(name);
}

function cityMatchesLayers(city) {
  const type = city.pin_type || "completed";
  if (type === "portal" && !layerPortal) return false;
  if (type === "completed" && !layerCompleted) return false;
  return true;
}

function matchesSearch(city) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return `${city.city} ${city.state} ${city.county || ""} ${city.id}`.toLowerCase().includes(q);
}

function cityCounty(city) {
  return city.county || "Unknown County";
}

function groupCitiesByCounty(cities) {
  const groups = new Map();
  cities.forEach((city) => {
    const county = cityCounty(city);
    if (!groups.has(county)) groups.set(county, []);
    groups.get(county).push(city);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([county, list]) => ({
      county,
      cities: list.sort((a, b) => a.city.localeCompare(b.city)),
    }));
}

function expandedCountiesForState(stateName) {
  if (!expandedCountiesByState.has(stateName)) expandedCountiesByState.set(stateName, new Set());
  return expandedCountiesByState.get(stateName);
}

function toggleCounty(stateName, county) {
  const expanded = expandedCountiesForState(stateName);
  if (expanded.has(county)) expanded.delete(county);
  else expanded.add(county);
}

function stateCities(name) {
  return coverage.cities
    .filter((c) => c.state === name && cityMatchesLayers(c) && matchesSearch(c))
    .sort((a, b) => a.city.localeCompare(b.city));
}

function searchCities() {
  return coverage.cities
    .filter((c) => cityMatchesLayers(c) && matchesSearch(c))
    .sort((a, b) => a.city.localeCompare(b.city) || a.state.localeCompare(b.state));
}

function citiesToGeoJSON(cities) {
  return {
    type: "FeatureCollection",
    features: cities
      .filter((c) => c.has_coords && c.lat != null && c.lng != null)
      .map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          city: c.city,
          state: c.state,
          pin_type: c.pin_type || "completed",
        },
      })),
  };
}

const DOCK_PANELS = ["sidebar-search", "sidebar-state"];

function syncCoverageDock(panel) {
  const dock = $("#coverage-dock");
  if (!dock) return;
  const open = panel !== "sidebar-empty";
  dock.classList.toggle("is-open", open);
  dock.classList.toggle("is-collapsed", !open);
}

function showPanel(panel) {
  const empty = document.getElementById("sidebar-empty");
  if (empty) empty.hidden = panel !== "sidebar-empty";
  DOCK_PANELS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = id !== panel;
  });
  const back = $("#btn-sidebar-back");
  if (back) back.hidden = panel !== "sidebar-state";
  syncCoverageDock(panel);
}

function setMapReady(ready) {
  document.querySelector(".map-canvas-wrap")?.classList.toggle("is-ready", ready);
}

function setLoading(on) {
  const el = $("#map-loading");
  if (!el) return;
  el.hidden = !on;
  el.setAttribute("aria-hidden", on ? "false" : "true");
  if (on) setMapReady(false);
}

function showMapError(message) {
  setLoading(false);
  const loading = $("#map-loading");
  if (!loading) return;
  loading.hidden = false;
  loading.setAttribute("aria-hidden", "false");
  const label = loading.querySelector("span:last-child");
  if (label) {
    label.textContent = message;
    label.style.color = "var(--danger)";
  }
}

function updateMapHint() {}

function appendCoverageItem(list, text) {
  const li = document.createElement("li");
  li.textContent = text;
  list.appendChild(li);
}

function syncCityListSelection(cityId) {
  document.querySelectorAll("#state-county-browser .city-pick, #search-city-list button").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.cityId === cityId);
  });
}

function buildCityButton(city, onSelect, { compact = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.cityId = city.id;
  btn.classList.toggle("is-selected", city.id === selectedCityId);
  if (compact) btn.classList.add("city-pick");
  const tag = city.pin_type === "portal" ? " ◆" : " ●";
  const label = compact || currentState
    ? `${city.city}${tag}`
    : `${city.city}, ${city.state}${tag}`;
  btn.append(document.createTextNode(label));
  btn.setAttribute("role", "option");
  btn.addEventListener("click", () => onSelect(city));
  return btn;
}

function selectCityFromSidebar(city) {
  selectCity(city);
}

function renderCountyBrowser(stateName, cities) {
  const browser = $("#state-county-browser");
  if (!browser) return;
  if (window.PhugleeCoverageShared?.renderCountyBrowser) {
    window.PhugleeCoverageShared.renderCountyBrowser(browser, stateName, cities, {
      searchQuery,
      selectedId: selectedCityId,
      expandedCounties: expandedCountiesForState(stateName),
      onSelectCity: selectCityFromSidebar,
    });
    return;
  }
  browser.innerHTML = "";
}

async function showCity(city, coords) {
  selectedCityId = city.id;
  const fetchToken = ++boundaryFetchToken;
  if (currentState === city.state) {
    expandedCountiesForState(city.state).add(cityCounty(city));
    renderCountyBrowser(city.state, stateCities(city.state));
    showPanel("sidebar-state");
  }
  window.PhugleeCoverageShared?.syncCitySelection?.(city.id);
  syncCityListSelection(city.id);
  window.PhugleeCityProfileModal?.open?.(city, { alwaysFetchDetail: true });
  highlightSelectedOnMap(city, coords);
  syncTerrainPeaksVisibility();
  loadAndShowCityBoundary(city, coords, fetchToken);
}

function cityLngLat(city, coords) {
  if (coords?.length === 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }
  const lng = Number(city?.lng);
  const lat = Number(city?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function sidebarPadding() {
  const dock = $("#coverage-dock");
  const open = dock?.classList.contains("is-open");
  const dockH = open ? Math.min(240, Math.round(window.innerHeight * 0.28)) : 0;
  return { top: 56, bottom: 72 + dockH, left: 48, right: 48 };
}

function geoBounds(geometry) {
  if (!map || !geometry) return null;
  const bounds = new maplibregl.LngLatBounds();
  const extendCoords = (coords) => {
    if (typeof coords[0] === "number") bounds.extend(coords);
    else coords.forEach(extendCoords);
  };
  if (geometry.type === "Polygon") geometry.coordinates.forEach(extendCoords);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((poly) => poly.forEach(extendCoords));
  else return null;
  return bounds.isEmpty() ? null : bounds;
}

function setBoundaryLayersVisible(visible) {
  ["city-boundary-fill", "city-boundary-line", "city-boundary-glow"].forEach((id) => {
    if (map?.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
}

function clearCityBoundary() {
  map?.getSource(CITY_BOUNDARY_SOURCE)?.setData(EMPTY_FC);
  setBoundaryLayersVisible(false);
}

function showCityBoundary(feature) {
  if (!map?.getSource(CITY_BOUNDARY_SOURCE)) return;
  if (!feature?.geometry) {
    clearCityBoundary();
    return;
  }
  map.getSource(CITY_BOUNDARY_SOURCE).setData({
    type: "FeatureCollection",
    features: [feature],
  });
  setBoundaryLayersVisible(true);
}

async function loadCityBoundary(city) {
  const cached = cityDetails.get(city.id)?.boundary;
  if (cached) return cached;
  try {
    const res = await fetch(`/api/coverage/city/${encodeURIComponent(city.id)}/boundary`);
    if (!res.ok) return null;
    const boundary = await res.json();
    const detail = cityDetails.get(city.id) || {};
    detail.boundary = boundary;
    cityDetails.set(city.id, detail);
    return boundary;
  } catch (_) {
    return null;
  }
}

async function loadAndShowCityBoundary(city, coords, fetchToken) {
  const boundary = await loadCityBoundary(city);
  if (fetchToken !== boundaryFetchToken || selectedCityId !== city.id) return;
  if (boundary?.geometry) {
    showCityBoundary(boundary);
    flyToCityExtent(city, coords, boundary);
    return;
  }
  clearCityBoundary();
}

function flyToCityExtent(city, coords, boundaryFeature) {
  const lngLat = cityLngLat(city, coords);
  if (!map || !lngLat) return;
  const padding = sidebarPadding();
  const bounds = boundaryFeature?.geometry ? geoBounds(boundaryFeature.geometry) : null;
  map.stop();
  if (bounds) {
    map.fitBounds(bounds, {
      padding,
      duration: 1000,
      maxZoom: 12.5,
      essential: true,
    });
    map.once("moveend", () => scheduleSelectedPulse(lngLat));
    return;
  }
  flyToCity(city, lngLat);
}

function flyToCity(city, coords) {
  const lngLat = cityLngLat(city, coords);
  if (!map || !lngLat) return;
  map.stop();
  map.flyTo({
    center: lngLat,
    zoom: Math.max(map.getZoom(), 11.2),
    padding: sidebarPadding(),
    duration: 900,
    essential: true,
  });
  map.once("moveend", () => scheduleSelectedPulse(lngLat));
}

function highlightSelectedOnMap(city, coords) {
  const lngLat = cityLngLat(city, coords);
  if (!map || !lngLat) return;
  map.getSource(SELECTED_SOURCE)?.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: lngLat },
        properties: { id: city.id, pin_type: city.pin_type || "completed" },
      },
    ],
  });
  if (map.getLayer("selected-point")) map.setLayoutProperty("selected-point", "visibility", "visible");
  flyToCity(city, lngLat);
  scheduleSelectedPulse(lngLat);
}

function showSearchResults() {
  const q = searchQuery.trim();
  if (!q) {
    if (currentState) showState(currentState);
    else showPanel("sidebar-empty");
    return;
  }
  const matches = searchCities();
  showPanel("sidebar-search");
  const sub = $("#search-sub");
  if (sub) {
    sub.hidden = false;
    sub.textContent = matches.length
      ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
      : "No cities match — try another name or state";
  }
  $("#state-title").textContent = "Search results";
  $("#state-sub").textContent = matches.length
    ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
    : "No cities match";
  const list = $("#search-city-list");
  if (window.PhugleeCoverageShared?.renderSearchList) {
    window.PhugleeCoverageShared.renderSearchList(list, matches.slice(0, 100), selectCity, selectedCityId);
  } else {
    list.innerHTML = "";
    matches.slice(0, 100).forEach((city) => list.appendChild(buildCityButton(city, selectCity)));
  }
}

function showState(name) {
  currentState = name;
  const cities = stateCities(name);
  showPanel("sidebar-state");
  $("#state-title").textContent = name;
  const portalN = cities.filter((c) => c.pin_type === "portal").length;
  const completedN = cities.filter((c) => c.pin_type === "completed").length;
  const countyN = groupCitiesByCounty(cities).length;
  const filterNote = searchQuery.trim() ? " · filtered" : "";
  $("#state-sub").textContent = cities.length
    ? `${cities.length} cities · ${countyN} counties · ${portalN} portal · ${completedN} PDF${filterNote}`
    : `No cities match current filters${filterNote}`;

  renderCountyBrowser(name, cities);
  syncCityListSelection(selectedCityId);

  loadStateCitiesOnMap(name, cities);
  scheduleClusterLabels();
  dimOtherStates(name);
  updateMapHint();
  scheduleReferenceLabels();
  scheduleSmallStateCallouts();
  scheduleClusterLabels();
  syncTerrainPeaksVisibility();
  $("#btn-reset-zoom").hidden = false;
}

function loadStateCitiesOnMap(stateName, cities) {
  if (!map?.getSource(CITIES_SOURCE)) return;
  map.getSource(CITIES_SOURCE).setData(citiesToGeoJSON(cities));
  ["city-clusters", "city-points"].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
  });
}

function hideStateCitiesOnMap() {
  if (!map?.getSource(CITIES_SOURCE)) return;
  map.getSource(CITIES_SOURCE).setData(EMPTY_FC);
  map.getSource(SELECTED_SOURCE)?.setData(EMPTY_FC);
  clearCityBoundary();
  ["city-clusters", "city-points"].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  });
  if (map.getLayer("selected-point")) map.setLayoutProperty("selected-point", "visibility", "none");
  hideSelectedPulse();
  scheduleClusterLabels();
  syncTerrainPeaksVisibility();
}

const CITY_CLICK_LAYERS = ["city-points", "city-clusters"];
const CITY_CLICK_RADIUS_PX = 16;

function cityClickBBox(point, radiusPx = CITY_CLICK_RADIUS_PX) {
  return [
    [point.x - radiusPx, point.y - radiusPx],
    [point.x + radiusPx, point.y + radiusPx],
  ];
}

function queryCityFeaturesAt(point) {
  if (!map) return { clusters: [], points: [] };
  const hits = map.queryRenderedFeatures(cityClickBBox(point), { layers: CITY_CLICK_LAYERS });
  const clusters = hits.filter((f) => f.layer.id === "city-clusters");
  const points = hits.filter((f) => f.layer.id === "city-points");
  return {
    clusters: clusters.length ? [clusters[0]] : [],
    points: points.length ? [points[0]] : [],
  };
}

function openCityFromFeature(feature) {
  const props = feature?.properties;
  if (!props?.id) return;
  const city = coverage?.cities?.find((c) => c.id === props.id);
  if (!city) return;
  selectCity(city);
}

function zoomToCluster(feature) {
  const source = map?.getSource(CITIES_SOURCE);
  if (!source) return;
  const clusterId = feature.properties.cluster_id;
  const center = feature.geometry.coordinates;

  source.getClusterLeaves(clusterId, 2, 0, (leafErr, leaves) => {
    if (!leafErr && leaves.length === 1) {
      openCityFromFeature(leaves[0]);
      return;
    }

    source.getClusterExpansionZoom(clusterId, (err, expansionZoom) => {
      if (err) return;
      const nextZoom = Math.min(Math.max(expansionZoom + 0.35, map.getZoom() + 0.85), 12);
      map.stop();
      map.flyTo({
        center,
        zoom: nextZoom,
        padding: sidebarPadding(),
        duration: 600,
        essential: true,
      });
      map.once("moveend", scheduleClusterLabels);
    });
  });
}

function handleCityMapClick(e) {
  if (!currentState || !map) return;
  const { clusters, points } = queryCityFeaturesAt(e.point);
  if (points.length) {
    openCityFromFeature(points[0]);
    return;
  }
  if (clusters.length) zoomToCluster(clusters[0]);
}

function updateCityClickCursor(e) {
  if (!map || !currentState) return;
  const { clusters, points } = queryCityFeaturesAt(e.point);
  map.getCanvas().style.cursor = clusters.length || points.length ? "pointer" : "";
}

const NATIONAL_ZOOM_EXIT = 4.8;

const UNAVAILABLE_TINT_OPACITY = 0.55;
const UNAVAILABLE_HATCH_OPACITY = 1;

function baseStateFillOpacity() {
  return [
    "case",
    ["==", ["get", "leadsUnavailable"], 1],
    1,
    ["boolean", ["get", "hasData"], false],
    1,
    0.72,
  ];
}

function dimmedStateFillOpacity(focusName) {
  return [
    "case",
    ["==", ["get", "name"], focusName],
    1,
    ["==", ["get", "leadsUnavailable"], 1],
    1,
    ["boolean", ["get", "hasData"], false],
    1,
    0.48,
  ];
}

function syncUnavailableLayerOpacity() {
  if (map?.getLayer("states-unavailable-tint")) {
    map.setPaintProperty("states-unavailable-tint", "fill-opacity", UNAVAILABLE_TINT_OPACITY);
  }
  if (map?.getLayer("states-unavailable-hatch")) {
    map.setPaintProperty("states-unavailable-hatch", "fill-opacity", UNAVAILABLE_HATCH_OPACITY);
  }
}

function dimOtherStates(focusName) {
  if (!map?.getLayer("states-fill")) return;
  map.setPaintProperty("states-fill", "fill-opacity", dimmedStateFillOpacity(focusName));
  syncUnavailableLayerOpacity();
}

function resetStateOpacity() {
  if (!map?.getLayer("states-fill")) return;
  map.setPaintProperty("states-fill", "fill-opacity", baseStateFillOpacity());
  syncUnavailableLayerOpacity();
}

function syncTerrainPeaksVisibility() {
  if (!map?.getLayer(TERRAIN_PEAKS_LAYER)) return;
  const hide = Boolean(currentState || selectedCityId);
  map.setLayoutProperty(TERRAIN_PEAKS_LAYER, "visibility", hide ? "none" : "visible");
}

function stateIsUnavailable(props) {
  return Number(props?.leadsUnavailable) === 1 || isLeadsUnavailable(props?.name);
}

function clearStateMapChrome() {
  hideStateCitiesOnMap();
  clearCityBoundary();
  hideSelectedPulse();
  resetStateOpacity();
  if (map?.getLayer("states-hover")) map.setFilter("states-hover", ["==", ["get", "name"], ""]);
}

function exitStateView({ flyHome = false } = {}) {
  currentState = null;
  selectedCityId = null;
  if ($("#map-search")) $("#map-search").value = "";
  searchQuery = "";
  if ($("#state-title")) $("#state-title").textContent = "Explore coverage";
  if ($("#state-sub")) $("#state-sub").textContent = "Click a state or search a market";
  showPanel("sidebar-empty");
  clearStateMapChrome();
  updateMapHint();
  scheduleReferenceLabels();
  scheduleSmallStateCallouts();
  $("#btn-reset-zoom").hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.delete("city");
  history.replaceState(null, "", url);
  syncTerrainPeaksVisibility();
  if (flyHome) flyToNationalHome({ animate: true });
}

function maybeExitStateViewOnZoom() {
  if (!currentState || !map) return;
  const zoom = map.getZoom();
  if (zoom < NATIONAL_ZOOM_EXIT && zoom < zoomAtGestureStart - 0.05) exitStateView({ flyHome: true });
}

function syncDragPan() {
  if (!map?.dragPan) return;
  map.dragPan.enable();
}

function lockNationalHomeZoom() {
  if (!map) return;
  nationalHomeZoom = map.getZoom();
  nationalHomeCenter = map.getCenter().toArray();
  map.setMinZoom(Math.max(US_FIT_MIN_ZOOM, nationalHomeZoom - 0.22));
  zoomAtGestureStart = nationalHomeZoom;
  syncDragPan();
}

function flyToNationalHome({ animate = false } = {}) {
  if (!map) return;
  map.stop();
  map.setMinZoom(US_FIT_MIN_ZOOM);
  const bounds = usNationalBounds();
  const fit = {
    padding: nationalFitPadding(),
    maxZoom: 6.75,
    essential: true,
  };
  if (animate) {
    map.fitBounds(bounds, { ...fit, duration: 900 });
    map.once("moveend", lockNationalHomeZoom);
    return;
  }
  map.fitBounds(bounds, { ...fit, duration: 0 });
  lockNationalHomeZoom();
}

function fitNationalHomeView() {
  flyToNationalHome({ animate: false });
}

function applyNationalHomeView() {
  if (!map) return;
  map.resize();
  fitNationalHomeView();
}

function scheduleNationalHomeView(frames = 2) {
  if (!map) return;
  const tick = (remaining) => {
    applyNationalHomeView();
    if (remaining > 0) requestAnimationFrame(() => tick(remaining - 1));
  };
  tick(frames);
}

function flyToState(name) {
  const feature = stateByName.get(name);
  if (!map || !feature) return;
  const bounds = new maplibregl.LngLatBounds();
  const coords = feature.geometry.coordinates;
  const extend = (ring) => ring.forEach((c) => bounds.extend(c));
  if (feature.geometry.type === "Polygon") coords.forEach(extend);
  else if (feature.geometry.type === "MultiPolygon") coords.forEach((poly) => poly.forEach(extend));
  map.stop();
  map.fitBounds(bounds, { padding: 48, duration: 900, maxZoom: 7, essential: true });
  map.once("moveend", scheduleClusterLabels);
}

function selectCity(city) {
  if (currentState !== city.state) showState(city.state);
  showCity(city);
  const url = new URL(window.location.href);
  url.searchParams.set("city", city.id);
  history.replaceState(null, "", url);
}

function resetView() {
  exitStateView({ flyHome: true });
}

function onSearchInput() {
  searchQuery = $("#map-search")?.value || "";
  selectedCityId = null;
  map?.getSource(SELECTED_SOURCE)?.setData(EMPTY_FC);
  if (currentState) showState(currentState);
  else if (searchQuery.trim()) showSearchResults();
  else showPanel("sidebar-empty");
  syncTerrainPeaksVisibility();
  updateMapHint();
}

function handleKeyboard(event) {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA";
  if (event.key === "/" && !typing) {
    event.preventDefault();
    $("#map-search")?.focus();
  }
  if (event.key === "Escape") {
    if (window.PhugleeCityProfileModal?.isOpen?.()) {
      window.PhugleeCityProfileModal.close();
      return;
    }
    if (currentState) {
      resetView();
    } else if (searchQuery.trim()) {
      if ($("#map-search")) $("#map-search").value = "";
      searchQuery = "";
      showPanel("sidebar-empty");
      updateMapHint();
    }
  }
}

function showUnavailableHint() {}

function onStateClick(name) {
  if (isLeadsUnavailable(name)) {
    showUnavailableHint(name);
    return;
  }
  const n = countByState()[name] || 0;
  if (!n) return;
  showState(name);
  flyToState(name);
}

function lerpHexColor(lowHex, highHex, t) {
  const parse = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(lowHex);
  const [r2, g2, b2] = parse(highHex);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const r = lerp(r1, r2);
  const g = lerp(g1, g2);
  const b = lerp(b1, b2);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function stateFillColor(count) {
  const max = coverage?.max_count || 1;
  if (!count) return NO_DATA_STATE_COLOR;
  const t = Math.min(Math.max(count / Math.max(max, 1), 0), 1);
  return lerpHexColor(COVERAGE_COLOR_LOW, COVERAGE_COLOR_HIGH, Math.max(t, 0.35));
}

function calloutsVisible() {
  return Boolean(map && !currentState && map.getZoom() <= CALLOUT_MAX_ZOOM);
}

function scheduleSmallStateCallouts() {
  if (!calloutRoot) return;
  if (calloutFrame) return;
  calloutFrame = requestAnimationFrame(() => {
    calloutFrame = null;
    updateSmallStateCallouts();
  });
}

function setCalloutHover(name) {
  if (!map?.getLayer("states-hover") || currentState) return;
  map.setFilter("states-hover", ["==", ["get", "name"], name || ""]);
}

function updateSmallStateCallouts() {
  if (!calloutRoot || !calloutSvg || !calloutInsets || !map) return;

  if (!calloutsVisible()) {
    calloutRoot.hidden = true;
    calloutSvg.replaceChildren();
    calloutInsets.replaceChildren();
    return;
  }

  const counts = countByState();
  const active = SMALL_STATE_CALLOUTS.filter((cfg) => (counts[cfg.name] || 0) > 0);
  if (!active.length) {
    calloutRoot.hidden = true;
    return;
  }

  const wrap = calloutRoot.parentElement;
  const wrapW = wrap?.clientWidth || 0;
  const wrapH = wrap?.clientHeight || 0;
  if (!wrapW || !wrapH) return;

  calloutRoot.hidden = false;
  calloutSvg.setAttribute("viewBox", `0 0 ${wrapW} ${wrapH}`);
  calloutSvg.setAttribute("width", String(wrapW));
  calloutSvg.setAttribute("height", String(wrapH));

  const gutterX = wrapW - CALLOUT_PANEL_W - 18;
  const insetX = wrapW - CALLOUT_PANEL_W + 8;
  const frag = document.createDocumentFragment();
  const lines = [];

  active.forEach((cfg, index) => {
    const count = counts[cfg.name] || 0;
    const anchor = map.project(cfg.anchor);
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    if (anchor.x < -40 || anchor.x > wrapW + 40 || anchor.y < -40 || anchor.y > wrapH + 40) return;

    const insetY = CALLOUT_PANEL_TOP + index * (CALLOUT_INSET_H + CALLOUT_INSET_GAP) + CALLOUT_INSET_H / 2;

    lines.push(`M ${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} L ${gutterX.toFixed(1)} ${anchor.y.toFixed(1)}`);
    lines.push(`M ${gutterX.toFixed(1)} ${anchor.y.toFixed(1)} L ${gutterX.toFixed(1)} ${insetY.toFixed(1)} L ${insetX.toFixed(1)} ${insetY.toFixed(1)}`);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "state-callout-inset";
    btn.dataset.state = cfg.name;
    btn.style.top = `${insetY - CALLOUT_INSET_H / 2}px`;
    btn.style.background = stateFillColor(count);
    btn.title = `${cfg.name} — ${count} cities`;
    btn.setAttribute("aria-label", `Open ${cfg.name}, ${count} cities`);
    btn.innerHTML = `<span class="state-callout-abbr">${cfg.abbrev}</span><span class="state-callout-count">${count}</span>`;
    btn.addEventListener("click", () => onStateClick(cfg.name));
    btn.addEventListener("mouseenter", () => setCalloutHover(cfg.name));
    btn.addEventListener("mouseleave", () => setCalloutHover(""));
    frag.appendChild(btn);
  });

  calloutInsets.replaceChildren(frag);
  calloutSvg.replaceChildren();
  if (lines.length) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", lines.join(" "));
    path.setAttribute("class", "state-callout-path");
    calloutSvg.appendChild(path);
  }
}

function initSmallStateCallouts() {
  const wrap = document.querySelector(".map-canvas-wrap");
  if (!wrap || calloutRoot) return;

  calloutRoot = document.createElement("div");
  calloutRoot.className = "state-callouts";
  calloutRoot.hidden = true;

  calloutSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  calloutSvg.classList.add("state-callout-svg");
  calloutSvg.setAttribute("aria-hidden", "true");

  calloutInsets = document.createElement("div");
  calloutInsets.className = "state-callout-insets";

  calloutRoot.append(calloutSvg, calloutInsets);
  wrap.appendChild(calloutRoot);

  map.on("move", scheduleSmallStateCallouts);
  map.on("resize", scheduleSmallStateCallouts);
  scheduleSmallStateCallouts();
}

function minZoomForRefCity(props) {
  let z = 7;
  if (props.tier === 1) z = 4;
  else if (props.capital) z = 5;
  else if (props.tier === 2) z = 5.5;
  if (currentState && props.state === currentState) z -= 1.5;
  return z;
}

function priorityForRefCity(props) {
  let score = props.tier;
  if (props.capital) score -= 0.5;
  if (props.tier === 1) score -= 0.25;
  return score;
}

function scheduleClusterLabels() {
  if (!clusterLabelContainer) return;
  if (clusterLabelFrame) return;
  clusterLabelFrame = requestAnimationFrame(() => {
    clusterLabelFrame = null;
    updateClusterLabels();
  });
}

function updateClusterLabels() {
  if (!map || !clusterLabelContainer) return;
  if (!currentState || !map.getLayer("city-clusters")) {
    clusterLabelContainer.replaceChildren();
    return;
  }
  const features = map.queryRenderedFeatures({ layers: ["city-clusters"] });
  const frag = document.createDocumentFragment();
  for (const feature of features) {
    const count = feature.properties?.point_count;
    if (!count) continue;
    const point = map.project(feature.geometry.coordinates);
    const el = document.createElement("span");
    el.className = "cluster-count-label";
    el.textContent = String(count);
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    frag.appendChild(el);
  }
  clusterLabelContainer.replaceChildren(frag);
}

function initClusterLabels() {
  const wrap = document.querySelector(".map-canvas-wrap");
  if (!wrap || clusterLabelContainer) return;
  clusterLabelContainer = document.createElement("div");
  clusterLabelContainer.className = "cluster-count-labels";
  clusterLabelContainer.setAttribute("aria-hidden", "true");
  wrap.appendChild(clusterLabelContainer);
  map.on("move", scheduleClusterLabels);
  map.on("zoom", scheduleClusterLabels);
  map.on("resize", scheduleClusterLabels);
}

function scheduleReferenceLabels() {
  if (!refLabelContainer) return;
  if (refLabelFrame) return;
  refLabelFrame = requestAnimationFrame(() => {
    refLabelFrame = null;
    updateReferenceLabels();
  });
}

function updateReferenceLabels() {
  if (!map || !refLabelContainer) return;
  const zoom = map.getZoom();
  if (zoom < 4) {
    refLabelContainer.replaceChildren();
    return;
  }

  const bounds = map.getBounds();
  const pad = 0.35;
  const west = bounds.getWest() - pad;
  const east = bounds.getEast() + pad;
  const south = bounds.getSouth() - pad;
  const north = bounds.getNorth() + pad;

  const candidates = referenceCities
    .filter((f) => {
      const props = f.properties;
      if (!stateHasCoverage(props.state)) return false;
      const [lng, lat] = f.geometry.coordinates;
      if (lng < west || lng > east || lat < south || lat > north) return false;
      return zoom >= minZoomForRefCity(props);
    })
    .sort((a, b) => priorityForRefCity(a.properties) - priorityForRefCity(b.properties));

  const minDist = zoom < 5.5 ? 72 : zoom < 7 ? 58 : 46;
  const placed = [];
  const visible = [];
  for (const feature of candidates) {
    const point = map.project(feature.geometry.coordinates);
    if (placed.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < minDist)) continue;
    placed.push(point);
    visible.push({ feature, point });
  }

  const frag = document.createDocumentFragment();
  for (const { feature, point } of visible) {
    const props = feature.properties;
    const el = document.createElement("span");
    el.className = "ref-city-label";
    if (props.capital) el.classList.add("is-capital");
    if (props.tier === 1) el.classList.add("is-major");
    el.textContent = props.name;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    frag.appendChild(el);
  }
  refLabelContainer.replaceChildren(frag);
}

function initReferenceLabels() {
  const wrap = document.querySelector(".map-canvas-wrap");
  if (!wrap || refLabelContainer) return;
  refLabelContainer = document.createElement("div");
  refLabelContainer.className = "ref-city-labels";
  refLabelContainer.setAttribute("aria-hidden", "true");
  wrap.appendChild(refLabelContainer);
  map.on("move", scheduleReferenceLabels);
  map.on("zoom", () => {
    scheduleReferenceLabels();
    scheduleSmallStateCallouts();
    updateMapHint();
    maybeExitStateViewOnZoom();
  });
  map.on("zoomend", maybeExitStateViewOnZoom);
  map.on("resize", scheduleReferenceLabels);
  scheduleReferenceLabels();
}

function ensureUnavailableHatchPattern() {
  if (!map || map.hasImage("unavailable-hatch")) return true;
  try {
    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = DATA_UNAVAILABLE_BASE;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = DATA_UNAVAILABLE_ACCENT;
    ctx.lineWidth = 2;
    for (let offset = -size; offset <= size * 2; offset += 6) {
      ctx.beginPath();
      ctx.moveTo(offset, size);
      ctx.lineTo(offset + size, 0);
      ctx.stroke();
    }
    map.addImage("unavailable-hatch", ctx.getImageData(0, 0, size, size), { pixelRatio: 1 });
    return true;
  } catch (_) {
    return false;
  }
}

function buildDarkStyle() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#080c14" } }],
  };
}

function roadSurfaceFilter() {
  return ["match", ["get", "brunnel"], ["bridge", "tunnel"], false, true];
}

function terrainFeatureOpacity(low, high) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    TERRAIN_MIN_ZOOM - 0.25,
    0,
    TERRAIN_MIN_ZOOM,
    low * 0.65,
    TERRAIN_MIN_ZOOM + 1.4,
    low,
    9,
    low + (high - low) * 0.7,
    12,
    high,
  ];
}

function hillshadeRasterOpacity() {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2,
    0.14,
    4,
    0.3,
    7,
    0.36,
    10,
    0.28,
    12,
    0.2,
  ];
}

function createPatternCanvas(drawFn, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawFn(ctx, size);
  return ctx.getImageData(0, 0, size, size);
}

function ensureTerrainPatterns() {
  if (!map) return false;
  const patterns = [
    {
      id: "terrain-wood",
      draw: (ctx, size) => {
        ctx.fillStyle = "rgba(10, 24, 18, 0.92)";
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = "rgba(31, 107, 71, 0.62)";
        ctx.lineWidth = 2;
        for (let offset = -size; offset <= size * 2; offset += 9) {
          ctx.beginPath();
          ctx.moveTo(offset, size);
          ctx.lineTo(offset + size, 0);
          ctx.stroke();
        }
      },
    },
    {
      id: "terrain-wetland",
      draw: (ctx, size) => {
        ctx.fillStyle = "rgba(8, 22, 28, 0.9)";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "rgba(42, 157, 170, 0.55)";
        for (let y = 4; y < size; y += 10) {
          for (let x = 4; x < size; x += 10) {
            ctx.beginPath();
            ctx.arc(x + ((y / 10) % 2) * 4, y, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
    },
    {
      id: "terrain-rock",
      draw: (ctx, size) => {
        ctx.fillStyle = "rgba(18, 20, 28, 0.92)";
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = "rgba(120, 132, 150, 0.45)";
        ctx.lineWidth = 1.5;
        for (let offset = -size; offset <= size * 2; offset += 7) {
          ctx.beginPath();
          ctx.moveTo(offset, size);
          ctx.lineTo(offset + size, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(offset - size, size);
          ctx.lineTo(offset, 0);
          ctx.stroke();
        }
      },
    },
    {
      id: "terrain-snow",
      draw: (ctx, size) => {
        ctx.fillStyle = "rgba(16, 22, 32, 0.88)";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "rgba(210, 220, 236, 0.42)";
        for (let y = 6; y < size; y += 12) {
          for (let x = 6; x < size; x += 12) {
            ctx.fillRect(x, y, 3, 3);
            ctx.fillRect(x + 5, y + 5, 2, 2);
          }
        }
      },
    },
  ];

  try {
    for (const pattern of patterns) {
      if (map.hasImage(pattern.id)) continue;
      const image = createPatternCanvas(pattern.draw);
      if (!image) return false;
      map.addImage(pattern.id, image, { pixelRatio: 1 });
    }
    return true;
  } catch (_) {
    return false;
  }
}

function addNaturalTerrainLayers(insertBefore) {
  const landcoverPaint = (patternId, solidColor, opacityLow, opacityHigh) => ({
    "fill-color": solidColor,
    ...(patternId ? { "fill-pattern": patternId } : {}),
    "fill-opacity": terrainFeatureOpacity(opacityLow, opacityHigh),
  });

  map.addLayer(
    {
      id: "terrain-hillshade",
      type: "raster",
      source: "terrain-hillshade",
      minzoom: 2,
      paint: {
        "raster-opacity": hillshadeRasterOpacity(),
        "raster-fade-duration": 0,
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-landcover-wood",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "landcover",
      minzoom: TERRAIN_MIN_ZOOM,
      filter: ["match", ["get", "class"], ["wood", "forest"], true, false],
      paint: landcoverPaint("terrain-wood", "#0f241c", 0.34, 0.62),
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-landcover-grass",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "landcover",
      minzoom: TERRAIN_MIN_ZOOM + 0.3,
      filter: ["match", ["get", "class"], ["grass", "farmland", "farmland_overlay"], true, false],
      paint: {
        "fill-color": "#14261c",
        "fill-opacity": terrainFeatureOpacity(0.18, 0.38),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-landcover-wetland",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "landcover",
      minzoom: TERRAIN_MIN_ZOOM,
      filter: ["==", ["get", "class"], "wetland"],
      paint: landcoverPaint("terrain-wetland", "#0d2228", 0.36, 0.58),
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-landcover-rock",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "landcover",
      minzoom: TERRAIN_MIN_ZOOM,
      filter: ["match", ["get", "class"], ["rock", "bare_rock", "scree"], true, false],
      paint: landcoverPaint("terrain-rock", "#1a1e28", 0.3, 0.52),
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-landcover-snow",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "landcover",
      minzoom: TERRAIN_MIN_ZOOM,
      filter: ["match", ["get", "class"], ["ice", "snow", "glacier"], true, false],
      paint: landcoverPaint("terrain-snow", "#1a2230", 0.28, 0.5),
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-park",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "park",
      minzoom: TERRAIN_MIN_ZOOM + 0.5,
      paint: {
        "fill-color": "#12301f",
        "fill-opacity": terrainFeatureOpacity(0.22, 0.42),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-water",
      type: "fill",
      source: ROAD_SOURCE,
      "source-layer": "water",
      minzoom: TERRAIN_MIN_ZOOM,
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          "#0a1e2c",
          8,
          "#0d2838",
          12,
          "#103244",
        ],
        "fill-opacity": terrainFeatureOpacity(0.48, 0.78),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-water-outline",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "water",
      minzoom: TERRAIN_MIN_ZOOM + 0.4,
      paint: {
        "line-color": "rgba(94, 234, 212, 0.28)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.35, 8, 0.8, 12, 1.4],
        "line-opacity": terrainFeatureOpacity(0.35, 0.65),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "terrain-waterway",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "waterway",
      minzoom: TERRAIN_MIN_ZOOM + 0.6,
      filter: ["match", ["get", "class"], ["river", "canal", "stream"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "rgba(64, 176, 196, 0.72)",
        "line-width": [
          "interpolate",
          ["exponential", 1.2],
          ["zoom"],
          5,
          0.35,
          8,
          1.1,
          12,
          2.4,
        ],
        "line-opacity": terrainFeatureOpacity(0.38, 0.72),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: TERRAIN_PEAKS_LAYER,
      type: "circle",
      source: ROAD_SOURCE,
      "source-layer": "mountain_peak",
      minzoom: 7.5,
      filter: ["in", ["get", "class"], ["literal", ["peak", "volcano"]]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, 1.4, 9, 2.2, 12, 3],
        "circle-color": "rgba(232, 192, 74, 0.82)",
        "circle-stroke-color": "rgba(8, 12, 20, 0.85)",
        "circle-stroke-width": 1,
        "circle-opacity": terrainFeatureOpacity(0.4, 0.78),
        "circle-blur": 0.15,
      },
    },
    insertBefore
  );
}

function roadLineOpacity(low, high) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ROAD_MIN_ZOOM - 0.2,
    0,
    ROAD_MIN_ZOOM,
    low * 0.7,
    ROAD_MIN_ZOOM + 1.2,
    low,
    9,
    low + (high - low) * 0.7,
    12,
    high,
  ];
}

function addRoadBasemapLayers(insertBefore) {
  map.addLayer(
    {
      id: "roads-motorway",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "transportation",
      minzoom: ROAD_MIN_ZOOM,
      filter: [
        "all",
        roadSurfaceFilter(),
        ["match", ["get", "class"], ["motorway", "trunk"], true, false],
        ["!=", ["get", "ramp"], 1],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "rgba(220, 228, 236, 0.75)",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 0.45, 8, 1.25, 12, 3.5, 16, 7.5],
        "line-opacity": roadLineOpacity(0.42, 0.88),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "roads-primary",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "transportation",
      minzoom: ROAD_MIN_ZOOM,
      filter: [
        "all",
        roadSurfaceFilter(),
        ["==", ["get", "class"], "primary"],
        ["!=", ["get", "ramp"], 1],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#e4eaf0",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 0.35, 8, 1.05, 12, 2.9, 16, 6],
        "line-opacity": roadLineOpacity(0.38, 0.82),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "roads-secondary",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "transportation",
      minzoom: ROAD_MIN_ZOOM + 0.4,
      filter: [
        "all",
        roadSurfaceFilter(),
        ["match", ["get", "class"], ["secondary", "tertiary"], true, false],
        ["!=", ["get", "ramp"], 1],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#d8e0e8",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 6, 0.3, 9, 1.15, 13, 2.7, 16, 5],
        "line-opacity": roadLineOpacity(0.32, 0.74),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "roads-local",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "transportation",
      minzoom: 9,
      filter: [
        "all",
        roadSurfaceFilter(),
        ["match", ["get", "class"], ["minor", "street", "street_limited", "service"], true, false],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ccd6e0",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 9, 0.25, 12, 1.4, 15, 3.1, 17, 4.6],
        "line-opacity": roadLineOpacity(0.28, 0.66),
      },
    },
    insertBefore
  );

  map.addLayer(
    {
      id: "roads-links",
      type: "line",
      source: ROAD_SOURCE,
      "source-layer": "transportation",
      minzoom: 8,
      filter: ["all", roadSurfaceFilter(), ["==", ["get", "ramp"], 1]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#dfe6ee",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 0.3, 12, 1.55, 16, 3.2],
        "line-opacity": roadLineOpacity(0.28, 0.62),
      },
    },
    insertBefore
  );
}

function addTerrainBasemapLayers() {
  if (!map || map.getSource(ROAD_SOURCE)) return;
  ensureTerrainPatterns();

  map.addSource(ROAD_SOURCE, {
    type: "vector",
    url: ROAD_TILES_URL,
  });
  map.addSource("terrain-hillshade", {
    type: "raster",
    tiles: [TERRAIN_HILLSHADE_TILES],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 12,
    attribution: "© OpenStreetMap US",
  });

  const terrainBefore = map.getLayer("states-line") ? "states-line" : undefined;
  const roadsBefore = map.getLayer("states-hover") ? "states-hover" : undefined;

  addNaturalTerrainLayers(terrainBefore);
  addRoadBasemapLayers(roadsBefore);
}

function addStateLayers(statesGeo) {
  const counts = countByState();
  const maxCount = coverage.max_count || 1;
  statesGeo.features.forEach((f) => {
    const name = f.properties.name;
    f.properties.count = counts[name] || 0;
    f.properties.hasData = f.properties.count > 0;
    f.properties.leadsUnavailable = isLeadsUnavailable(name) ? 1 : 0;
  });

  map.addSource(STATE_SOURCE, { type: "geojson", data: statesGeo });
  map.addLayer({
    id: "states-fill",
    type: "fill",
    source: STATE_SOURCE,
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "leadsUnavailable"], 1],
        DATA_UNAVAILABLE_BASE,
        ["boolean", ["get", "hasData"], false],
        NO_DATA_STATE_COLOR,
        [
          "interpolate",
          ["linear"],
          ["get", "count"],
          1,
          COVERAGE_COLOR_LOW,
          maxCount,
          COVERAGE_COLOR_HIGH,
        ],
      ],
      "fill-opacity": baseStateFillOpacity(),
    },
  });
  const hasHatch = ensureUnavailableHatchPattern();
  map.addLayer({
    id: "states-unavailable-tint",
    type: "fill",
    source: STATE_SOURCE,
    filter: ["==", ["get", "leadsUnavailable"], 1],
    paint: {
      "fill-color": DATA_UNAVAILABLE_ACCENT,
      "fill-opacity": UNAVAILABLE_TINT_OPACITY,
    },
  });
  if (hasHatch) {
    map.addLayer({
      id: "states-unavailable-hatch",
      type: "fill",
      source: STATE_SOURCE,
      filter: ["==", ["get", "leadsUnavailable"], 1],
      paint: {
        "fill-pattern": "unavailable-hatch",
        "fill-opacity": UNAVAILABLE_HATCH_OPACITY,
      },
    });
  }
  syncUnavailableLayerOpacity();
  map.addLayer({
    id: "states-line",
    type: "line",
    source: STATE_SOURCE,
    paint: {
      "line-color": "rgba(240, 235, 227, 0.18)",
      "line-width": 0.8,
    },
  });
  map.addLayer({
    id: "states-unavailable-line",
    type: "line",
    source: STATE_SOURCE,
    filter: ["==", ["get", "leadsUnavailable"], 1],
    paint: {
      "line-color": "#e87070",
      "line-width": 1.35,
    },
  });
  map.addLayer({
    id: "states-hover",
    type: "line",
    source: STATE_SOURCE,
    paint: { "line-color": "#5eead4", "line-width": 2 },
    filter: ["==", ["get", "name"], ""],
  });

  try {
    addTerrainBasemapLayers();
  } catch (_) {
    /* terrain + roads are optional — coverage map still works without tile network */
  }

  map.on("mousemove", "states-fill", (e) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties;
    const unavailable = stateIsUnavailable(props);
    const clickable = props.hasData && !unavailable;
    map.getCanvas().style.cursor = unavailable ? "not-allowed" : clickable ? "pointer" : "default";
    if (currentState) return;
    if (unavailable) {
      map.setFilter("states-hover", ["==", ["get", "name"], ""]);
      return;
    }
    map.setFilter("states-hover", ["==", ["get", "name"], props.name]);
  });
  map.on("mouseleave", "states-fill", () => {
    map.getCanvas().style.cursor = "";
    if (!currentState) map.setFilter("states-hover", ["==", ["get", "name"], ""]);
  });
  map.on("click", "states-fill", (e) => {
    if (currentState) return;
    const name = e.features?.[0]?.properties?.name;
    if (name) onStateClick(name);
  });
}

function showMapTooltip(text, point) {
  if (!mapTooltip || !text || !point) return;
  mapTooltip.textContent = text;
  mapTooltip.hidden = false;
  mapTooltip.style.left = `${point.x}px`;
  mapTooltip.style.top = `${point.y}px`;
}

function hideMapTooltip() {
  if (!mapTooltip) return;
  mapTooltip.hidden = true;
}

function initMapTooltip() {
  const wrap = document.querySelector(".map-canvas-wrap");
  if (!wrap || mapTooltip) return;
  mapTooltip = document.createElement("div");
  mapTooltip.className = "map-tooltip";
  mapTooltip.hidden = true;
  mapTooltip.setAttribute("role", "tooltip");
  wrap.appendChild(mapTooltip);
}

function hideSelectedPulse() {
  if (selectedPulseFrame) {
    cancelAnimationFrame(selectedPulseFrame);
    selectedPulseFrame = null;
  }
  if (selectedPulseEl) selectedPulseEl.hidden = true;
}

function scheduleSelectedPulse(lngLat) {
  if (!selectedPulseEl || !map || !lngLat) return;
  hideSelectedPulse();
  const point = map.project(lngLat);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  selectedPulseEl.style.left = `${point.x}px`;
  selectedPulseEl.style.top = `${point.y}px`;
  selectedPulseEl.hidden = false;
  selectedPulseEl.classList.remove("is-active");
  void selectedPulseEl.offsetWidth;
  selectedPulseEl.classList.add("is-active");
}

function initSelectedPulse() {
  const wrap = document.querySelector(".map-canvas-wrap");
  if (!wrap || selectedPulseEl) return;
  selectedPulseEl = document.createElement("span");
  selectedPulseEl.className = "selected-city-pulse";
  selectedPulseEl.hidden = true;
  selectedPulseEl.setAttribute("aria-hidden", "true");
  wrap.appendChild(selectedPulseEl);
  map.on("move", () => {
    if (!selectedCityId || selectedPulseEl.hidden) return;
    const city = coverage?.cities?.find((c) => c.id === selectedCityId);
    const lngLat = cityLngLat(city);
    if (lngLat) scheduleSelectedPulse(lngLat);
  });
}

function addCityLayers() {
  map.addSource(CITIES_SOURCE, {
    type: "geojson",
    data: EMPTY_FC,
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 48,
  });
  map.addSource(SELECTED_SOURCE, { type: "geojson", data: EMPTY_FC });
  map.addSource(CITY_BOUNDARY_SOURCE, { type: "geojson", data: EMPTY_FC });

  map.addLayer({
    id: "city-boundary-fill",
    type: "fill",
    source: CITY_BOUNDARY_SOURCE,
    layout: { visibility: "none" },
    paint: {
      "fill-color": "#e8c04a",
      "fill-opacity": 0.14,
    },
  });
  map.addLayer({
    id: "city-boundary-glow",
    type: "line",
    source: CITY_BOUNDARY_SOURCE,
    layout: { visibility: "none" },
    paint: {
      "line-color": "#e8c04a",
      "line-width": 6,
      "line-opacity": 0.18,
      "line-blur": 2,
    },
  });
  map.addLayer({
    id: "city-boundary-line",
    type: "line",
    source: CITY_BOUNDARY_SOURCE,
    layout: { visibility: "none" },
    paint: {
      "line-color": "#e8c04a",
      "line-width": 2.2,
      "line-opacity": 0.92,
    },
  });

  map.addLayer({
    id: "city-clusters",
    type: "circle",
    source: CITIES_SOURCE,
    filter: ["has", "point_count"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "rgba(46, 140, 96, 0.9)",
        10,
        "rgba(58, 176, 118, 0.95)",
        30,
        "rgba(78, 210, 140, 1)",
      ],
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#080c14",
    },
  });

  map.addLayer({
    id: "city-points",
    type: "circle",
    source: CITIES_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 9, 7, 12, 8],
      "circle-color": [
        "match",
        ["get", "pin_type"],
        "portal",
        "#2a9d6a",
        "#6ee7b7",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#080c14",
    },
  });

  map.addLayer({
    id: "selected-point",
    type: "circle",
    source: SELECTED_SOURCE,
    layout: { visibility: "visible" },
    paint: {
      "circle-radius": 10,
      "circle-color": "#f0ebe3",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#e8c04a",
    },
  });

  map.on("click", handleCityMapClick);
  map.on("mousemove", (e) => {
    updateCityClickCursor(e);
    if (!currentState) return;
    const { points } = queryCityFeaturesAt(e.point);
    const props = points[0]?.properties;
    if (props?.city) showMapTooltip(props.city, e.point);
    else hideMapTooltip();
  });
  map.getCanvas().addEventListener("mouseleave", () => {
    if (currentState) map.getCanvas().style.cursor = "";
    hideMapTooltip();
  });
}

function applyStats(data) {
  const portalLayer = data.layers?.portal || { total_cities: 0 };
  const completedLayer = data.layers?.completed || { total_cities: 0 };
  $("#stat-cities").textContent = data.total_cities;
  $("#stat-portal").textContent = portalLayer.total_cities;
  $("#stat-completed").textContent = completedLayer.total_cities;
}

let mapInitDone = false;
let mapMountTimeoutId = 0;

function finishMapInit(statesGeo) {
  if (mapInitDone) return;
  try {
    applyLower48Bounds(statesGeo);
    addStateLayers(statesGeo);
    addCityLayers();
    initMapTooltip();
    initSelectedPulse();
    initReferenceLabels();
    initSmallStateCallouts();
    initClusterLabels();
    mapInitDone = true;
    scheduleNationalHomeView(3);
    map.once("idle", () => scheduleNationalHomeView(1));
    syncDragPan();
    syncTerrainPeaksVisibility();
    window.clearTimeout(mapMountTimeoutId);
    setLoading(false);
    setMapReady(true);
    updateMapHint();
    showPanel("sidebar-empty");

    const params = new URLSearchParams(window.location.search);
    const openCity = params.get("city");
    if (openCity) {
      const city = coverage?.cities?.find((c) => c.id === openCity);
      if (city) selectCity(city);
    }
  } catch (err) {
    showMapError(err.message || "Map failed to render");
  }
}

async function fetchCoverageBootstrap() {
  if (window.PhugleeCoverageShared?.fetchCoverageMap) {
    return window.PhugleeCoverageShared.fetchCoverageMap();
  }
  const res = await fetch("/api/coverage/map");
  if (res.ok) return res.json();
  const staticFallback = await fetch("/data/coverage-map-bootstrap.json");
  if (staticFallback.ok) return staticFallback.json();
  const fallback = await fetch("/api/coverage");
  if (!fallback.ok) throw new Error(`Coverage API failed (${fallback.status}). Restart: python run_review_portal.py`);
  const full = await fallback.json();
  return {
    total_cities: full.total_cities,
    total_states: full.total_states,
    max_count: full.max_count,
    coords_exact: full.coords_exact,
    coords_approx: full.coords_approx,
    states: full.states,
    layers: {
      portal: { total_cities: full.layers?.portal?.total_cities ?? 0 },
      completed: { total_cities: full.layers?.completed?.total_cities ?? 0 },
    },
    cities: full.cities.map((c) => ({
      id: c.id,
      city: c.city,
      state: c.state,
      lat: c.lat,
      lng: c.lng,
      pin_type: c.pin_type,
      has_coords: c.has_coords,
      coords_exact: c.coords_exact,
    })),
  };
}

async function fetchStatesGeo() {
  const res = await fetch("/static/geo/us-states.geojson");
  if (!res.ok) throw new Error(`State boundaries missing (${res.status})`);
  const statesGeo = await res.json();
  stateFeatures = statesGeo.features;
  stateByName = new Map(statesGeo.features.map((f) => [f.properties.name, f]));
  return statesGeo;
}

async function fetchReferenceCities() {
  const res = await fetch("/static/geo/us-reference-cities.geojson");
  if (!res.ok) throw new Error(`Reference cities missing (${res.status})`);
  const geo = await res.json();
  referenceCities = geo.features || [];
  return geo;
}

async function initMap() {
  if (typeof maplibregl === "undefined") {
    showMapError("Map library failed to load. Hard-refresh the page (Ctrl+Shift+R).");
    return;
  }

  setLoading(true);
  updateMapHint();

  map = new maplibregl.Map({
    container: "map-canvas",
    style: buildDarkStyle(),
    center: US_HOME_CENTER,
    zoom: US_FIT_MIN_ZOOM + 0.4,
    minZoom: US_FIT_MIN_ZOOM,
    maxZoom: 12,
    maxBounds: LOWER_48_FALLBACK_BOUNDS,
    attributionControl: false,
    fadeDuration: 0,
    dragPan: true,
    dragRotate: false,
    touchPitch: false,
    touchRotate: false,
    boxZoom: false,
    keyboard: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  map.on("zoomstart", () => {
    zoomAtGestureStart = map.getZoom();
  });
  map.on("zoom", syncDragPan);
  map.on("zoomend", syncDragPan);
  map.on("moveend", syncDragPan);
  map.on("resize", () => {
    if (!mapInitDone || currentState) return;
    fitNationalHomeView();
  });

  let pendingStatesGeo = null;
  const tryMountLayers = () => {
    if (!pendingStatesGeo || !coverage || !map) return;
    if (!map.isStyleLoaded()) return;
    finishMapInit(pendingStatesGeo);
  };
  map.on("load", tryMountLayers);
  map.on("idle", tryMountLayers);
  mapMountTimeoutId = window.setTimeout(() => {
    if (mapInitDone) return;
    showMapError(
      "Map is taking too long to load. Hard-refresh (Ctrl+Shift+R), then restart the app with: python run_review_portal.py"
    );
  }, 20000);

  try {
    const [covData, statesGeo] = await Promise.all([
      fetchCoverageBootstrap(),
      fetchStatesGeo(),
      fetchReferenceCities(),
    ]);
    coverage = covData;
    applyStats(coverage);
    pendingStatesGeo = statesGeo;
    tryMountLayers();
  } catch (err) {
    showMapError(err.message || "Map failed to load");
    return;
  }

  $("#btn-reset-zoom")?.addEventListener("click", resetView);
  $("#btn-sidebar-back")?.addEventListener("click", resetView);
  $("#map-search")?.addEventListener("input", onSearchInput);
  document.addEventListener("keydown", handleKeyboard);
  window.PhugleeCityProfileModal?.prefetchImages?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}

window.CoverageMap = {
  showState,
  resetView,
  selectCity,
  showSearchResults,
};