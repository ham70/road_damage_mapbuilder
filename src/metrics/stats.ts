export interface Domain {
  min: number;
  max: number;
}

/** Linear-interpolated percentile (p in 0..100) of an ascending-sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

/** Non-null values, ascending. */
export function sortedFinite(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
}

/** Percentile-clipped domain (default 2nd–98th). Returns null if there is no data. */
export function percentileDomain(
  values: (number | null)[],
  low = 2,
  high = 98,
): Domain | null {
  const sorted = sortedFinite(values);
  if (sorted.length === 0) return null;
  return { min: percentile(sorted, low), max: percentile(sorted, high) };
}

/** Full data range, ignoring nulls. */
export function dataRange(values: (number | null)[]): Domain | null {
  const sorted = sortedFinite(values);
  if (sorted.length === 0) return null;
  return { min: sorted[0] as number, max: sorted[sorted.length - 1] as number };
}

/** Median of a non-empty array (does not need to be sorted). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

/**
 * Rolling median over a centered window (truncated at the ends). Null values stay null and are
 * ignored when computing neighbors' medians. `window` is rounded up to an odd number ≥ 1.
 */
export function rollingMedian(values: (number | null)[], window: number): (number | null)[] {
  const size = Math.max(1, Math.floor(window) | 1);
  const half = (size - 1) / 2;
  return values.map((v, i) => {
    if (v === null) return null;
    const neighbors: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const n = values[j];
      if (n !== null && n !== undefined) neighbors.push(n);
    }
    return median(neighbors);
  });
}
