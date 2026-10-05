# Tiya

Tiya is a local, private LaTeX editor with a bundled Tectonic engine. Open a project folder, edit source files, and preview the compiled PDF without installing a separate TeX distribution.

## Download

Download the latest Linux, macOS, or Windows installer from the [latest release](https://github.com/saqib40/tiya/releases/latest).

Tectonic is included. Some advanced projects that require XeLaTeX, LuaLaTeX, shell escape, or external system tools are not yet supported.

## Features

- Project-aware compilation with root-document selection
- Local Monaco editor and bundled interface fonts
- PDF search, navigation, export, and bidirectional SyncTeX
- Multiple source tabs, crash recovery, and external-change handling
- Article, report, CV, and presentation templates
- Safe Overleaf ZIP import and image/PDF asset previews
- Automatic or manual builds with cancellable, streamed compiler output

## Development

Requirements:

- Node.js 20 or newer
- Rust stable
- The [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform

```sh
npm ci
npm test
npm run tauri dev
```

Frontend production build:

```sh
npm run build
```

Native tests:

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

Release builds download the pinned Tectonic binary for each target and package it with Tiya.