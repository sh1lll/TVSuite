# TVSuite roadmap

Status legend: ✅ done & verified · 🟡 done, needs real-TradingView verification · 🔨 in progress · ⏳ planned · 🧪 idea / research · ❓ needs owner decision

## Phase 0 — Research (✅)
- ✅ TradingView feature-gap survey → `docs/research/tradingview-gaps.md`
- ✅ ChartSkins teardown (web, desktop, TopstepX/ProjectX, quirks) → `docs/research/chartskins.md`
- ✅ vngbh/tradingview-template-manager analysis → `docs/research/template-manager.md`
- ✅ Brainstorm of adjacent features → `docs/IDEAS.md`

## Phase 1 — Core platform
- ✅ Settings store (chrome.storage / localStorage), event bus, safe DOM builder (no innerHTML for untrusted text)
- 🔨 Site adapters: TradingView (🟡 selectors unverified on live TV), generic "any canvas dashboard" adapter
- 🔨 In-page panel (shadow DOM), hotkeys, popup, options page
- 🔨 Build (esbuild) → `dist/extension` (MV3) + `dist/tvsuite-inject.js` (desktop/userscript bundle)

## Phase 2 — Live skins (ChartSkins-class, open & local)
- ✅ Pure-logic signals: price parsing, per-bar range average, velocity, distance from daily open, adaptive calm mode (unit-tested)
- ✅ Session clock with IANA time zones/DST, overnight sessions, overlap hand-off (unit-tested)
- ✅ Skin packs: JSON schema, validation, compressed share links in the URL fragment (unit-tested)
- 🔨 10 built-in canvas skins + 3 GLSL shader skins
- 🔨 Sandboxed renderer: extension sandbox page (opaque origin, CSP `connect-src 'none'`) → per-skin Worker + OffscreenCanvas, heartbeat watchdog, crossfade
- 🔨 Two compositing modes: **under** (MAIN-world clears the chart's background fill; nothing written to TradingView settings) and **overlay** (blend-mode layer, zero page patching)
- 🔨 Chart-reactive skins (opt-in, local only), session-aware themes, adaptive calm mode
- 🔨 Generated skins: prompt → any connected model (Anthropic or OpenAI-compatible incl. local Ollama) → sandboxed canvas program
- ⏳ Local media skins (own video/GIF from disk via extension IndexedDB → Blob to sandbox)
- ⏳ Community gallery index (static JSON in this repo) + "submit via PR"
- ⏳ Per-chart layers in multi-chart layouts (currently one layer spans the layout)

## Phase 3 — Template manager (supersedes vngbh/victornpb scripts)
- 🔨 Fetch themes + 52 drawing-tool template types with bounded concurrency and retries
- 🔨 Local snapshot history, diff vs live, selective restore with conflict strategy (overwrite / skip / rename)
- 🔨 Safety: automatic snapshot before any destructive action; typed confirmation for factory reset
- 🔨 Interop: reads/writes the victornpb/vngbh backup JSON format
- ⏳ Scheduled auto-backup
- 🧪 Indicator (study) templates, chart layouts, watchlists — endpoints not yet verified

## Phase 4 — Trader tools
- 🔨 Session bar HUD (open/closed state, countdown to next open/close)
- 🔨 Position-size calculator (stocks, forex lots, futures contracts with point value)
- 🔨 Focus mode (hide TradingView chrome with one key)
- ⏳ Hotkey remapper, visibility presets, spacebar fix (gap A1–A3)
- ⏳ Screenshot → local journal entry (gap F1/F2)
- ⏳ Custom alert sounds (gap C4)

## Phase 5 — Desktop
- 🔨 `desktop/launcher.mjs`: attach to an existing CDP port, or launch TradingView Desktop with a loopback-only debug port and inject the same bundle (persisting across reloads)
- 🟡 Windows MSIX activation via AUMID (community-reported working on 3.3.0; untested here)
- 🟡 macOS v3.x "bad option" — hypothesis: inherited `ELECTRON_RUN_AS_NODE`; launcher scrubs `ELECTRON_*` env vars

## Verification status
- Unit tests: `npm test`
- End-to-end: `npm run e2e` loads the real MV3 extension in Chromium against a high-fidelity **mock** TradingView page served on the real `https://www.tradingview.com/chart/` origin (request interception), because the build environment cannot reach TradingView.
- ❗ Not yet verified on live TradingView: DOM selectors, the background-fill clear in production builds, template endpoints (taken from two working public scripts), Desktop launch on real installs.

## Decisions log
- D1: Transparency by clearing the full-canvas background fill at draw time (MAIN world), never by writing chart settings. This avoids ChartSkins' synced-layout leak (their v1.0.18) and keeps snapshots intact.
- D2: All skin code, built-in or generated, runs in a Worker inside an opaque-origin sandbox page. Generated code never touches the TradingView page.
- D3: No accounts, no telemetry, no remote hosting. Sharing = JSON files or fragment links.
- D4: Template backups keep the community JSON format for interoperability.
