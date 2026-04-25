export type FileTab = {
  id: string;
  path: string | null;
  content: string;
  saved: string;
};

let nextId = 1;
function makeId(): string {
  return `t${nextId++}`;
}

export const tabs = $state({
  items: [] as FileTab[],
  activeId: null as string | null
});

export function activeTab(): FileTab | null {
  if (tabs.activeId == null) return null;
  return tabs.items.find((t) => t.id === tabs.activeId) ?? null;
}

export function newTab(path: string | null = null, content = ''): string {
  const id = makeId();
  tabs.items.push({ id, path, content, saved: content });
  tabs.activeId = id;
  return id;
}

export function activateTab(id: string): void {
  if (tabs.items.some((t) => t.id === id)) tabs.activeId = id;
}

export function closeTab(id: string): void {
  const idx = tabs.items.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tabs.items.splice(idx, 1);
  if (tabs.activeId === id) {
    const next = tabs.items[idx] ?? tabs.items[idx - 1] ?? null;
    tabs.activeId = next ? next.id : null;
  }
  if (tabs.items.length === 0) newTab();
}

export function openTabForFile(path: string, content: string): string {
  const existing = tabs.items.find((t) => t.path === path);
  if (existing) {
    existing.content = content;
    existing.saved = content;
    tabs.activeId = existing.id;
    return existing.id;
  }
  const cur = activeTab();
  if (cur && cur.path === null && cur.content === '' && cur.saved === '') {
    cur.path = path;
    cur.content = content;
    cur.saved = content;
    return cur.id;
  }
  return newTab(path, content);
}

export const file = {
  get path(): string | null {
    return activeTab()?.path ?? null;
  },
  set path(v: string | null) {
    const t = activeTab();
    if (t) t.path = v;
  },
  get content(): string {
    return activeTab()?.content ?? '';
  },
  set content(v: string) {
    const t = activeTab();
    if (t) t.content = v;
  },
  get saved(): string {
    return activeTab()?.saved ?? '';
  },
  set saved(v: string) {
    const t = activeTab();
    if (t) t.saved = v;
  }
};

if (tabs.items.length === 0) newTab();

export function baseName(path: string | null): string {
  if (!path) return 'Untitled';
  return path.split(/[\\/]/).pop() || path;
}
