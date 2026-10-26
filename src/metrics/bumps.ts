import type { BumpEvent } from '../data_model/track';

export interface AccelerationSample {
  time: number;
  x: number;
  y: number;
  z: number;
}

export interface GpsSample {
  time: number;
  latitude: number;
  longitude: number;
}

export interface BumpDetectionOptions {
  baselineWindow: number;
  threshold: number;
  groupingGap: number;
  maxGpsDelta: number;
}

export const DEFAULT_BUMP_OPTIONS: BumpDetectionOptions = {
  baselineWindow: 11,
  threshold: 5,
  groupingGap: 1.1,
  maxGpsDelta: 1.5,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function nearestGps(
  time: number,
  samples: GpsSample[],
  maxDelta: number,
): { sample: GpsSample; delta: number } | null {
  let nearest: GpsSample | undefined;
  let delta = Infinity;
  for (const sample of samples) {
    const candidateDelta = Math.abs(sample.time - time);
    if (candidateDelta < delta) {
      nearest = sample;
      delta = candidateDelta;
    }
  }
  return nearest && delta <= maxDelta ? { sample: nearest, delta } : null;
}

/** Find transient magnitude rises and attach each event to a sufficiently close GPS sample. */
export function detectBumpEvents(
  acceleration: AccelerationSample[],
  gps: GpsSample[],
  options: BumpDetectionOptions = DEFAULT_BUMP_OPTIONS,
): BumpEvent[] {
  const window = Math.max(1, Math.floor(options.baselineWindow) | 1);
  const half = window >> 1;
  const samples = acceleration.map((sample) => ({
    ...sample,
    magnitude: Math.hypot(sample.x, sample.y, sample.z),
  }));
  const excess = samples.map((sample, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(samples.length, index + half + 1);
    return sample.magnitude - median(samples.slice(start, end).map((neighbor) => neighbor.magnitude));
  });

  const events: BumpEvent[] = [];
  let groupLastTime = -Infinity;
  let groupPeak = -1;
  const finishGroup = () => {
    if (groupPeak < 0) return;
    const peak = samples[groupPeak] as (typeof samples)[number];
    const match = nearestGps(peak.time, gps, options.maxGpsDelta);
    if (match) {
      events.push({
        time: peak.time,
        magnitude: peak.magnitude,
        excess: excess[groupPeak] as number,
        latitude: match.sample.latitude,
        longitude: match.sample.longitude,
        gpsTime: match.sample.time,
        gpsDelta: match.delta,
      });
    }
  };

  for (let i = 0; i < samples.length; i++) {
    if ((excess[i] as number) < options.threshold) continue;
    const current = samples[i] as (typeof samples)[number];
    if (groupPeak < 0 || current.time - groupLastTime > options.groupingGap) {
      finishGroup();
      groupPeak = i;
    } else if (groupPeak < 0 || (excess[i] as number) > (excess[groupPeak] as number)) {
      groupPeak = i;
    }
    groupLastTime = current.time;
  }
  finishGroup();
  return events;
}
