/**
 * Building blocks for scoring functions: derive new native-rate series from raw ones, then
 * collapse them per track point with `ctx.perPoint(series, reducer)`.
 */
import { rollingMedian } from '../metrics/stats';
import type { Reducer, Series } from './types';

/** Values of `s` linearly interpolated at `times` (ascending); clamped at the ends. */
function valuesAt(s: Series, times: number[]): number[] {
  const out: number[] = [];
  let j = 0;
  for (const t of times) {
    while (j + 1 < s.time.length && (s.time[j + 1] as number) <= t) j++;
    const t0 = s.time[j] as number;
    const t1 = s.time[j + 1];
    const v0 = s.values[j] as number;
    if (t1 === undefined || t <= t0) out.push(v0);
    else out.push(v0 + (((s.values[j + 1] as number) - v0) * (t - t0)) / (t1 - t0));
  }
  return out;
}

const sameTimes = (a: Series, b: Series) =>
  a.time === b.time || (a.time.length === b.time.length && a.time.every((t, i) => t === b.time[i]));

/**
 * Combine several series sample by sample, on the first series' timestamps. Columns from the
 * same file line up exactly; others are interpolated onto the first.
 *   combine((x, y) => x - y, ctx.series('X'), ctx.series('Y'))
 */
export function combine(fn: (...values: number[]) => number, first: Series, ...rest: Series[]): Series {
  const aligned = rest.map((s) => (sameTimes(first, s) ? s.values : valuesAt(s, first.time)));
  const values = first.values.map((v, i) => fn(v, ...aligned.map((a) => a[i] as number)));
  return { file: first.file, name: 'combined', time: first.time, values };
}

/** Apply `fn` to every sample. */
export function map(s: Series, fn: (value: number, time: number) => number): Series {
  return { ...s, values: s.values.map((v, i) => fn(v, s.time[i] as number)) };
}

/** Euclidean length per sample, e.g. total acceleration from X, Y, Z. */
export function magnitude(...components: [Series, ...Series[]]): Series {
  const [first, ...rest] = components;
  return { ...combine(Math.hypot, first, ...rest), name: 'magnitude' };
}

/** Rate of change per second (e.g. jerk from acceleration). Stamped at each later sample. */
export function derivative(s: Series): Series {
  const time: number[] = [];
  const values: number[] = [];
  for (let i = 1; i < s.time.length; i++) {
    const dt = (s.time[i] as number) - (s.time[i - 1] as number);
    if (dt <= 0) continue;
    time.push(s.time[i] as number);
    values.push(((s.values[i] as number) - (s.values[i - 1] as number)) / dt);
  }
  return { ...s, time, values };
}

/** Typical seconds between samples (median spacing). */
export function samplePeriod(s: Series): number {
  const gaps: number[] = [];
  for (let i = 1; i < s.time.length; i++) gaps.push((s.time[i] as number) - (s.time[i - 1] as number));
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1] ?? NaN;
}

/**
 * Subtract a centered rolling median spanning about `seconds`. Removes gravity and slow changes
 * (braking, hills, phone tilt) and leaves short jolts.
 */
export function detrend(s: Series, seconds = 1): Series {
  const period = samplePeriod(s);
  const window = Number.isFinite(period) && period > 0 ? Math.max(3, Math.round(seconds / period) | 1) : 3;
  const baseline = rollingMedian(s.values, window);
  return { ...s, values: s.values.map((v, i) => v - (baseline[i] as number)) };
}

// Loops rather than Math.max(...vs): spreading a large window can overflow the call stack.
const maxOf = (vs: number[]) => vs.reduce((a, b) => (b > a ? b : a), -Infinity);
const minOf = (vs: number[]) => vs.reduce((a, b) => (b < a ? b : a), Infinity);

/** Reducers for `ctx.perPoint`. All receive a non-empty array. */
export const reduce = {
  max: maxOf,
  min: minOf,
  maxAbs: (vs) => vs.reduce((a, b) => Math.max(a, Math.abs(b)), 0),
  mean: (vs) => vs.reduce((a, b) => a + b, 0) / vs.length,
  rms: (vs) => Math.sqrt(vs.reduce((a, b) => a + b * b, 0) / vs.length),
  std: (vs) => {
    const m = vs.reduce((a, b) => a + b, 0) / vs.length;
    return Math.sqrt(vs.reduce((a, b) => a + (b - m) ** 2, 0) / vs.length);
  },
  range: (vs) => maxOf(vs) - minOf(vs),
} satisfies Record<string, Reducer>;
