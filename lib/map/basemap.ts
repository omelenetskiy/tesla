import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

/**
 * The basemap, built here instead of fetched.
 *
 * The previous map hot-linked `https://tiles.openfreemap.org/styles/positron` and paid
 * for it in three ways, all measured:
 *
 *  - the style document is 25 KB and must arrive before a single tile is requested, so
 *    it sits on the critical path of every cold open;
 *  - that style references a **sprite** (`sprites/ofm_f384/ofm`, 27 KB JSON + 49 KB PNG)
 *    and **glyphs** (`fonts/{fontstack}/{range}.pbf`, 76 KB for the first range alone).
 *    The sprite exists only to feed `icon-image` on road shields and POIs, which this
 *    product does not want;
 *  - a style server that does not answer looks exactly like a broken map, and there is
 *    nothing the client can do about it except say so.
 *
 * So the style is a local object: no style request, no sprite request, no icon layers.
 * Glyphs stay, because a map with no street names is the "almost nothing visible"
 * complaint in a different costume.
 *
 * The tile source is declared by `url`, not by a tile path. OpenFreeMap's TileJSON
 * answers `tiles: ["…/planet/20260906_080001_pt/{z}/{x}/{y}.pbf"]` — the tileset is
 * **republished under a dated path**, so hardcoding it works until the next weekly
 * build and then silently returns empty tiles. One 19 KB cached request buys a path that
 * cannot rot. That same TileJSON is what declares `maxzoom: 14`; above it MapLibre
 * overzooms, which is intended (a z15 request returns HTTP 200 with 0 bytes).
 */

export type BasemapMode = 'light' | 'dark'

export const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
export const LABEL_FONT = 'Noto Sans Regular'
export const BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors, © OpenFreeMap'

/** Native ceiling of the OpenFreeMap vector source, per its TileJSON. */
export const SOURCE_MAX_ZOOM = 14

type Palette = {
  background: string
  residential: string
  industrial: string
  wood: string
  grass: string
  park: string
  water: string
  waterway: string
  building: string
  roadMinorCasing: string
  roadMinor: string
  roadMidCasing: string
  roadMid: string
  roadHighCasing: string
  roadHigh: string
  boundary: string
  labelRoad: string
  labelPlace: string
  labelWater: string
  halo: string
}

const LIGHT: Palette = {
  background: '#f2f1ee',
  residential: '#eae5dc',
  industrial: '#e9e1de',
  wood: '#dbe6d5',
  grass: '#e6ecdf',
  park: '#d9e9d5',
  water: '#cbe0ec',
  waterway: '#b2d0e2',
  building: '#ddd8cf',
  roadMinorCasing: '#d8d3ca',
  roadMinor: '#ffffff',
  roadMidCasing: '#e3d3b8',
  roadMid: '#fdf4e6',
  roadHighCasing: '#d9bd8d',
  roadHigh: '#f7e0b4',
  boundary: '#b3ada4',
  labelRoad: '#6a6e75',
  labelPlace: '#3d434b',
  labelWater: '#4f7d9b',
  halo: '#f7f6f3',
}

const DARK: Palette = {
  background: '#171b21',
  residential: '#1d222a',
  industrial: '#232830',
  wood: '#1b241a',
  grass: '#1c241e',
  park: '#1e2a1e',
  water: '#11212c',
  waterway: '#1a3040',
  building: '#242b34',
  roadMinorCasing: '#101418',
  roadMinor: '#3a424e',
  roadMidCasing: '#222831',
  roadMid: '#4d5765',
  roadHighCasing: '#2b323c',
  roadHigh: '#77839a',
  boundary: '#3a424e',
  labelRoad: '#8d96a4',
  labelPlace: '#c4cbd5',
  labelWater: '#6f93aa',
  halo: '#171b21',
}

/**
 * Road classes as OpenMapTiles actually tags them.
 *
 * Matched by name rather than by a numeric rank because the schema promises no ordering:
 * an unrecognised `class` (a `ferry`, a `construction`) then draws nothing instead of
 * drawing as a motorway.
 */
const ROAD_HIGH = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link']
const ROAD_MID = ['secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential']
const ROAD_LOW = ['minor', 'minor_unclassified', 'service', 'pedestrian', 'track', 'path', 'steps', 'cycleway', 'footway']

function hasClass(values: string[]): ExpressionSpecification {
  return ['in', ['get', 'class'], ['literal', values]] as unknown as ExpressionSpecification
}

/** Width by zoom: a 1 px road vanishes at z16, a 6 px road turns a z12 view into soup. */
function roadWidth(ground: number, ceiling: number): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.55], ['zoom'], 11, ground, 17, ceiling] as unknown as ExpressionSpecification
}

function stops(pairs: Array<[number, number]>): ExpressionSpecification {
  return (['interpolate', ['linear'], ['zoom'], ...pairs.flatMap((pair) => pair)] as unknown) as ExpressionSpecification
}

const nameField = ['coalesce', ['get', 'name'], ''] as unknown as ExpressionSpecification

/**
 * Text-only label layers, so no `icon-image` is requested anywhere — which is what keeps
 * the 76 KB sprite out of the critical path. `text-optional` lets a label drop rather
 * than push a tile request or cover a road.
 */
function label(id: string, sourceLayer: string, size: number | ExpressionSpecification, color: string, halo: string, haloWidth: number, placement: 'point' | 'line', minzoom?: number): StyleSpecification['layers'][number] {
  return {
    id,
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': sourceLayer,
    ...(minzoom === undefined ? {} : { minzoom }),
    layout: {
      'text-field': nameField,
      'text-font': [LABEL_FONT],
      'text-size': size,
      'text-padding': placement === 'line' ? 6 : 8,
      'text-optional': true,
      ...(placement === 'line' ? { 'symbol-placement': 'line', 'text-max-angle': 30 } : {}),
    },
    paint: { 'text-color': color, 'text-halo-color': halo, 'text-halo-width': haloWidth },
  } as StyleSpecification['layers'][number]
}

export function buildBasemapStyle(mode: BasemapMode = 'light'): StyleSpecification {
  const p = mode === 'dark' ? DARK : LIGHT

  return {
    version: 8,
    // Deliberately absent: `sprite`.
    glyphs: GLYPHS_URL,
    sources: {
      openmaptiles: { type: 'vector', url: TILEJSON_URL },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.background } },

      {
        id: 'landuse-residential',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: hasClass(['residential']),
        minzoom: 10,
        paint: { 'fill-color': p.residential, 'fill-opacity': 0.85 },
      },
      {
        id: 'landuse-employment',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: hasClass(['industrial', 'commercial', 'retail', 'institution', 'railway', 'port']),
        minzoom: 10,
        paint: { 'fill-color': p.industrial, 'fill-opacity': 0.85 },
      },
      {
        id: 'landcover-wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: hasClass(['wood', 'forest']),
        paint: { 'fill-color': p.wood, 'fill-opacity': 0.8 },
      },
      {
        id: 'landcover-grass',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: hasClass(['grass', 'meadow', 'park', 'garden', 'vineyard', 'orchard', 'farmland']),
        paint: { 'fill-color': p.grass, 'fill-opacity': 0.7 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': p.park, 'fill-opacity': 0.8 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': p.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': p.waterway,
          'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 8, 0.5, 14, 2.4, 17, 5] as unknown as ExpressionSpecification,
        },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': p.building, 'fill-opacity': stops([[13, 0.55], [15, 0.9]]) },
      },

      {
        id: 'boundary-admin',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 6] as unknown as ExpressionSpecification,
        minzoom: 3,
        paint: { 'line-color': p.boundary, 'line-width': 0.9, 'line-dasharray': [3, 2], 'line-opacity': 0.7 },
      },

      // Low classes first, so a major road is never overdrawn by an alley.
      {
        id: 'road-low-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: hasClass(ROAD_LOW),
        minzoom: 12,
        paint: { 'line-color': p.roadMinorCasing, 'line-width': roadWidth(2.2, 5), 'line-opacity': 0.8 },
      },
      {
        id: 'road-low',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: hasClass(ROAD_LOW),
        minzoom: 12,
        paint: { 'line-color': p.roadMinor, 'line-width': roadWidth(0.6, 3.4) },
      },
      {
        id: 'road-mid-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: hasClass(ROAD_MID),
        minzoom: 10,
        paint: { 'line-color': p.roadMidCasing, 'line-width': roadWidth(2.5, 6.8), 'line-opacity': 0.8 },
      },
      {
        id: 'road-mid',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: hasClass(ROAD_MID),
        minzoom: 10,
        paint: { 'line-color': p.roadMid, 'line-width': roadWidth(0.9, 5.2) },
      },
      {
        id: 'road-high-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: hasClass(ROAD_HIGH),
        minzoom: 6,
        paint: { 'line-color': p.roadHighCasing, 'line-width': roadWidth(2.9, 8.6), 'line-opacity': 0.85 },
      },
      {
        id: 'road-high',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: hasClass(ROAD_HIGH),
        minzoom: 6,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadHigh, 'line-width': roadWidth(1.3, 7) },
      },

      label('label-waterway', 'waterway', 11, p.labelWater, p.halo, 1.2, 'line', 12),
      label('label-road', 'transportation_name', stops([[12.5, 10], [17, 13]]), p.labelRoad, p.halo, 1.4, 'line', 12.5),
      label('label-place', 'place', stops([[6, 11], [14, 15]]), p.labelPlace, p.halo, 1.8, 'point'),
    ],
  }
}
