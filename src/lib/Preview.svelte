<script lang="ts">
  import { onMount } from 'svelte';
  import { file } from './fileState.svelte';
  import { render } from './markdown';
  import { theme } from './theme.svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import mermaid from 'mermaid';

  type Api = { scrollToLine: (line: number) => void };

  let { onScroll, onReady }: {
    onScroll?: (line: number) => void;
    onReady?: (api: Api) => void;
  } = $props();

  let container: HTMLDivElement;
  const html = $derived(render(file.content));

  function initMermaid() {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme.value === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily: 'inherit'
    });
  }

  let pending: ReturnType<typeof setTimeout> | null = null;
  async function runMermaid() {
    if (!container) return;
    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>('.mermaid:not([data-processed="true"])')
    );
    if (nodes.length === 0) return;
    try {
      await mermaid.run({ nodes });
    } catch (err) {
      console.error('mermaid render:', err);
    }
  }

  function scheduleMermaid() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      runMermaid();
    }, 120);
  }

  function resetMermaidNodes() {
    if (!container) return;
    for (const el of container.querySelectorAll<HTMLElement>('.mermaid')) {
      const src = el.dataset.mermaidSrc;
      if (src != null) {
        el.removeAttribute('data-processed');
        el.textContent = src;
      }
    }
  }

  function handleClick(e: MouseEvent) {
    const a = (e.target as HTMLElement | null)?.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (/^(https?:|mailto:)/i.test(href)) {
      e.preventDefault();
      openUrl(href).catch((err) => console.error('openUrl failed:', err));
    }
  }

  function currentLineAtTop(): number {
    if (!container) return 0;
    const top = container.scrollTop + 20;
    const nodes = container.querySelectorAll<HTMLElement>('[data-line]');
    let line = 0;
    for (const n of nodes) {
      if (n.offsetTop <= top) {
        line = parseInt(n.dataset.line || '0', 10);
      } else {
        break;
      }
    }
    return line;
  }

  function handleScroll() {
    if (!onScroll) return;
    onScroll(currentLineAtTop());
  }

  onMount(() => {
    container.addEventListener('click', handleClick);
    initMermaid();
    scheduleMermaid();
    onReady?.({
      scrollToLine(line: number) {
        if (!container) return;
        const nodes = container.querySelectorAll<HTMLElement>('[data-line]');
        let target: HTMLElement | null = null;
        for (const n of nodes) {
          const l = parseInt(n.dataset.line || '0', 10);
          if (l <= line) target = n;
          else break;
        }
        if (target) container.scrollTo({ top: target.offsetTop });
        else container.scrollTo({ top: 0 });
      }
    });
    return () => {
      container.removeEventListener('click', handleClick);
      if (pending) clearTimeout(pending);
    };
  });

  // Re-render mermaid when the HTML updates.
  $effect(() => {
    void html;
    scheduleMermaid();
  });

  // Re-theme mermaid diagrams when the UI theme flips.
  $effect(() => {
    void theme.value;
    initMermaid();
    resetMermaidNodes();
    scheduleMermaid();
  });
</script>

<div class="preview" bind:this={container} onscroll={handleScroll}>
  <div class="preview-content">
    {@html html}
  </div>
</div>

<style>
  .preview {
    height: 100%;
    overflow: auto;
    padding: 1.5rem 2rem;
    line-height: 1.6;
    font-size: calc(16px * var(--zoom, 1));
  }
  .preview-content {
    max-width: 840px;
    margin: 0 auto;
  }
  .preview :global(h1),
  .preview :global(h2) {
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
  }
  .preview :global(h1) { font-size: 2em; margin-top: 0.5em; }
  .preview :global(h2) { font-size: 1.5em; }
  .preview :global(h3) { font-size: 1.25em; }
  .preview :global(pre) {
    background: var(--code-bg);
    padding: 1em;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid var(--border);
  }
  .preview :global(pre code) {
    background: transparent;
    padding: 0;
  }
  .preview :global(code) {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.9em;
    background: var(--code-bg);
    padding: 0.15em 0.35em;
    border-radius: 4px;
  }
  .preview :global(blockquote) {
    border-left: 3px solid var(--border);
    padding-left: 1em;
    color: var(--fg-muted);
    margin-left: 0;
  }
  .preview :global(table) {
    border-collapse: collapse;
  }
  .preview :global(th),
  .preview :global(td) {
    border: 1px solid var(--border);
    padding: 0.3em 0.7em;
  }
  .preview :global(a) {
    color: var(--accent);
    text-decoration: none;
  }
  .preview :global(a:hover) { text-decoration: underline; }
  .preview :global(img) { max-width: 100%; }
  .preview :global(hr) { border: 0; border-top: 1px solid var(--border); }

  /* Mermaid: render as a bare diagram, not a code box */
  .preview :global(pre.mermaid) {
    background: transparent;
    border: 0;
    padding: 0.5em 0;
    text-align: center;
    font-family: inherit;
    white-space: normal;
    overflow: visible;
    color: var(--fg);
  }
  .preview :global(pre.mermaid:not([data-processed="true"])) {
    font-family: ui-monospace, Consolas, monospace;
    white-space: pre;
    text-align: left;
    background: var(--code-bg);
    border: 1px solid var(--border);
    padding: 1em;
    border-radius: 6px;
    color: var(--fg-muted);
  }
  .preview :global(pre.mermaid svg) {
    max-width: 100%;
    height: auto;
  }
</style>
