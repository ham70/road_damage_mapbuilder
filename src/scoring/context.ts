import { isTime } from '../parse/csv';
import type { Series, Track } from '../data_model/track';
import { MissingColumnError, type PerPointOptions, type Reducer, type ScoreContext } from './types';

const norm = (s: string) => s.trim().toLowerCase();
/** "X (m/s^2)" → "x"; also drops a "(file.csv)" suffix added on name collisions. */
const stripUnits = (s: string) => norm(s).replace(/(\s*\([^)]*\))+$/, '');

/** Split "Accelerometer: X" into a file prefix and a column name. */
function splitQualified(query: string): { file: string | null; column: string } {
  const at = query.indexOf(':');
  if (at < 0) return { file: null, column: query };
  return { file: norm(query.slice(0, at)), column: query.slice(at + 1) };
}

/**
 * First item whose name matches exactly (ignoring case). A query without a unit ('Velocity')
 * also matches names that have one ('Velocity (m/s)'); a query with a unit must match it.
 */
function findByName<T>(items: T[], query: string, nameOf: (t: T) => string, fileOf: (t: T) => string): T | undefined {
  const { file, column } = splitQualified(query);
  const pool = file === null ? items : items.filter((t) => norm(fileOf(t)).startsWith(file));
  const q = norm(column);
  const exact = pool.find((t) => norm(nameOf(t)) === q);
  if (exact || stripUnits(q) !== q) return exact;
  return pool.find((t) => stripUnits(nameOf(t)) === q);
}

/** Index of the first element of the ascending array `xs` that is ≥ x. */
function lowerBound(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** [start, end) time window of every track point; null where the point has no time. */
export function pointWindows(
  time: (number | null)[],
  { minHalfWidth = 0.25, maxHalfWidth = 2 }: PerPointOptions = {},
): ([number, number] | null)[] {
  const clamp = (h: number) => Math.min(maxHalfWidth, Math.max(minHalfWidth, h));
  return time.map((t, i) => {
    if (t === null) return null;
    const prev = time[i - 1] ?? null;
    const next = time[i + 1] ?? null;
    const before = prev !== null ? (t - prev) / 2 : next !== null ? (next - t) / 2 : maxHalfWidth;
    const after = next !== null ? (next - t) / 2 : before;
    return [t - clamp(before), t + clamp(after)];
  });
}

export function createScoreContext(track: Track, series: Series[]): ScoreContext {
  const timeMetric = track.metrics.find((m) => isTime(m.name));
  const time = timeMetric ? timeMetric.values : track.lat.map(() => null);
  const length = track.lat.length;

  const findSeries = (name: string) => findByName(series, name, (s) => s.name, (s) => s.file);
  const findColumn = (name: string) => {
    if (splitQualified(name).file === null) return findByName(track.metrics, name, (m) => m.name, () => '');
    // Resampled metrics don't record their file, so resolve the file prefix through the raw series.
    const s = findSeries(name);
    return s && track.metrics.find((m) => m.name === s.name || m.name === `${s.name} (${s.file})`);
  };

  const ctx: ScoreContext = {
    length,
    time,
    lat: track.lat,
    lon: track.lon,

    series(name) {
      const found = findSeries(name);
      if (!found) throw new MissingColumnError(name);
      return found;
    },

    column(name) {
      const found = findColumn(name);
      if (!found) throw new MissingColumnError(name);
      return found.values;
    },

    has(name) {
      return findSeries(name) !== undefined || findColumn(name) !== undefined;
    },

    perPoint(s, reduce: Reducer, options) {
      return pointWindows(time, options).map((w) => {
        if (!w) return null;
        const start = lowerBound(s.time, w[0]);
        const end = lowerBound(s.time, w[1]);
        if (end <= start) return null;
        const value = reduce(s.values.slice(start, end));
        return Number.isFinite(value) ? value : null;
      });
    },
  };
  return ctx;
}
