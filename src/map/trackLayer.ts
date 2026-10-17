import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { trackBounds, type Track } from '../data_model/track';
import type { Segment } from '../data_model/segments';

const SOURCE = 'track';
const CASING = 'track-casing';
const LINE = 'track-line';
const FIT_PADDING = 48;

/** One LineString feature per segment, colored via the precomputed `color` property. */
export function segmentsToGeoJSON(
  segments: Segment[],
  colorFn: (value: number | null) => string,
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = segments.map((s) => ({
    type: 'Feature',
    properties: { index: s.index, value: s.value, color: colorFn(s.value) },
    geometry: { type: 'LineString', coordinates: [s.from, s.to] },
  }));
  return { type: 'FeatureCollection', features };
}

function widthByZoom(scale: number): never {
  // MapLibre's expression types are not worth modelling here.
  return ['interpolate', ['linear'], ['zoom'], 8, 1.5 * scale, 14, 4 * scale, 18, 8 * scale] as never;
}

function addLayers(map: MapLibreMap, data: FeatureCollection<LineString>): void {
  // Every segment is its own tiny feature. With the default tolerance, geojson-vt drops any line
  // shorter than the tolerance at low zooms, which punches holes in the track when zoomed out.
  map.addSource(SOURCE, { type: 'geojson', data, tolerance: 0 });
  map.addLayer({
    id: CASING,
    type: 'line',
    source: SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#000000', 'line-opacity': 0.35, 'line-width': widthByZoom(1.6) },
  });
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': widthByZoom(1) },
  });
}

/** Draw the segments (replacing any previous ones). */
export function setSegments(map: MapLibreMap, data: FeatureCollection<LineString>): void {
  const apply = () => {
    const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else addLayers(map, data);
  };
  if (map.isStyleLoaded()) apply();
  else map.once('load', apply);
}

export function fitToTrack(map: MapLibreMap, track: Track): void {
  map.fitBounds(trackBounds(track), { padding: FIT_PADDING, duration: 600 });
}
