<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { bracketMatching, indentOnInput } from '@codemirror/language';
  import { appleDark, appleLight } from './cmTheme';
  import { file } from './fileState.svelte';
  import { theme } from './theme.svelte';

  type Api = { scrollToLine: (line: number) => void };

  let { onScroll, onReady }: {
    onScroll?: (line: number) => void;
    onReady?: (api: Api) => void;
  } = $props();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  const themeCompartment = new Compartment();

  function extensions() {
    return [
      lineNumbers(),
      history(),
      bracketMatching(),
      indentOnInput(),
      markdown(),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      themeCompartment.of(theme.value === 'dark' ? appleDark : appleLight),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          file.content = update.state.doc.toString();
        }
      }),
      EditorView.domEventHandlers({
        scroll(_ev, v) {
          if (!onScroll) return;
          const top = v.scrollDOM.scrollTop;
          const block = v.lineBlockAtHeight(top);
          onScroll(v.state.doc.lineAt(block.from).number - 1);
        }
      })
    ];
  }

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({ doc: file.content, extensions: extensions() }),
      parent: container
    });
    onReady?.({
      scrollToLine(line: number) {
        if (!view) return;
        const max = view.state.doc.lines;
        const ln = Math.max(1, Math.min(max, line + 1));
        const pos = view.state.doc.line(ln).from;
        const block = view.lineBlockAt(pos);
        view.scrollDOM.scrollTo({ top: block.top });
      }
    });
  });

  onDestroy(() => view?.destroy());

  $effect(() => {
    if (!view) return;
    if (view.state.doc.toString() !== file.content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: file.content }
      });
    }
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(theme.value === 'dark' ? appleDark : appleLight)
    });
  });
</script>

<div bind:this={container} class="editor"></div>

<style>
  .editor {
    height: 100%;
    overflow: hidden;
  }
  :global(.cm-editor) { height: 100%; }
  :global(.cm-scroller) {
    font-family: ui-monospace, "SF Mono", Consolas, Menlo, monospace;
    font-size: calc(14px * var(--zoom, 1));
  }
</style>
