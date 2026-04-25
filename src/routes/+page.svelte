<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from '$lib/Editor.svelte';
  import Preview from '$lib/Preview.svelte';
  import Icon from '$lib/Icon.svelte';
  import {
    file,
    baseName,
    tabs,
    newTab,
    closeTab,
    activateTab,
    openTabForFile
  } from '$lib/fileState.svelte';
  import { theme, applyTheme, toggleTheme } from '$lib/theme.svelte';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { zoom, applyZoom, zoomIn, zoomOut, zoomReset, zoomTick } from '$lib/zoom.svelte';

  type PaneApi = { scrollToLine: (line: number) => void };
  let editorApi: PaneApi | null = null;
  let previewApi: PaneApi | null = null;
  let scrollLock = 0;

  let mode = $state<'view' | 'edit'>('view');
  let panelOpen = $state(false);
  let zoomToastOn = $state(false);
  let zoomToastTimer: ReturnType<typeof setTimeout> | null = null;

  const MIN_SIDEBAR = 180;
  const MAX_SIDEBAR = 500;
  function initialSidebarWidth(): number {
    if (typeof localStorage === 'undefined') return 240;
    const n = parseInt(localStorage.getItem('sidebarWidth') ?? '', 10);
    return Number.isFinite(n) && n >= MIN_SIDEBAR && n <= MAX_SIDEBAR ? n : 240;
  }
  let sidebarWidth = $state(initialSidebarWidth());
  let resizing = $state(false);

  function onResizeStart(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onResizeMove(e: PointerEvent) {
    if (!resizing) return;
    const next = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, e.clientX));
    sidebarWidth = next;
  }
  function onResizeEnd(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sidebarWidth', String(sidebarWidth));
    }
  }

  const isDirty = $derived(file.content !== file.saved);
  const displayName = $derived(baseName(file.path));

  applyTheme();
  applyZoom();

  type TocEntry = { level: number; text: string; line: number };
  function parseToc(src: string): TocEntry[] {
    const out: TocEntry[] = [];
    const lines = src.split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s{0,3}(```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) out.push({ level: m[1].length, text: m[2], line: i });
    }
    return out;
  }
  const toc = $derived(parseToc(file.content));

  function coercePath(x: unknown): string | null {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object' && 'path' in x && typeof (x as { path: unknown }).path === 'string') {
      return (x as { path: string }).path;
    }
    return null;
  }

  async function openFile(path?: string | null) {
    try {
      if (!path) {
        const chosen = await open({
          multiple: false,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
        });
        path = coercePath(chosen);
        if (!path) return;
      }
      const content = await invoke<string>('read_text_file', { path });
      openTabForFile(path, content);
      mode = 'view';
    } catch (err) {
      console.error('Open failed:', err);
      alert(`Open failed: ${err}`);
    }
  }

  async function newFile() {
    newTab(null, '');
    mode = 'edit';
  }

  async function requestCloseTab(id: string) {
    const t = tabs.items.find((x) => x.id === id);
    if (!t) return;
    if (t.content !== t.saved) {
      if (!confirm(`Discard unsaved changes to ${baseName(t.path)}?`)) return;
    }
    closeTab(id);
  }

  async function saveFile() {
    if (!file.path) return saveFileAs();
    try {
      await invoke('write_text_file', { path: file.path, content: file.content });
      file.saved = file.content;
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Save failed: ${err}`);
    }
  }

  async function saveFileAs() {
    try {
      const chosen = await save({
        defaultPath: file.path ?? 'untitled.md',
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      });
      const path = coercePath(chosen);
      if (!path) return;
      await invoke('write_text_file', { path, content: file.content });
      file.path = path;
      file.saved = file.content;
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Save failed: ${err}`);
    }
  }

  function toggleMode() {
    mode = mode === 'view' ? 'edit' : 'view';
  }

  function togglePanel() {
    panelOpen = !panelOpen;
  }

  function jumpToLine(line: number) {
    previewApi?.scrollToLine(line);
    if (mode === 'edit') editorApi?.scrollToLine(line);
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && panelOpen) { panelOpen = false; return; }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 's' && e.shiftKey) { e.preventDefault(); saveFileAs(); }
    else if (k === 's') { e.preventDefault(); saveFile(); }
    else if (k === 'o') { e.preventDefault(); openFile(); }
    else if (k === 'n') { e.preventDefault(); newFile(); }
    else if (k === 'e') { e.preventDefault(); toggleMode(); }
    else if (k === 'b' || k === '\\') { e.preventDefault(); togglePanel(); }
    else if (k === 'w') { e.preventDefault(); if (tabs.activeId) requestCloseTab(tabs.activeId); }
    else if (k === '=' || k === '+') { e.preventDefault(); zoomIn(); }
    else if (k === '-' || k === '_') { e.preventDefault(); zoomOut(); }
    else if (k === '0') { e.preventDefault(); zoomReset(); }
  }

  function handleWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else if (e.deltaY > 0) zoomOut();
  }

  function onEditorScroll(line: number) {
    if (scrollLock > 0) { scrollLock--; return; }
    scrollLock = 1;
    previewApi?.scrollToLine(line);
  }

  function onPreviewScroll(line: number) {
    if (scrollLock > 0) { scrollLock--; return; }
    scrollLock = 1;
    editorApi?.scrollToLine(line);
  }

  function isMarkdownPath(p: string): boolean {
    return /\.(md|markdown)$/i.test(p);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    window.addEventListener('wheel', handleWheel, { passive: false });

    const unlistenOpen = listen<string>('open-file', (ev) => openFile(ev.payload));

    const dragDropPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        for (const p of event.payload.paths) {
          if (isMarkdownPath(p)) openFile(p);
        }
      }
    });

    (async () => {
      try {
        const pending = await invoke<string[]>('take_pending_files');
        for (const p of pending) {
          if (isMarkdownPath(p)) await openFile(p);
        }
      } catch (err) {
        console.error('take_pending_files failed:', err);
      }
    })();

    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('wheel', handleWheel);
      if (zoomToastTimer) clearTimeout(zoomToastTimer);
      unlistenOpen.then((f) => f());
      dragDropPromise.then((f) => f());
    };
  });

  // Show transient zoom toast on every actual zoom change.
  $effect(() => {
    void zoomTick.n;
    if (zoomTick.n === 0) return;
    zoomToastOn = true;
    if (zoomToastTimer) clearTimeout(zoomToastTimer);
    zoomToastTimer = setTimeout(() => { zoomToastOn = false; }, 900);
  });
</script>

<div
  class="app"
  class:panel-open={panelOpen}
  class:resizing
  style="--panel-offset: {panelOpen ? sidebarWidth : 0}px"
>
  <button
    class="hamburger"
    class:active={panelOpen}
    onclick={togglePanel}
    title="Menu (Ctrl/Cmd+B)"
    aria-label="Toggle menu"
    aria-expanded={panelOpen}
  >
    <span></span><span></span><span></span>
  </button>

  <aside
    class="sidebar"
    class:open={panelOpen}
    class:resizing
    style="width: {sidebarWidth}px"
    aria-hidden={!panelOpen}
  >
    <nav class="icon-strip" aria-label="Actions">
      <button onclick={newFile} title="New (Ctrl/Cmd+N)" aria-label="New">
        <Icon name="new" />
      </button>
      <button onclick={() => openFile()} title="Open (Ctrl/Cmd+O)" aria-label="Open">
        <Icon name="open" />
      </button>
      <button onclick={saveFile} title="Save (Ctrl/Cmd+S)" aria-label="Save">
        <Icon name="save" />
      </button>
      <button onclick={saveFileAs} title="Save As (Ctrl/Cmd+Shift+S)" aria-label="Save As">
        <Icon name="save-as" />
      </button>
      <button
        onclick={toggleMode}
        title={mode === 'view' ? 'Edit (Ctrl/Cmd+E)' : 'View (Ctrl/Cmd+E)'}
        aria-label={mode === 'view' ? 'Edit' : 'View'}
      >
        <Icon name={mode === 'view' ? 'edit' : 'view'} />
      </button>
    </nav>

    <div class="filename" title={file.path ?? 'Untitled'}>
      {#if isDirty}<span class="dot" aria-label="unsaved">●</span>{/if}
      {displayName}
    </div>

    <div class="bottom">
      <div class="toc-head">Contents</div>
      <nav class="toc" aria-label="Table of contents">
        {#if toc.length === 0}
          <div class="toc-empty">No headings</div>
        {:else}
          {#each toc as h (h.line)}
            <button
              class="toc-item"
              data-level={h.level}
              onclick={() => jumpToLine(h.line)}
              title={h.text}
            >
              {h.text}
            </button>
          {/each}
        {/if}
      </nav>

      <div class="footer">
        <button
          onclick={toggleTheme}
          title={theme.value === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label={theme.value === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          <Icon name={theme.value === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
    </div>

    <div
      class="resize-handle"
      onpointerdown={onResizeStart}
      onpointermove={onResizeMove}
      onpointerup={onResizeEnd}
      onpointercancel={onResizeEnd}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={MIN_SIDEBAR}
      aria-valuemax={MAX_SIDEBAR}
      aria-valuenow={sidebarWidth}
    ></div>
  </aside>

  <div class="content">
    <div class="tabbar" role="tablist" aria-label="Open files">
      {#each tabs.items as t (t.id)}
        <div
          class="tab"
          class:active={t.id === tabs.activeId}
          role="tab"
          aria-selected={t.id === tabs.activeId}
          tabindex="0"
          title={t.path ?? 'Untitled'}
          onclick={() => activateTab(t.id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTab(t.id); } }}
        >
          {#if t.content !== t.saved}<span class="dot" aria-label="unsaved">●</span>{/if}
          <span class="tab-name">{baseName(t.path)}</span>
          <span
            class="tab-close"
            role="button"
            tabindex="0"
            aria-label="Close tab"
            title="Close"
            onclick={(e) => { e.stopPropagation(); requestCloseTab(t.id); }}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); requestCloseTab(t.id); } }}
          >×</span>
        </div>
      {/each}
      <button class="tab-new" onclick={newFile} title="New tab (Ctrl/Cmd+N)" aria-label="New tab">+</button>
    </div>
    <div class="content-body">
      {#if mode === 'view'}
        <div class="single">
          <Preview onReady={(api) => (previewApi = api)} />
        </div>
      {:else}
        <div class="split">
          <div class="pane">
            <Editor onScroll={onEditorScroll} onReady={(api) => (editorApi = api)} />
          </div>
          <div class="divider"></div>
          <div class="pane">
            <Preview onScroll={onPreviewScroll} onReady={(api) => (previewApi = api)} />
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="zoom-toast" class:on={zoomToastOn} aria-live="polite" aria-atomic="true">
    {Math.round(zoom.value * 100)}%
  </div>
</div>

<style>
  .app {
    height: 100vh;
    position: relative;
    overflow: hidden;
  }

  /* Hamburger */
  .hamburger {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 30;
    width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 150ms ease, background 150ms ease, border-color 150ms ease;
  }
  .hamburger:hover, .hamburger:focus-visible, .hamburger.active {
    opacity: 1;
    background: var(--bg-alt);
    border-color: var(--border);
  }
  .hamburger span {
    display: block;
    width: 16px;
    height: 1.5px;
    background: var(--fg);
    border-radius: 1px;
    grid-column: 1;
    grid-row: 1;
    transition: transform 180ms ease, opacity 150ms ease;
  }
  .hamburger span:nth-child(1) { transform: translateY(-5px); }
  .hamburger span:nth-child(3) { transform: translateY(5px); }
  .hamburger.active span:nth-child(1) { transform: rotate(45deg); }
  .hamburger.active span:nth-child(2) { opacity: 0; }
  .hamburger.active span:nth-child(3) { transform: rotate(-45deg); }

  /* Sidebar */
  .sidebar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 240px;
    z-index: 25;
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--titlebar-bg) 96%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-right: 1px solid var(--border);
    transform: translateX(-100%);
    transition: transform 200ms ease;
    user-select: none;
  }
  .sidebar.open { transform: translateX(0); }

  /* Top: single-row icon strip (hamburger sits above at left, so offset) */
  .icon-strip {
    display: flex;
    gap: 0.1rem;
    padding: 0.4rem 0.4rem 0.4rem 2.75rem;
    border-bottom: 1px solid var(--border);
  }
  .icon-strip button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--fg);
    cursor: pointer;
  }
  .icon-strip button:hover {
    background: var(--bg-alt);
    border-color: var(--border);
  }

  .filename {
    padding: 0.4rem 0.75rem;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid var(--border);
  }
  .dot { color: var(--accent); font-size: 10px; }

  /* Bottom block: Contents + TOC + footer settings */
  .bottom {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 auto;
  }
  .toc-head {
    padding: 0.6rem 0.75rem 0.3rem;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }
  .toc {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 0.3rem;
  }
  .toc-item {
    display: block;
    width: 100%;
    padding: 0.22rem 0.6rem;
    background: transparent;
    border: 0;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 4px;
    line-height: 1.35;
  }
  .toc-item[data-level="1"] {
    padding-left: 0.6rem;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.005em;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    margin: 0.35rem 0 0.15rem 0;
  }
  .toc-item[data-level="2"] {
    padding-left: 0.6rem;
    font-size: 12.5px;
    font-weight: 700;
  }
  .toc-item[data-level="3"] {
    padding-left: 1.4rem;
    font-size: 12px;
    font-weight: 400;
  }
  .toc-item[data-level="4"] {
    padding-left: 2rem;
    font-size: 11.5px;
    font-weight: 400;
    color: var(--fg-muted);
  }
  .toc-item[data-level="5"] {
    padding-left: 2.6rem;
    font-size: 11px;
    font-weight: 400;
    color: var(--fg-muted);
  }
  .toc-item[data-level="6"] {
    padding-left: 3.2rem;
    font-size: 10.5px;
    font-weight: 400;
    color: var(--fg-muted);
  }
  .toc-item:hover { background: var(--bg-alt); color: var(--accent); }
  .toc-item[data-level="1"]:hover {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .toc-empty {
    padding: 0.5rem 0.75rem;
    font-size: 12px;
    color: var(--fg-muted);
    font-style: italic;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0.4rem;
    border-top: 1px solid var(--border);
  }
  .footer button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--fg);
    cursor: pointer;
  }
  .footer button:hover {
    background: var(--bg-alt);
    border-color: var(--border);
  }

  /* Resize handle — 4px hit zone at right edge */
  .resize-handle {
    position: absolute;
    top: 0;
    right: -2px;
    width: 5px;
    height: 100%;
    cursor: ew-resize;
    z-index: 26;
    background: transparent;
    touch-action: none;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: transparent;
    transition: background 150ms ease;
  }
  .resize-handle:hover::after,
  .sidebar.resizing .resize-handle::after {
    background: var(--accent);
  }
  .sidebar:not(.open) .resize-handle {
    pointer-events: none;
  }
  .sidebar.resizing {
    transition: none;
    user-select: none;
  }

  /* Zoom toast */
  .zoom-toast {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.92);
    z-index: 40;
    padding: 0.6rem 1.1rem;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
    background: color-mix(in srgb, var(--titlebar-bg) 88%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--border);
    border-radius: 10px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, transform 180ms ease;
  }
  .zoom-toast.on {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  /* Content layouts — offset right when sidebar is open */
  .content {
    height: 100%;
    padding-left: var(--panel-offset, 0px);
    transition: padding-left 200ms ease;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .app.resizing .content {
    transition: none;
  }
  .content-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .single {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
  .split {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    flex: 1 1 auto;
    min-height: 0;
  }
  .pane { height: 100%; min-height: 0; overflow: hidden; }
  .divider { background: var(--border); }

  /* Tab bar */
  .tabbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 4px 4px 38px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--titlebar-bg) 80%, transparent);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    user-select: none;
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--fg-muted);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    max-width: 220px;
  }
  .tab:hover {
    background: color-mix(in srgb, var(--fg) 6%, transparent);
    color: var(--fg);
  }
  .tab.active {
    background: var(--bg);
    border-color: var(--border);
    color: var(--fg);
  }
  .tab .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 170px;
  }
  .tab .dot {
    color: var(--accent);
    font-size: 9px;
    line-height: 1;
  }
  .tab .tab-close {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    font-size: 14px;
    line-height: 1;
    color: var(--fg-muted);
    opacity: 0.55;
  }
  .tab .tab-close:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--fg) 14%, transparent);
    color: var(--fg);
  }
  .tab-new {
    margin-left: 2px;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--fg-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .tab-new:hover {
    background: var(--bg-alt);
    border-color: var(--border);
    color: var(--fg);
  }
</style>
