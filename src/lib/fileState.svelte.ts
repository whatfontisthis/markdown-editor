export const file = $state({
  path: null as string | null,
  content: '',
  saved: ''
});

export function baseName(path: string | null): string {
  if (!path) return 'Untitled';
  return path.split(/[\\/]/).pop() || path;
}
