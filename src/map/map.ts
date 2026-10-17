import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// Bundlers rewrite maplibre's internal worker URL; point it at the emitted asset explicitly.
maplibregl.setWorkerUrl(workerUrl);

export type Basemap = 'light' | 'dark';

const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';

/** Basemap style URLs; VITE_MAP_STYLE_URL overrides both variants. */
export const MAP_STYLES: Record<Basemap, string> = {
  light: import.meta.env.VITE_MAP_STYLE_URL ?? OPENFREEMAP_LIGHT,
  dark: import.meta.env.VITE_MAP_STYLE_URL ?? OPENFREEMAP_DARK,
};

export function initMap(container: HTMLElement, basemap: Basemap = 'light'): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLES[basemap],
    center: [0, 20],
    zoom: 1.5,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  return map;
}
