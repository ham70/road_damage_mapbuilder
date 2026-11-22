import { describe, expect, test } from 'vitest';
import type { Series, Track } from '../data_model/track';
import { createScoreContext, pointWindows } from './context';
import { derivative, magnitude, reduce } from './helpers';
import { computeScores } from './registry';
import { defineScorer } from './types';

const track: Track = {
  lat: [1, 2, 3],
  lon: [1, 2, 3],
  rows: [2, 3, 4],
  metrics: [
    { name: 'Velocity (m/s)', values: [5, 10, null] },
    { name: 'Time (s)', values: [0, 1, 2] },
  ],
};
const at10Hz = (file: string, name: string, f: (t: number) => number): Series => {
  const time = Array.from({ length: 21 }, (_, i) => i / 10);
  return { file, name, time, values: time.map(f) };
};
const series = [
  at10Hz('Accelerometer.csv', 'X (m/s^2)', () => 3),
  at10Hz('Accelerometer.csv', 'Y (m/s^2)', (t) => (Math.abs(t - 1) < 1e-9 ? 14 : 4)),
  at10Hz('Linear Accelerometer.csv', 'X (m/s^2)', () => 0),
];

describe('lookup', () => {
  const ctx = createScoreContext(track, series);
  test('matches case-insensitively, with or without units, and by file prefix', () => {
    expect(ctx.series('y').values[0]).toBe(4);
    expect(ctx.series('x (m/s^2)').file).toBe('Accelerometer.csv');
    expect(ctx.series('linear: X').file).toBe('Linear Accelerometer.csv');
    expect(ctx.column('velocity')).toEqual([5, 10, null]);
  });
  test('a query with a different unit does not match', () => {
    expect(ctx.has('X (rad/s)')).toBe(false);
    expect(() => ctx.series('X (rad/s)')).toThrow(/needs column/);
  });
});

describe('perPoint', () => {
  test('windows meet halfway between points', () => {
    expect(pointWindows([0, 1, 2])).toEqual([[-0.5, 0.5], [0.5, 1.5], [1.5, 2.5]]);
    expect(pointWindows([0, 10], { maxHalfWidth: 2 })).toEqual([[-2, 2], [8, 12]]);
  });
  test('keeps a one-sample spike at the point it belongs to', () => {
    const ctx = createScoreContext(track, series);
    const total = magnitude(ctx.series('X (m/s^2)'), ctx.series('Y (m/s^2)'));
    expect(ctx.perPoint(total, reduce.max).map((v) => Number(v?.toFixed(3)))).toEqual([5, 14.318, 5]);
    // The rise (t = 1.0) and the fall (t = 1.1) both land in point 1's window.
    const jerk = ctx.perPoint(derivative(ctx.series('Y')), reduce.maxAbs);
    expect(jerk.map((v) => Math.round(v ?? NaN))).toEqual([0, 100, 0]);
  });
});

describe('computeScores', () => {
  test('separates working, unavailable and broken scorers', () => {
    const r = computeScores(track, series, [
      { id: 'ok', scorer: defineScorer({ label: 'OK', compute: (c) => c.column('Velocity') }) },
      { id: 'missing', scorer: defineScorer({ label: 'Missing', compute: (c) => c.column('Gyro') }) },
      { id: 'short', scorer: defineScorer({ label: 'Short', compute: () => [1] }) },
      { id: 'throws', scorer: defineScorer({ label: 'Throws', compute: () => { throw new Error('boom'); } }) },
    ]);
    expect(r.scores.map((s) => s.name)).toEqual(['OK']);
    expect(r.unavailable.map((s) => s.label)).toEqual(['Missing']);
    expect(r.failed).toEqual([
      { label: 'Short', reason: 'returned 1 values, expected 3' },
      { label: 'Throws', reason: 'boom' },
    ]);
  });
});
