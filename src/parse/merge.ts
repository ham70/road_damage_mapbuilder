import Papa from 'papaparse';
import {
  ParseError,
  type DroppedRow,
  type MetricColumn,
  type ParseResult,
  type SkippedColumn,
} from '../data_model/track';
import { MIN_NUMERIC_RATIO, isLat, isLong, isTime, parseCell, parseRows } from './csv';
import { detectBumpEvents, type AccelerationSample, type GpsSample } from '../metrics/bumps';

export interface NamedCsv {
  name: string;
  text: string;
}

export interface NamedTable {
  name: string;
  rows: string[][];
}

function detectBumps(tables: NamedTable[]): ReturnType<typeof detectBumpEvents> {
  let accelerationTable: { table: NamedTable; time: number; x: number; y: number; z: number } | undefined;
  let gpsTable: { table: NamedTable; time: number; lat: number; lon: number } | undefined;
  for (const table of tables) {
    const header = table.rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
    const time = header.findIndex(isTime);
    const x = header.indexOf('x (m/s^2)');
    const y = header.indexOf('y (m/s^2)');
    const z = header.indexOf('z (m/s^2)');
    if (time >= 0 && x >= 0 && y >= 0 && z >= 0) accelerationTable = { table, time, x, y, z };

    const lat = header.findIndex(isLat);
    const lon = header.findIndex(isLong);
    if (time >= 0 && lat >= 0 && lon >= 0) gpsTable = { table, time, lat, lon };
  }
  if (!accelerationTable || !gpsTable) return [];

  const acceleration: AccelerationSample[] = [];
  for (const row of accelerationTable.table.rows.slice(1)) {
    const cells = row ?? [];
    const time = parseCell(cells[accelerationTable.time]);
    const x = parseCell(cells[accelerationTable.x]);
    const y = parseCell(cells[accelerationTable.y]);
    const z = parseCell(cells[accelerationTable.z]);
    if ([time, x, y, z].every((value) => value !== null && Number.isFinite(value))) {
      acceleration.push({ time: time as number, x: x as number, y: y as number, z: z as number });
    }
  }

  const gps: GpsSample[] = [];
  for (const row of gpsTable.table.rows.slice(1)) {
    const cells = row ?? [];
    const time = parseCell(cells[gpsTable.time]);
    const latitude = parseCell(cells[gpsTable.lat]);
    const longitude = parseCell(cells[gpsTable.lon]);
    if (
      time !== null && Number.isFinite(time) &&
      latitude !== null && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
      longitude !== null && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ) {
      gps.push({ time, latitude, longitude });
    }
  }
  return detectBumpEvents(acceleration, gps);
}

/** Header (trimmed) of a table, or an error naming the file if it doesn't start with "Time (s)". */
function headerOf(t: NamedTable): string[] {
  const header = t.rows[0]?.map((h) => h.trim());
  if (!header || header.every((h) => h === '')) throw new ParseError(`${t.name}: the file is empty.`);
  if (!isTime(header[0])) {
    throw new ParseError(`${t.name}: the first column must be "Time (s)", but found "${header[0] ?? ''}".`);
  }
  return header;
}

/**
 * Linear interpolation of (xs, ys) at x. `xs` must be ascending. Returns null outside the
 * sampled range: sensors are never extrapolated.
 */
export function interpolateAt(xs: number[], ys: number[], x: number): number | null {
  const n = xs.length;
  if (n === 0 || x < (xs[0] as number) || x > (xs[n - 1] as number)) return null;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  const x1 = xs[lo] as number;
  const y1 = ys[lo] as number;
  if (x1 === x || lo === 0) return y1;
  const x0 = xs[lo - 1] as number;
  const y0 = ys[lo - 1] as number;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/** Resample every score column of a sensor file onto the base timeline. */
function resampleTable(
  t: NamedTable,
  header: string[],
  baseTimes: (number | null)[],
  taken: Set<string>,
  dropped: DroppedRow[],
  skipped: SkippedColumn[],
): MetricColumn[] {
  const times: number[] = [];
  const cols: (number | null)[][] = header.slice(1).map(() => []);
  for (let i = 1; i < t.rows.length; i++) {
    const cells = t.rows[i] ?? [];
    const time = parseCell(cells[0]);
    if (time === null || Number.isNaN(time)) {
      dropped.push({ row: i + 1, reason: `${t.name}: missing or non-numeric time` });
      continue;
    }
    const prev = times[times.length - 1];
    if (prev !== undefined && time < prev) {
      throw new ParseError(`${t.name}: time goes backwards at line ${i + 1} (${time} after ${prev}).`);
    }
    times.push(time);
    cols.forEach((col, c) => col.push(parseCell(cells[c + 1])));
  }

  const metrics: MetricColumn[] = [];
  cols.forEach((col, c) => {
    const raw = header[c + 1] || `column ${c + 2}`;
    const label = `${t.name}: ${raw}`;
    const nonEmpty = col.filter((v) => v !== null);
    const numeric = nonEmpty.filter((v) => !Number.isNaN(v)).length;
    if (nonEmpty.length === 0) return void skipped.push({ name: label, reason: 'no values' });
    if (numeric / nonEmpty.length < MIN_NUMERIC_RATIO) {
      return void skipped.push({ name: label, reason: 'not numeric' });
    }
    const xs: number[] = [];
    const ys: number[] = [];
    col.forEach((v, i) => {
      if (v !== null && !Number.isNaN(v)) {
        xs.push(times[i] as number);
        ys.push(v);
      }
    });
    const values = baseTimes.map((bt) => (bt === null ? null : interpolateAt(xs, ys, bt)));
    if (values.every((v) => v === null)) {
      return void skipped.push({ name: label, reason: 'no overlap with the lat/long time range' });
    }
    const name = taken.has(raw) ? `${raw} (${t.name})` : raw;
    taken.add(name);
    metrics.push({ name, values });
  });
  return metrics;
}

/**
 * Merge several time-series tables. Every table starts with "Time (s)"; exactly one also has
 * `lat`, `long` right after it and defines the track's points and order. The other tables
 * (sensors with their own sample rates) are linearly interpolated onto those point times.
 */
export function mergeTables(tables: NamedTable[]): ParseResult {
  const headers = tables.map(headerOf);
  const geoIdx = headers.flatMap((h, i) => (isLat(h[1]) && isLong(h[2]) ? [i] : []));
  if (geoIdx.length === 0) {
    throw new ParseError('None of the files has latitude and longitude columns ("Latitude (°)", "Longitude (°)") right after "Time (s)".');
  }
  if (geoIdx.length > 1) {
    const names = geoIdx.map((i) => (tables[i] as NamedTable).name).join(', ');
    throw new ParseError(`Only one file may contain latitude and longitude columns, but found them in: ${names}.`);
  }

  const base = tables[geoIdx[0] as number] as NamedTable;
  const baseHeader = headers[geoIdx[0] as number] as string[];
  const timeName = baseHeader[0] as string;
  let result: ParseResult;
  try {
    result = parseRows(base.rows, { allowNoScores: true });
  } catch (e) {
    if (e instanceof ParseError) throw new ParseError(`${base.name}: ${e.message}`);
    throw e;
  }
  const timeMetric = result.track.metrics[result.track.metrics.length - 1];
  if (!timeMetric || timeMetric.name !== timeName) {
    throw new ParseError(`${base.name}: "${timeName}" has no numeric values.`);
  }

  const dropped = [...result.dropped];
  const skipped = [...result.skipped];
  const metrics = [...result.track.metrics];
  const taken = new Set(metrics.map((m) => m.name));
  tables.forEach((t, i) => {
    if (i === geoIdx[0]) return;
    metrics.push(...resampleTable(t, headers[i] as string[], timeMetric.values, taken, dropped, skipped));
  });

  return { track: { ...result.track, metrics }, dropped, skipped, bumpEvents: detectBumps(tables) };
}

/** Parse and merge CSV texts (small inputs, tests, worker). */
export function parseMergedCsvTexts(files: NamedCsv[]): ParseResult {
  return mergeTables(
    files.map((f) => ({ name: f.name, rows: Papa.parse<string[]>(f.text, { skipEmptyLines: true }).data })),
  );
}
