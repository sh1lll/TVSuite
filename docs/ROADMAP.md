# TVSuite roadmap

Status legend: ✅ done & verified (unit/e2e) · 🟡 done, needs verification on real TradingView · 🔨 in progress · ⏳ planned · 🧪 needs research · ❓ needs owner decision

_Last updated: 2026-10-11 (session 1, round 3: media, sound, bridge)._

## Phase 0 — Research ✅
- ✅ TradingView feature-gap survey → `docs/research/tradingview-gaps.md`
- ✅ ChartSkins teardown (web, desktop, TopstepX/ProjectX, 40-release timeline, quirks) → `docs/research/chartskins.md`
- ✅ vngbh/tradingview-template-manager analysis (12 issues) → `docs/research/template-manager.md`
- ✅ Assessment of the owner's ideas + adjacent brainstorm → `docs/IDEAS.md`

## Phase 1 — Core platform ✅
- ✅ Settings store (chrome.storage / localStorage) with defaults merging; key-order-independent echo detection
- ✅ Event bus; null-safe DOM builder (no `innerHTML` with data); hotkeys (layout-independent)
- 🟡 Adapters: `tradingview`, `tradingview-embed` (Charting Library on TopstepX/ProjectX/brokers), `generic(selector)`. Selectors unverified on live TradingView.
- ✅ In-page panel (shadow DOM, draggable), popup, options page, session HUD
- ✅ Build → `dist/extension` (MV3), `dist/tvsuite-inject.js` (desktop), `dist/tvsuite.user.js` (userscript)

## Phase 2 — Live skins ✅ (🟡 on live TradingView)
- ✅ 10 canvas + 3 shader built-ins; 4 gallery skins (3 canvas, 1 shader)
- ✅ Sandbox: an opaque-origin page (CSP `connect-src 'none'`) runs a per-skin Worker with OffscreenCanvas. Heartbeat watchdog, crossfade, status only from the current layer. Escape probe verified sealed.
- ✅ **Under** mode: the MAIN world clears full-canvas background fills on attached chart canvases only. Axes are optional; snapshots are untouched. **Overlay** blend mode as a fallback.
- ✅ Reactive signals (opt-in): legend OHLC + title price → range, velocity, distance from the daily open, pulse; adaptive calm mode
- ✅ Session themes; ✅ per-symbol pinned skins; ✅ stream mode (hide UI)
- ✅ Skin packs: schema, validation, `TVSKIN1.` fragment links, trust prompt; ✅ gallery (bundled + remote index)
- ✅ AI generation: Anthropic SDK (`claude-opus-5-5`, JSON schema output, refusal fallback) or OpenAI-compatible
- ✅ My media: own MP4/WebM/MOV/GIF/PNG/JPG/WebP/AVIF stored in extension IndexedDB, played by the extension-origin media frame
- ✅ Skin rotation (clock-derived, consistent across tabs) · ⏳ per-chart layers in multi-chart layouts; `iChannel` textures for shaders; volume-reactive input
- ✅ Skin Studio: remix any built-in (live preview, params, colours) or write canvas/GLSL code; edit, duplicate, share from My skins
- ✅ Starter custom skins installed on first run (5 remixes + gallery skins)
- ✅ Panel redesign: live animated previews on every card (code skins previewed via the sandbox), hero, icon tabs, switches, filled sliders, segmented controls

### Measured skin cost (JS per frame inside the worker, headless Chromium, no GPU)
| skin | ms | skin | ms | skin | ms |
|---|---|---|---|---|---|
| aurora | 0.24 | digital-rain | 0.53 | plasma ⓢ | 0.05 |
| starfield | 0.58 | gradient-drift | 0.08 | tunnel ⓢ | 0.06 |
| rain-neon | 0.29 | embers | 0.70 | fireflies | 0.40 |
| synthwave | 0.15 | sakura-dusk | 0.42 | snowfall | 0.25 |
| plexus | 0.46 | silk ⓢ | 0.06 | topo-lines | 2.09 |
| nebula | 2.37 | | | | |

ⓢ = shader. In this container fps was 8–20, limited by the software rasterizer, not skin code. Real-GPU numbers are still to be measured ⏳.

## Phase 3 — Template manager ✅ (🟡 endpoints on live TradingView)
- ✅ Fetches themes plus 52 drawing-tool types with bounded concurrency, retry/backoff and auth detection
- ✅ Snapshot history, diff vs live, restore with overwrite/skip/rename, and a summary confirmation
- ✅ Auto-snapshot before restore and reset; reset aborts if the snapshot would be incomplete; typed `DELETE`
- ✅ Interop with the victornpb/vngbh backup format
- ✅ Scheduled auto-backup (read-only, skips unchanged, claims the slot so parallel tabs don't duplicate)
- 🧪 Indicator templates, chart layouts, watchlists, alerts (endpoints not mapped)

## Phase 4 — Trader tools
- ✅ Session clock (DST-aware, overnight sessions, cached next-event search) + HUD
- ✅ Position-size calculator (stocks, futures point value, FX lots, crypto) with float-safe rounding
- ✅ Focus mode
- ✅ Trade journal: Alt+Shift+J chart capture (own canvases, clean background) + context → local journal page (stats by session/symbol/tag/side/weekday, equity curve in R, CSV/JSON export, formula-safe CSV) (gaps F1/F2)
- ⏳ Hotkey remapper, visibility presets, spacebar fix (gaps A1–A3) — needs live DOM work
- ✅ Custom alert sounds (gap C4) — see Phase 6 · ⏳ layout search/tags (E1) · ⏳ UI theme packs for TradingView chrome (K1)

## Phase 6 — Sound ✅ (🟡 on live TradingView)
- ✅ Synth engine: 15 effects, 6 generated ambient beds, ducking, own files (IndexedDB) and links; verified non-silent by offline render (e2e)
- ✅ Events: trade entered/closed + TradingView alerts (toast keywords, editable) or hotkeys; local price alerts (once/every time, per symbol); daily-open cross; big candle; bar close; session open/close/1 min before; calm; journal capture
- ✅ Voice announcements (system voices, rate, per-event); mute hotkey
- ✅ Extension audio frame (autoplay delegated) and in-page engine for desktop/userscript (both e2e)
- 🟡 Desktop notifications (optional permission, options page); not verifiable headless
- 🟡 Real TradingView toast wording; real-tab autoplay after first click
- ⏳ Sonification, tilt guard, per-symbol sound packs, shareable sound packs (see IDEAS §D)

## Phase 7 — Platform Bridge ✅
- ✅ Symbol translator, 12 platforms, round-trip tested; quarterly front-month estimate
- ✅ Watchlist converter (TradingView sections, CSV, line lists in/out; skipped report; formula-safe CSV)
- ✅ Open in… links; right-click "Open in TradingView" on any site (contextMenus)
- ✅ Linked tabs across platforms (e2e: a TopstepX symbol jumps this chart)
- 🟡 ProjectX roots: ENQ and MNQ confirmed from published ids; EP (ES), MES and the rest unconfirmed → overridable
- ⏳ Trade-history CSV → chart markers, journal export to Tradervue/TradesViz, levels export, Pine → ThinkScript/NinjaScript (see `docs/research/platform-bridge.md`)

## Phase 5 — Desktop ✅ (🟡 on real installs)
- ✅ `desktop/launcher.mjs`: `attach | launch | doctor`, loopback-only, chart-URL and CDP-method allow-lists, `Page.enable` + persistent injection across reloads (verified e2e against Chromium with a debug port)
- 🟡 Windows MSIX activation via AUMID (community-reported working on 3.3.0)
- 🟡 macOS v3.x "bad option": hypothesis is an inherited `ELECTRON_RUN_AS_NODE`; the launcher scrubs `ELECTRON_*`/`NODE_OPTIONS`
- ⏳ Optional tray app / auto-attach on login (deliberately not built yet, because of the security trade-off)

## Verification
- `npm test`: 77 unit tests
- `npm run e2e`: 46 checks with the real extension in Chromium against the mock TradingView page on the real origin, plus the desktop bundle and the launcher over CDP
- `node test/e2e/perf.mjs`: per-skin cost table

## Open items needing the owner ❓
1. ~~GitHub push blocked~~ — resolved: the work is pushed (after a recorded demo, `npm run demo`).
2. **Live verification on your machine**, which I can't do from the build container:
   - load `dist/extension` on a real TradingView chart and check **About → Diagnostics**: "Background clears" > 0 and "Legend found: yes";
   - try the Templates tab on a test account first;
   - try `node desktop/launcher.mjs doctor`, then `node desktop/launcher.mjs` with TradingView Desktop;
   - Sound: place a paper trade and check the entry sound fires; if not, copy the pop-up's text into Sound → Trade & alert detection;
   - Bridge: on TopstepX (added under Other sites), check the symbol appears under Bridge → Linked tabs, and that its contract id matches the ProjectX row.
3. The gallery index URL assumes `main` on `sh1lll/TVSuite`; change `GALLERY_URL` in `src/background.js` if you host it elsewhere.

## Decisions log
- D1: Transparency by clearing the background fill at draw time, never by writing chart settings. This avoids ChartSkins' synced-layout leak (their v1.0.18) and snapshot breakage (v1.0.30/31).
- D2: All skin code runs in a Worker inside an opaque-origin sandbox page; generated code never touches the TradingView page. Local media uses a separate extension-origin frame because the sandbox can't read extension storage.
- D3: No accounts, no telemetry, no hosting. Sharing is by JSON files, fragment links, or PRs to `gallery/`.
- D4: Template backups keep the community JSON format.
- D5: The default AI model is `claude-opus-5-5`, through the official SDK in the background worker. The key never reaches the page.
- D6: Bundled art and shaders are all original. Shadertoy content (mostly CC BY-NC-SA) and ChartSkins media are not bundled.
- D8: Trade detection is passive (pop-up keywords + manual hotkeys). TVSuite never reads or places orders.
- D9: Desktop notifications are an optional permission, requested only when turned on.
- D10: Bridge data never leaves the browser; linked tabs use extension storage and expire after 12 h.
- D11: Only ProjectX roots confirmed from published contract ids are shown as verified; everything else is flagged and overridable rather than guessed silently.
- D7: Session HUD and tab use a cached next-event search (measured 50–75 ms/s before).
