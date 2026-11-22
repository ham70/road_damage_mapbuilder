import { defineScorer } from '../types';
import { detrend, magnitude, reduce } from '../helpers';

/** Single hard hits (potholes, joints): the same signal the bump markers threshold, as a heat map. */
export default defineScorer({
  label: 'Peak jolt (m/s²)',
  description: 'Largest rise of total acceleration above its 1 s rolling median.',
  compute(ctx) {
    const total = magnitude(ctx.series('X (m/s^2)'), ctx.series('Y (m/s^2)'), ctx.series('Z (m/s^2)'));
    return ctx.perPoint(detrend(total, 1), reduce.max);
  },
});
