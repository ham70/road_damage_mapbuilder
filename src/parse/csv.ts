import Papa from 'papaparse';
import {
  ParseError,
  type DroppedRow,
  type MetricColumn,
  type ParseResult,
  type SkippedColumn,
} from '../data_model/track';
import type { WorkerRequest, WorkerResponse } from './csv.worker';

/** A column is a score column when at least this share of non-empty values are numeric. */
export const MIN_NUMERIC_RATIO = 0.9;

/** Parse a cell as a finite number; empty cells are `null`, non-numeric text is `NaN`. */
export function parseCell(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const norm = (h: string | undefined) => (h ?? '').trim().toLowerCase();
export const isTime = (h: string | undefined) => norm(h) === 'time (s)';
// "lat"/"latitude" and "long"/"longitude", each with an optional unit suffix such as "(°)".
export const isLat = (h: string | undefined) => /^(lat|latitude)(\s*\(.*\))?$/.test(norm(h));
export const isLong = (h: string | undefined) => /^(long|longitude)(\s*\(.*\))?$/.test(norm(h));

function coordinateProblem(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return 'missing latitude or longitude';
  if (Number.isNaN(lat) || Number.isNaN(lon)) return 'non-numeric latitude or longitude';
  if (Math.abs(lat) > 90) return `latitude ${lat} out of range`;
  if (Math.abs(lon) > 180) return `longitude ${lon} out of range`;
  if (lat === 0 && lon === 0) return 'coordinates are exactly 0,0';
  return null;
}

/**
 * Convert parsed CSV rows (header first) into a Track.
 * The first three columns must be `Time (s)`, latitude and longitude; every later column is a
 * candidate score. Time is kept as the last metric column. With `allowNoScores`, a file with
 * only time/lat/long is accepted (its scores come from merged sensor files).
 */
export function parseRows(rows: string[][], { allowNoScores = false } = {}): ParseResult {
  const header = rows[0]?.map((h) => h.trim());
  if (!header || header.every((h) => h === '')) throw new ParseError('The file is empty.');
  if (!isTime(header[0]) || !isLat(header[1]) || !isLong(header[2])) {
    throw new ParseError(
      `The first three columns must be "Time (s)", "Latitude (°)" and "Longitude (°)", but found "${header[0] ?? ''}", "${header[1] ?? ''}" and "${header[2] ?? ''}".`,
    );
  }

  const time: (number | null)[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const lineNumbers: number[] = [];
  const raw: (number | null)[][] = header.slice(3).map(() => []);
  const dropped: DroppedRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const line = i + 1;
    const la = parseCell(cells[1]);
    const lo = parseCell(cells[2]);
    const problem = coordinateProblem(la, lo);
    if (problem) {
      dropped.push({ row: line, reason: problem });
      continue;
    }
    time.push(parseCell(cells[0]));
    lat.push(la as number);
    lon.push(lo as number);
    lineNumbers.push(line);
    raw.forEach((col, c) => col.push(parseCell(cells[c + 3])));
  }

  if (lat.length === 0) {
    throw new ParseError(`No valid rows found (${dropped.length} dropped).`);
  }

  const metrics: MetricColumn[] = [];
  const skipped: SkippedColumn[] = [];
  raw.forEach((col, c) => {
    const name = header[c + 3] || `column ${c + 4}`;
    const nonEmpty = col.filter((v) => v !== null);
    const numeric = nonEmpty.filter((v) => !Number.isNaN(v)).length;
    if (nonEmpty.length === 0) {
      skipped.push({ name, reason: 'no values' });
    } else if (numeric / nonEmpty.length < MIN_NUMERIC_RATIO) {
      skipped.push({ name, reason: 'not numeric' });
    } else {
      metrics.push({ name, values: col.map((v) => (v === null || Number.isNaN(v) ? null : v)) });
    }
  });

  if (metrics.length === 0 && !allowNoScores) {
    throw new ParseError('No numeric score columns found after "Time (s)", latitude and longitude.');
  }

  if (!time.some((t) => t !== null && !Number.isNaN(t))) {
    throw new ParseError(`"${header[0]}" has no numeric values.`);
  }
  metrics.push({ name: header[0] as string, values: time.map((v) => (v === null || Number.isNaN(v) ? null : v)) });

  return { track: { lat, lon, metrics, rows: lineNumbers }, dropped, skipped };
}

/** Parse CSV text synchronously (small inputs, tests). */
export function parseCsvText(text: string): ParseResult {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return parseRows(result.data);
}

/**
 * Parse user-selected files off the main thread (own worker; PapaParse's worker mode breaks under bundlers).
 * One file must start with `Time (s)`, latitude, longitude; several files are merged on their "Time (s)" column.
 */
export async function parseCsvFiles(files: File[]): Promise<ParseResult> {
  const request: WorkerRequest = await Promise.all(
    files.map(async (f) => ({ name: f.name, text: await f.text() })),
  );
  const worker = new Worker(new URL('./csv.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<ParseResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.ok) resolve(e.data.result);
        else reject(e.data.isParseError ? new ParseError(e.data.message) : new Error(e.data.message));
      };
      worker.onerror = (e) => reject(new Error(`CSV worker failed: ${e.message}`));
      worker.postMessage(request);
    });
  } finally {
    worker.terminate();
  }
}
