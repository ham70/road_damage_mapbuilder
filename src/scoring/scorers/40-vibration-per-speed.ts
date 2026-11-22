import { defineScorer } from '../types';
import vibration from './10-vibration';

/** Floor so near-stationary points don't blow up the ratio. */
const MIN_SPEED = 3; // m/s

/**
 * The same road shakes more at higher speed. Dividing by speed is a rough correction so slow
 * and fast passes are more comparable. Shows how to reuse a scorer and mix in a GPS column.
 */
export default defineScorer({
  label: 'Vibration per speed',
  description: `Vibration RMS ÷ GPS speed (speeds below ${MIN_SPEED} m/s count as ${MIN_SPEED}).`,
  compute(ctx) {
    const vib = vibration.compute(ctx);
    const speed = ctx.column('Velocity');
    return vib.map((v, i) => {
      const s = speed[i];
      return v === null || s === null || s === undefined ? null : v / Math.max(s, MIN_SPEED);
    });
  },
});
