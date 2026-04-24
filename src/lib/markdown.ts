import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight: (str: string, lang: string): string => {
    if (lang === 'mermaid') {
      const attr = md.utils.escapeHtml(str);
      return `<pre class="mermaid" data-mermaid-src="${attr}">${attr}</pre>`;
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        return `<pre class="hljs"><code>${out}</code></pre>`;
      } catch {
        /* fall through */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});

md.core.ruler.push('line_numbers', (state: StateCore) => {
  for (const tok of state.tokens) {
    if (tok.map && tok.level === 0) {
      tok.attrSet('data-line', String(tok.map[0]));
    }
  }
  return false;
});

export function render(src: string): string {
  return DOMPurify.sanitize(md.render(src));
}
