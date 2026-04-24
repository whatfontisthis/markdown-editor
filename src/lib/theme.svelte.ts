type Theme = 'light' | 'dark';

function initial(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export const theme = $state({ value: initial() });

export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme.value;
}

export function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('theme', theme.value);
  }
  applyTheme();
}
