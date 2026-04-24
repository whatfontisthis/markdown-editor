import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/* Ghostty "Apple System Colors" — dark (verbatim) and derived light variant. */

const dark = {
  bg: '#1e1e1e',
  bgAlt: '#1c1c1e',
  fg: '#ffffff',
  fgMuted: '#98989d',
  selection: '#0a84ff40',
  active: '#ffffff08',
  red: '#ff453a',
  green: '#32d74b',
  yellow: '#ffd60a',
  blue: '#0a84ff',
  magenta: '#bf5af2',
  cyan: '#76d6ff',
  gray: '#98989d'
};

const light = {
  bg: '#ffffff',
  bgAlt: '#f5f5f7',
  fg: '#1d1d1f',
  fgMuted: '#6e6e73',
  selection: '#0869cb30',
  active: '#00000005',
  red: '#cc372e',
  green: '#26a439',
  yellow: '#cdac08',
  blue: '#0869cb',
  magenta: '#9647bf',
  cyan: '#479ec2',
  gray: '#86868b'
};

function buildTheme(p: typeof dark, isDark: boolean): Extension {
  const base = EditorView.theme(
    {
      '&': { color: p.fg, backgroundColor: p.bg },
      '.cm-content': { caretColor: p.fg },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.fg },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: p.selection
      },
      '.cm-activeLine': { backgroundColor: p.active },
      '.cm-activeLineGutter': { backgroundColor: p.active },
      '.cm-gutters': {
        backgroundColor: p.bgAlt,
        color: p.fgMuted,
        border: 'none'
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.6em 0 0.4em' }
    },
    { dark: isDark }
  );

  const hl = HighlightStyle.define([
    { tag: t.keyword, color: p.red },
    { tag: [t.string, t.special(t.string)], color: p.green },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.gray, fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.null], color: p.yellow },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: p.blue },
    { tag: [t.variableName, t.propertyName], color: p.magenta },
    { tag: [t.typeName, t.className, t.namespace, t.tagName], color: p.cyan },
    { tag: t.heading, color: p.blue, fontWeight: '700' },
    { tag: t.link, color: p.blue, textDecoration: 'underline' },
    { tag: t.url, color: p.blue },
    { tag: t.strong, fontWeight: '700', color: p.fg },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: [t.meta, t.processingInstruction], color: p.gray },
    { tag: t.operator, color: p.red },
    { tag: t.punctuation, color: p.fgMuted },
    { tag: t.monospace, color: p.cyan },
    { tag: [t.quote], color: p.fgMuted, fontStyle: 'italic' },
    { tag: [t.atom, t.escape, t.regexp], color: p.magenta }
  ]);

  return [base, syntaxHighlighting(hl)];
}

export const appleDark: Extension = buildTheme(dark, true);
export const appleLight: Extension = buildTheme(light, false);
