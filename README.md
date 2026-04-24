# Markdown Editor

A small, cross-platform Markdown reader / editor for Windows and macOS. Built with **Tauri 2** + **SvelteKit 5** + **CodeMirror 6**. Installer is ~10 MB.

## Features

- Read-first view mode (single rendered pane) with edit mode toggle (split editor + preview) — `Ctrl/Cmd+E`
- Live rendering via `markdown-it`, syntax highlighting via `highlight.js`, Mermaid diagrams
- Apple System Colors theme (from Ghostty) — light and dark, tracks OS preference, manual toggle
- Auto-hiding hamburger sidebar with live Table of Contents, resizable width, persistent
- XSS-sanitized preview (DOMPurify); external links open in the system default browser
- Zoom (`Ctrl+=/−/0` or `Ctrl+scroll`), persistent; transient zoom indicator
- `.md` / `.markdown` file association registered on install (double-click in Explorer/Finder opens here)

## Dev

```bash
npm install
npm run tauri dev
```

First run compiles the Rust shell (several minutes).

## Build installers

```bash
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`. Run on the target OS — Tauri can't cross-compile the webview bindings.

## Icon

`icon.svg` is the source. To re-render `icon.png` (1024×1024) after edits:

```bash
node scripts/render-icon.mjs
npm run tauri icon icon.png
```

## Release

Push a `v*` tag to trigger the GitHub Actions matrix in `.github/workflows/release.yml` — produces a draft release with Windows `.msi` / `.exe` and macOS `.dmg` (Intel + Apple Silicon). Unsigned.
