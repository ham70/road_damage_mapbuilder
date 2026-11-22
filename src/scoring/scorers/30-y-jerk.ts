import { defineScorer } from '../types';
import { derivative, reduce } from '../helpers';

/**
 * How fast Y acceleration changes (jerk). In the sample drives the phone sits so that Y is mostly
 * vertical; change the axis if yours is mounted differently.
 */
export default defineScorer({
  label: 'Change in Y acceleration (m/s³)',
  description: 'Largest |dY/dt| between consecutive accelerometer samples.',
  compute(ctx) {
    return ctx.perPoint(derivative(ctx.series('Y (m/s^2)')), reduce.maxAbs);
  },
});
