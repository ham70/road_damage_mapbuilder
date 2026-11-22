import type { MetricColumn, Series, Track } from '../data_model/track';
import { createScoreContext } from './context';
import { MissingColumnError, type ScoringFunction } from './types';

/** Every default export in ./scorers, ordered by file name (prefix "10-" etc. to reorder). */
const modules = import.meta.glob<ScoringFunction>('./scorers/*.ts', { eager: true, import: 'default' });
export const SCORERS: { id: string; scorer: ScoringFunction }[] = Object.keys(modules)
  .sort()
  .map((path) => ({ id: path.replace(/^.*\//, '').replace(/\.ts$/, ''), scorer: modules[path] as ScoringFunction }));

export interface ScoreProblem {
  label: string;
  reason: string;
}

export interface ScoreResults {
  scores: MetricColumn[];
  /** Missing inputs or no values for these files: expected, not a bug. */
  unavailable: ScoreProblem[];
  /** Threw or returned the wrong shape: a bug in the scorer. */
  failed: ScoreProblem[];
}

/** Run every registered scorer. A failing scorer is reported, never fatal. */
export function computeScores(track: Track, series: Series[], scorers = SCORERS): ScoreResults {
  const ctx = createScoreContext(track, series);
  const results: ScoreResults = { scores: [], unavailable: [], failed: [] };
  for (const { id, scorer } of scorers) {
    const label = scorer?.label ?? id;
    try {
      if (typeof scorer?.compute !== 'function') throw new Error('default export has no compute()');
      const out = scorer.compute(ctx);
      if (!Array.isArray(out) || out.length !== ctx.length) {
        throw new Error(`returned ${Array.isArray(out) ? out.length : typeof out} values, expected ${ctx.length}`);
      }
      const values = out.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
      if (values.every((v) => v === null)) {
        results.unavailable.push({ label, reason: 'no values for these files' });
        continue;
      }
      results.scores.push({ name: label, values, description: scorer.description });
    } catch (e) {
      if (e instanceof MissingColumnError) results.unavailable.push({ label, reason: e.message });
      else results.failed.push({ label, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
