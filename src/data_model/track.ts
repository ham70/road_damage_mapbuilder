/** One numeric score column. `null` marks a missing value in an otherwise valid row. */
export interface MetricColumn {
  name: string;
  values: (number | null)[];
  /** Optional explanation shown under the legend title (used by scores). */
  description?: string;
}

/**
 * One raw CSV column at its native sample rate (not resampled onto the track). Only finite
 * values are kept, and `time` is ascending.
 */
export interface Series {
  /** Source file name, e.g. "Accelerometer.csv" ('' when unknown). */
  file: string;
  /** Column header as written in the file, e.g. "X (m/s^2)". */
  name: string;
  time: number[];
  values: number[];
}

/** Column-oriented track; index i across lat/lon/metrics/rows refers to the same point. */
export interface Track {
  lat: number[];
  lon: number[];
  metrics: MetricColumn[];
  /** 1-based line number in the source file (header is line 1). */
  rows: number[];
}

export interface DroppedRow {
  row: number;
  reason: string;
}

export interface SkippedColumn {
  name: string;
  reason: string;
}

/** A candidate accelerometer spike associated with a nearby GPS sample. */
export interface BumpEvent {
  time: number;
  magnitude: number;
  excess: number;
  latitude: number;
  longitude: number;
  gpsTime: number;
  gpsDelta: number;
}

export interface ParseResult {
  track: Track;
  dropped: DroppedRow[];
  skipped: SkippedColumn[];
  bumpEvents: BumpEvent[];
  /** Every numeric column of every file at its native rate, for scoring functions. */
  series: Series[];
}

/** User-facing parse failure with a specific message. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** [[west, south], [east, north]] bounding box of all points. */
export function trackBounds(track: Track): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (let i = 0; i < track.lat.length; i++) {
    const la = track.lat[i] as number;
    const lo = track.lon[i] as number;
    if (lo < w) w = lo;
    if (lo > e) e = lo;
    if (la < s) s = la;
    if (la > n) n = la;
  }
  return [[w, s], [e, n]];
}