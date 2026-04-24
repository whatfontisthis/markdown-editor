const MIN = 0.6;
const MAX = 2.5;
const STEP = 0.1;

function initial(): number {
  if (typeof localStorage === 'undefined') return 1;
  const n = parseFloat(localStorage.getItem('zoom') ?? '');
  return Number.isFinite(n) && n >= MIN && n <= MAX ? n : 1;
}

export const zoom = $state({ value: initial() });
export const zoomTick = $state({ n: 0 });

function clamp(v: number): number {
  return Math.max(MIN, Math.min(MAX, Math.round(v * 100) / 100));
}

function persist() {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--zoom', String(zoom.value));
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('zoom', String(zoom.value));
  }
}

export function applyZoom(): void {
  persist();
}

export function setZoom(v: number): void {
  const next = clamp(v);
  if (next === zoom.value) return;
  zoom.value = next;
  persist();
  zoomTick.n++;
}

export function zoomIn(): void {
  setZoom(zoom.value + STEP);
}

export function zoomOut(): void {
  setZoom(zoom.value - STEP);
}

export function zoomReset(): void {
  setZoom(1);
}
