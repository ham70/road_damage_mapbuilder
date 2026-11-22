import { initMap } from './map/map';
import {
  fitToTrack,
  segmentsToGeoJSON,
  setBumpEvents,
  setBumpsVisible,
  setSegments,
} from './map/trackLayer';
import { createColorFn, DEFAULT_PALETTE } from './color/scale';
import { dataRange, percentileDomain, rollingMedian } from './metrics/stats';
import { buildSegments } from './data_model/segments';
import { ParseError, type MetricColumn, type Track } from './data_model/track';
import { renderLegend } from './ui/legend';
import { parseCsvFiles } from './parse/csv';
import { setStatus, setupFileInput, setupMetricControls, type ControlState } from './ui/controls';
import { computeScores } from './scoring/registry';

const container = document.getElementById('map');
const input = document.getElementById('file-input') as HTMLInputElement | null;
const status = document.getElementById('status');
if (!container || !input || !status) throw new Error('Missing required page elements');

const legend = document.getElementById('legend');
if (!legend) throw new Error('Missing #legend element');
const map = initMap(container);

/** What the "Color by" menu offers: computed scores first, then the raw CSV columns. */
let current: { track: Track; layers: MetricColumn[] } | null = null;
let state: ControlState = { metricIndex: 0, smoothing: false, window: 5 };

/** Smoothing affects color only; geometry always uses the raw track. */
function render({ track, layers }: NonNullable<typeof current>, { metricIndex, smoothing, window }: ControlState): void {
  const metric = layers[metricIndex];
  if (!metric) return;
  const values = smoothing ? rollingMedian(metric.values, window) : metric.values;
  const domain = percentileDomain(values);
  if (!domain) {
    throw new ParseError(`Column "${metric.name}" has no values to color.`);
  }
  const opts = { palette: DEFAULT_PALETTE, domain, invert: false };
  const segments = buildSegments(track, values);
  setSegments(map, segmentsToGeoJSON(segments, createColorFn(opts)));
  renderLegend(legend as HTMLElement, metric.name, opts.palette, opts.invert, domain, dataRange(values), metric.description);
}

const controls = setupMetricControls(
  document.getElementById('metric') as HTMLSelectElement,
  document.getElementById('smooth') as HTMLInputElement,
  document.getElementById('window') as HTMLInputElement,
  (next) => {
    state = next;
    if (!current) return;
    try {
      render(current, state);
    } catch (e) {
      setStatus(status as HTMLElement, e instanceof Error ? e.message : String(e), true);
    }
  },
);

const showBumps = document.getElementById('show-bumps') as HTMLInputElement;
showBumps.addEventListener('change', () => setBumpsVisible(map, showBumps.checked));

async function loadFiles(files: File[]): Promise<void> {
  const label = files.map((f) => f.name).join(', ');
  setStatus(status as HTMLElement, `Loading ${label}…`);
  try {
    const { track, dropped, skipped, bumpEvents, series } = await parseCsvFiles(files);
    const { scores, unavailable, failed } = computeScores(track, series);
    current = { track, layers: [...scores, ...track.metrics] };
    controls.setMetrics([
      { label: 'Scores', names: scores.map((m) => m.name) },
      { label: 'Raw columns', names: track.metrics.map((m) => m.name) },
    ]);
    state = { metricIndex: 0, smoothing: false, window: 5 };
    (document.getElementById('controls') as HTMLElement).hidden = false;
    render(current, state);
    setBumpEvents(map, bumpEvents);
    fitToTrack(map, track);
    const notes = [`${track.lat.length} points`, `${scores.length} scores`];
    if (failed.length) notes.push(`score errors: ${failed.map((f) => `${f.label} (${f.reason})`).join('; ')}`);
    if (unavailable.length) {
      notes.push(`${unavailable.length} scores unavailable for these files (see console)`);
      console.info('Unavailable scores:', unavailable.map((u) => `${u.label}: ${u.reason}`).join('\n'));
    }
    failed.forEach((f) => console.error(`Score "${f.label}" failed: ${f.reason}`));
    if (bumpEvents.length) notes.push(`${bumpEvents.length} candidate spikes marked`);
    if (dropped.length) {
      const first = dropped[0];
      notes.push(`${dropped.length} rows dropped (first: line ${first?.row}, ${first?.reason})`);
    }
    if (skipped.length) notes.push(`skipped columns: ${skipped.map((s) => s.name).join(', ')}`);
    setStatus(status as HTMLElement, notes.join(' · '));
  } catch (e) {
    const msg = e instanceof ParseError ? e.message : `Could not load ${label}: ${String(e)}`;
    setStatus(status as HTMLElement, msg, true);
  }
}

setupFileInput(container, input, (fs) => void loadFiles(fs));
