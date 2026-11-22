import type { Series } from '../data_model/track';

export type { Series };

/** Collapses the raw samples that fall in one track point's time window into one number. */
export type Reducer = (values: number[]) => number;

export interface PerPointOptions {
  /** Each window reaches at least this far (s) either side of its point. Default 0.25. */
  minHalfWidth?: number;
  /** ...and at most this far, so GPS dropouts don't swallow minutes of data. Default 2. */
  maxHalfWidth?: number;
}

/** Everything a scoring function can read. Lookups throw `MissingColumnError` when absent. */
export interface ScoreContext {
  /** Number of track points; a score must return exactly this many values. */
  readonly length: number;
  /** Time (s) of each track point (null where the CSV had none). */
  readonly time: (number | null)[];
  readonly lat: number[];
  readonly lon: number[];

  /**
   * A raw column at its native sample rate. Names are matched case-insensitively, with or
   * without the unit: 'Y', 'y (m/s^2)'. Prefix a file name to pick between files that share a
   * header: 'Accelerometer: X' (matches files whose name starts with "Accelerometer").
   */
  series(name: string): Series;
  /** A column already resampled onto the track points (same lookup rules as `series`). */
  column(name: string): (number | null)[];
  /** Whether `series`/`column` would find `name`. Use for optional inputs. */
  has(name: string): boolean;
  /**
   * Turn a native-rate series into one value per track point. Each point's window runs from
   * halfway to the previous point to halfway to the next (clamped by `options`), so samples are
   * shared out between points and short spikes are kept, unlike `column`, which interpolates.
   * A window with no samples gives null.
   */
  perPoint(series: Series, reduce: Reducer, options?: PerPointOptions): (number | null)[];
}

/** A pluggable score. Put one per file in src/scoring/scorers/ as the default export. */
export interface ScoringFunction {
  /** Name shown in the "Color by" menu and the legend. */
  label: string;
  /** One sentence shown under the legend title. */
  description?: string;
  /** One value per track point (higher = rougher by convention). Non-finite values become null. */
  compute(ctx: ScoreContext): (number | null)[];
}

/** Thrown by context lookups; the score is hidden for this file set instead of reported as broken. */
export class MissingColumnError extends Error {
  readonly column: string;
  constructor(column: string) {
    super(`needs column "${column}"`);
    this.name = 'MissingColumnError';
    this.column = column;
  }
}

/** Identity helper so scorer files get type checking and autocompletion. */
export function defineScorer(scorer: ScoringFunction): ScoringFunction {
  return scorer;
}
