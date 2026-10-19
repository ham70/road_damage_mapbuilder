import { paletteColor, type PaletteName } from '../color/scale';
import type { Domain } from '../metrics/stats';

export interface LegendLabels {
  low: string;
  high: string;
}

export function formatValue(v: number): string {
  return String(Number(v.toPrecision(4)));
}

/** End labels; ≤ / ≥ appear when data extends beyond the domain and is clamped. */
export function legendLabels(domain: Domain, data: Domain | null): LegendLabels {
  const clampedLow = data !== null && data.min < domain.min;
  const clampedHigh = data !== null && data.max > domain.max;
  return {
    low: `${clampedLow ? '≤ ' : ''}${formatValue(domain.min)}`,
    high: `${clampedHigh ? '≥ ' : ''}${formatValue(domain.max)}`,
  };
}

/** CSS gradient string for the palette (reversed when inverted). */
export function gradientCss(palette: PaletteName, invert: boolean): string {
  const stops = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return `${paletteColor(palette, invert ? 1 - t : t)} ${(t * 100).toFixed(1)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function renderLegend(
  el: HTMLElement,
  name: string,
  palette: PaletteName,
  invert: boolean,
  domain: Domain,
  data: Domain | null,
): void {
  const { low, high } = legendLabels(domain, data);
  el.replaceChildren();
  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = name;
  const bar = document.createElement('div');
  bar.className = 'legend-bar';
  bar.style.background = gradientCss(palette, invert);
  const labels = document.createElement('div');
  labels.className = 'legend-labels';
  const l = document.createElement('span');
  l.textContent = low;
  const h = document.createElement('span');
  h.textContent = high;
  labels.append(l, h);
  el.append(title, bar, labels);
  el.hidden = false;
}
