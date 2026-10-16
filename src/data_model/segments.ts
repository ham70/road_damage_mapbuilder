import { haversine } from '../metrics/geo';
import type { Track } from './track';

/** Default maximum distance between consecutive points before the line is broken. */
export const DEFAULT_GAP_METERS = 200;

export interface Segment {
  /** Index of the segment's first point in the track. */
  index: number;
  from: [number, number];
  to: [number, number];
  /** Mean of the two endpoint values, or null if either is missing. */
  value: number | null;
}

/**
 * One segment per consecutive point pair. Pairs farther apart than `gapMeters` are skipped
 * so GPS dropouts don't draw straight lines.
 */
export function buildSegments(
  track: Track,
  values: (number | null)[],
  gapMeters = DEFAULT_GAP_METERS,
): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i + 1 < track.lat.length; i++) {
    const la1 = track.lat[i] as number;
    const lo1 = track.lon[i] as number;
    const la2 = track.lat[i + 1] as number;
    const lo2 = track.lon[i + 1] as number;
    if (haversine(la1, lo1, la2, lo2) > gapMeters) continue;
    const a = values[i] ?? null;
    const b = values[i + 1] ?? null;
    segments.push({
      index: i,
      from: [lo1, la1],
      to: [lo2, la2],
      value: a === null || b === null ? null : (a + b) / 2,
    });
  }
  return segments;
}
