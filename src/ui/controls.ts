/** File picker + drag-and-drop. Calls `onFiles` with the chosen CSV(s). */
export function setupFileInput(
  dropTarget: HTMLElement,
  input: HTMLInputElement,
  onFiles: (files: File[]) => void,
): void {
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    if (files.length) onFiles(files);
    input.value = '';
  });

  let depth = 0;
  dropTarget.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    dropTarget.classList.add('dragging');
  });
  dropTarget.addEventListener('dragover', (e) => e.preventDefault());
  dropTarget.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      dropTarget.classList.remove('dragging');
    }
  });
  dropTarget.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropTarget.classList.remove('dragging');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onFiles(files);
  });
}

/** Show a message in the status element; errors are styled and persist until replaced. */
export function setStatus(el: HTMLElement, message: string, isError = false): void {
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = message === '';
}

export interface ControlState {
  metricIndex: number;
  smoothing: boolean;
  window: number;
}

export const DEFAULT_SMOOTHING_WINDOW = 5;

export interface MetricControls {
  /** Fill the dropdown and reset to the first column with smoothing off. */
  setMetrics(names: string[]): void;
}

/** Metric dropdown + smoothing toggle/window. Calls `onChange` whenever any of them changes. */
export function setupMetricControls(
  select: HTMLSelectElement,
  smoothBox: HTMLInputElement,
  windowInput: HTMLInputElement,
  onChange: (state: ControlState) => void,
): MetricControls {
  const read = (): ControlState => {
    // Windows are centered, so force an odd integer ≥ 3.
    let w = Math.round(Number(windowInput.value));
    if (!Number.isFinite(w) || w < 3) w = 3;
    if (w % 2 === 0) w += 1;
    windowInput.value = String(w);
    return { metricIndex: select.selectedIndex, smoothing: smoothBox.checked, window: w };
  };
  const changed = () => {
    windowInput.disabled = !smoothBox.checked;
    onChange(read());
  };
  select.addEventListener('change', changed);
  smoothBox.addEventListener('change', changed);
  windowInput.addEventListener('change', changed);

  return {
    setMetrics(names) {
      select.replaceChildren(
        ...names.map((name, i) => {
          const opt = document.createElement('option');
          opt.value = String(i);
          opt.textContent = name;
          return opt;
        }),
      );
      select.selectedIndex = 0;
      smoothBox.checked = false;
      windowInput.value = String(DEFAULT_SMOOTHING_WINDOW);
      windowInput.disabled = true;
    },
  };
}
