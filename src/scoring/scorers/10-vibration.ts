import { defineScorer } from '../types';
import { detrend, magnitude, reduce } from '../helpers';

/** General roughness: how much the total acceleration shakes around its local baseline. */
export default defineScorer({
  label: 'Vibration (RMS, m/s²)',
  description: 'RMS of total acceleration with gravity and slow changes removed.',
  compute(ctx) {
    const total = magnitude(ctx.series('X (m/s^2)'), ctx.series('Y (m/s^2)'), ctx.series('Z (m/s^2)'));
    return ctx.perPoint(detrend(total, 1), reduce.rms);
  },
});
