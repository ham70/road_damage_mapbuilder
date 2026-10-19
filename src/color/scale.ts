import { rgb } from 'd3-color';
import {
  interpolateInferno,
  interpolatePlasma,
  interpolateRdYlGn,
  interpolateTurbo,
  interpolateViridis,
} from 'd3-scale-chromatic';
import type { Domain } from '../metrics/stats';

export const PALETTES = {
  turbo: interpolateTurbo,
  viridis: interpolateViridis,
  plasma: interpolatePlasma,
  RdYlGn: interpolateRdYlGn,
  inferno: interpolateInferno,
} as const;

export type PaletteName = keyof typeof PALETTES;
export const DEFAULT_PALETTE: PaletteName = 'turbo';

/** Neutral color for segments with a missing metric value. */
export const NO_DATA_COLOR = '#9aa0a6';

export interface ColorOptions {
  palette: PaletteName;
  domain: Domain;
  invert: boolean;
}

/** Position of `value` within the domain, clamped to 0..1 (0.5 for a degenerate domain). */
export function normalize(value: number, domain: Domain, invert = false): number {
  const span = domain.max - domain.min;
  const t = span > 0 ? Math.min(1, Math.max(0, (value - domain.min) / span)) : 0.5;
  return invert ? 1 - t : t;
}

/** Hex color for t in 0..1 on the palette. */
export function paletteColor(palette: PaletteName, t: number): string {
  return rgb(PALETTES[palette](t)).formatHex();
}

/** Build a value → hex function; null values get the no-data color. */
export function createColorFn(opts: ColorOptions): (value: number | null) => string {
  return (value) =>
    value === null ? NO_DATA_COLOR : paletteColor(opts.palette, normalize(value, opts.domain, opts.invert));
}
