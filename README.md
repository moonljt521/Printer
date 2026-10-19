# BatchPrinter

**English** | [简体中文](README.zh-CN.md)

Multi-select files → batch print. BatchPrinter ships as two native-feeling implementations:

- **Desktop** ([`desktop/`](desktop/)) — Electron + TypeScript for **Windows** and **macOS**: right-click *Batch Print* on selected files, Office → PDF conversion, full print options, real printer job tracking.
- **iOS** ([`ios/`](ios/)) — Swift/SwiftUI for **iPhone/iPad (iOS 17+)**: a share extension that imports PDFs from Files, WeChat, QQ, etc., and prints them via AirPrint.

## Features

### Desktop (Windows / macOS)

- **Right-click integration** — Windows Explorer menu (HKCU registry, no admin) / macOS Finder Quick Action
- **Selection aggregation** — multiple processes spawned by Explorer are merged into one batch (single instance + 650 ms debounce)
- **Print dialog** — printer, copies, paper (A4/A3/Letter), duplex (long/short edge/off), color; remembers last settings
- **Page counts** — PDF parsed instantly; Office documents show real pages after conversion
- **Office → PDF** — headless LibreOffice (auto-detected; guided install when missing), covering doc/docx/xls/xlsx/ppt/pptx/odt/ods/odp/rtf
- **Honest progress** — tracks the CUPS job (macOS, with `ipptool` fallback) or SumatraPDF (Windows) until the printer actually finishes; retry failed files, stop mid-run (cancels the queued CUPS job)
- Drag & drop, per-file removal, dry-run mode for development

### iOS (iPhone / iPad, iOS 17+)

- **Share extension** — share PDFs straight from Files, WeChat, QQ, … ; files land in an App Group inbox and are picked up automatically
- **AirPrint** — printer picker with remembered selection, duplex & color options
- **Page counts & status** — PDFKit parsing, per-file state (waiting/printing/done/failed/skipped)
- **Job completion tracking** — file-level progress backed by `UIPrintInteractionControllerDelegate.didFinishJob` (watchdog timeout as a safety net)
- **Resilient submitting** — transient first-connect / local-network-permission failures are retried automatically
- Office files are detected and skipped with guidance (no iOS equivalent of LibreOffice)

## Capability matrix

| Capability | Desktop | iOS |
| --- | --- | --- |
| Entry point | Right-click menu | Share extension / in-app picker |
| PDF printing | ✅ `lp` (macOS) / SumatraPDF (Windows) | ✅ AirPrint |
| Office → PDF | ✅ LibreOffice | ❌ skipped with guidance |
| Copies / paper size | ✅ | ❌ not exposed by public API |
| Duplex / color | ✅ | ✅ |
| Page counts | ✅ | ✅ (PDF) |
| Real completion tracking | ✅ | ✅ (file-level) |
| Remember settings | ✅ | ✅ |
| Retry / stop / clear | ✅ | ✅ |

## Getting started

### Desktop

```bash
cd desktop
npm install                          # CN network: export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run build && npm test            # compile + unit tests (35 cases)
npm run dev                          # run in development

# packaging (on the target OS)
npm run dist:mac                     # macOS (zip/pkg; use `npx electron-builder --mac zip` where dmg hangs)
npm run dist:win                     # Windows (must run on Windows)
```

### iOS

```bash
cd ios
brew install xcodegen
xcodegen generate                    # creates BatchPrinterIOS.xcodeproj
open BatchPrinterIOS.xcodeproj       # set your Team on both targets, then Run
```

The project is XcodeGen-based: `project.yml` is the source of truth (signing team, bundle IDs, App Group `group.com.moon.batchprinter`). CLI build/install commands are documented in [`ios/README.md`](ios/README.md).

## Project layout

```
batchPrinter/
├── desktop/                 Electron + TypeScript (Windows, macOS)
│   ├── src/main/core/       pure logic (unit-tested): args, filetype, lp/Sumatra commands,
│   │                         registry/Quick Action, LibreOffice, PDF page counts
│   ├── src/main/services/   queue, printer backends, converter, settings, shell integration
│   ├── src/renderer/        print window + settings UI (plain TS + DOM)
│   └── tests/               node:test suite (35 cases)
└── ios/                     XcodeGen project (iOS 17+)
    ├── project.yml          targets: BatchPrinterIOS + ShareExtension
    ├── BatchPrinterIOS/     SwiftUI app (queue, AirPrint, settings, inbox)
    └── ShareExtension/      share extension (WeChat/QQ/Files import)
```

## Documentation

- [`desktop/README.md`](desktop/README.md) — desktop architecture, commands, packaging *(Chinese)*
- [`ios/README.md`](ios/README.md) — iOS structure, signing/deployment, WeChat/QQ import notes *(Chinese)*
- [README.zh-CN.md](README.zh-CN.md) — this document in Chinese

## Status

- **Desktop** — macOS verified end-to-end, including real printer job completion tracking; Windows packaging still needs a validation run on a Windows machine.
- **iOS** — built and verified on a real device (iPhone 13): share import (Files / WeChat / QQ), AirPrint printing with auto-retry, settings persistence, app icon.
