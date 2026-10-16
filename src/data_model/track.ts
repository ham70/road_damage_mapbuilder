/** One numeric score column. `null` marks a missing value in an otherwise valid row. */
export interface MetricColumn {
  name: string;
  values: (number | null)[];
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

export interface ParseResult {
  track: Track;
  dropped: DroppedRow[];
  skipped: SkippedColumn[];
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