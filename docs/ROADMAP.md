# TVSuite roadmap

Status legend: ✅ done & verified (unit/e2e) · 🟡 done, needs verification on real TradingView · 🔨 in progress · ⏳ planned · 🧪 needs research · ❓ open decision

_Last updated: 2026-10-11._

## Phase 0 — Research ✅
- ✅ TradingView feature-gap survey → `docs/research/tradingview-gaps.md`
- ✅ ChartSkins teardown (web, desktop, TopstepX/ProjectX, 40-release timeline, quirks) → `docs/research/chartskins.md`
- ✅ vngbh/tradingview-template-manager analysis (12 issues) → `docs/research/template-manager.md`
- ✅ Original feature ideas assessed, plus an adjacent brainstorm → `docs/IDEAS.md`

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

## Phase 8 — Risk Guard ✅ (🟡 screen-reading on real platforms)
- ✅ Rules shaped like broker risk settings: per-position risk/profit brackets, PDLL / PDPT with a Block or Warn action, firm daily loss limit, static / EOD / intraday trailing max loss with lock-at balance, evaluation target, consistency %, max contracts; trading day resets at a set time and zone (DST-safe)
- ✅ P&L from your entries, journal P&L (synced both ways), or read from the screen with a click-to-pick element picker
- ✅ Warn once per day per rule (sound, voice, notification, lights); Block = lock screen until reset, rule edits locked, override needs a typed phrase + 30 s wait and is logged
- ✅ Chart-time tracker (per day / session / symbol, idle detection, single-tab lease, daily limit, break reminders)
- ❌ Liquidation: TVSuite never sees or closes positions — set the broker's own "Liquidate and Block"
- 🟡 Picking P&L on TradingView's Account Manager, TopstepX and Tradovate (selectors survive hashed class names; not tried on the live sites)

## Phase 9 — Capture ✅
- ✅ Screenshot cards (6 themes, 4 aspects, symbol/price/session/day P&L/trade P&L/R chips, watermark); Alt+Shift+S copies
- ✅ Smart recorder: chart canvases → MP4 (Chrome 126+) or WebM, no screen-share prompt; starts on entry (pop-up, hotkey, or open P&L ≠ 0), stops N s after exit; overlays; mic narration; library page with entry/exit markers
- ✅ Discord webhooks + Telegram bots from the background only; auto-share cards, journal, risk hits, recordings; size limits respected
- ✅ Pre-roll: while “Record my trades” is on, WebCodecs keeps encoding the last N s (keyframe each second) and the clip starts there; muxed with real timestamps to MP4 (H.264) or WebM (VP9/VP8); entry marker at the right moment (e2e: 5.3 s pre-roll, plays at full length). MediaRecorder fallback when narrating with the mic
- 🟡 MP4 output needs a browser with an H.264 encoder (Chrome has one; the test Chromium produced WebM)
- ✅ End-of-session recap card: day or session; trades, net, win rate, profit factor, drawdown, streaks, R, chart time, rules kept/broken; manual or automatic at session close / day reset (once across tabs); Discord/Telegram

## Phase 10 — Mini windows ✅ (🟡 throttling when the chart tab is hidden)
- ✅ Mini chart (Document Picture-in-Picture, pop-up fallback): live chart mirror, price, tick line, session, day P&L, record/mute
- ✅ Player: library media, YouTube/Twitch embeds, direct links
- 🟡 Whether Chrome keeps repainting the chart while its tab is hidden behind other apps (the tick line keeps updating from the legend either way); YouTube/Twitch embeds inside TradingView's page policy

## Phase 11 — Room lighting & voice ✅ (🟡 real devices, real microphone)
- ✅ Hue (pairing, HTTPS), Home Assistant (covers Govee LAN/LIFX/Nanoleaf/Zigbee), WLED, Govee cloud; scenes: session colour, flashes, risk red/amber, calm
- ✅ Voice: push-to-talk / wake word, on-device recognition when available, command box (show/journal/screenshot/record/log trade/alert/P&L/price/sessions/mute/skins)
- ✅ Chart switching through TradingView's page API (no reload) with URL fallback
- 🟡 Hue certificate acceptance, Chrome Local Network Access prompt for extensions, Govee cloud field names (M), speech recognition inside TradingView's permissions policy

## Phase 12 — Indicators in other languages ✅
- ✅ Python / JavaScript / Java → Pine v6 translator for the indicator subset; line-numbered errors; AI translation for the rest; saved library
- ✅ Send to Pine Editor, verified against the real Monaco editor (0.57) in textarea and EditContext modes with the Monaco global removed: opens the editor, types line by line (fixing auto-indent), reads it back, optional Add to chart; clipboard + steps otherwise
- 🟡 On tradingview.com itself: depends on its Pine Editor button and Monaco build; the read-back check means it never claims success it can't see
- ⏳ Strategies (strategy.*), loops via `for` translation, a local preview that draws the indicator on TVSuite's own layer

## Phase 13 — Co-watch ✅ (🟡 across real networks)
- ✅ WebRTC data channel with copy-paste handshake codes, symbol follow, chat, pings; optional STUN
- 🟡 Different networks (STUN works for most home routers; strict NATs need a TURN relay, which TVSuite doesn't run)

## Phase 14 — Feedback from first real use ✅ (🟡 on live sites)
- ✅ Typing in the panel's own fields no longer triggers TradingView shortcuts: a key guard registered at document start stops those keys before the page sees them, plus a bubble-phase guard on the panel. Covered by an e2e check where the mock page listens in both capture and bubble phase.
- ✅ The TVS button can be hidden completely (About → Launcher, or the popup). The hotkey and the popup's Open panel button still open the panel.
- ✅ A full-page settings view (`settings.html`, opened from the popup's All settings) that renders the panel's tabs against stored settings. Edits are re-applied to a fresh copy before saving, so they don't overwrite newer changes made in a chart tab.
- ✅ Embedded platforms: the popup couldn't read the tab's address without the activeTab permission, so the Turn on here button never appeared on TradeSea. Fixed, and the button now also asks for same-domain iframe hosts and reloads the page.
- 🟡 TopstepX and TradeSea on the live sites: not checked (needs a login). If the chart sits in an iframe on a different domain, add that host under Accounts, sites & data.
- 🟡 The key guard assumes the page's shortcut handlers don't register before the content script at document start. Confirmed against the mock page only.
- ❓ "Some parts at the bottom are themed but the lines aren't": the report was unclear. Needs a screenshot or a description of which strip and which lines (grid, axis borders, the time scale, the pane separator) look wrong. Not changed yet ⏳

## Phase 5 — Desktop ✅ (🟡 on real installs)
- ✅ `desktop/launcher.mjs`: `attach | launch | doctor`, loopback-only, chart-URL and CDP-method allow-lists, `Page.enable` + persistent injection across reloads (verified e2e against Chromium with a debug port)
- 🟡 Windows MSIX activation via AUMID (community-reported working on 3.3.0)
- 🟡 macOS v3.x "bad option": hypothesis is an inherited `ELECTRON_RUN_AS_NODE`; the launcher scrubs `ELECTRON_*`/`NODE_OPTIONS`
- ⏳ Optional tray app / auto-attach on login (deliberately not built yet, because of the security trade-off)

## Verification
- `npm test`: 107 unit tests
- `npm run e2e`: 67 checks. They run the real extension in Chromium against the mock TradingView page on the real origin, plus the desktop bundle and the launcher over CDP. The suite loads a test copy of the extension that may reach 127.0.0.1, so mock Discord, Telegram and light servers can stand in for the real ones, and it serves the real Monaco editor from node_modules for the Pine Editor checks.
- Known flake: before the multi-tab fix, the co-watch check failed in 2 of 3 full runs (two panels re-saving settings). After the fix, the two-tab check failed once with no captured cause, then passed 2 of 2 full runs. It now reports what blocked the click if it happens again ⏳
- `node test/e2e/perf.mjs`: per-skin cost table

## Not yet verified on live TradingView ❓
1. The mock page can't stand in for these, so they need a real browser and account:
   - load `dist/extension` on a real TradingView chart and check **About → Diagnostics**: "Background clears" > 0 and "Legend found: yes";
   - try the Templates tab on a test account first;
   - try `node desktop/launcher.mjs doctor`, then `node desktop/launcher.mjs` with TradingView Desktop;
   - Sound: place a paper trade and check the entry sound fires; if not, copy the pop-up's text into Sound → Trade & alert detection;
   - Bridge: on TopstepX (added under Other sites), check the symbol appears under Bridge → Linked tabs, and that its contract id matches the ProjectX row;
   - Risk Guard: set a PDLL/PDPT, then Rules → P&L source → Read from screen → pick the day P&L in TradingView's Account Manager (or TopstepX) and check Today shows it;
   - Recorder: Capture → Recorder → Record my trades, place a paper trade, and check the clip in Recordings;
   - Mini chart: Alt+Shift+P, switch to another app, and see whether the chart keeps moving;
   - Lights / Discord / Telegram: add a device or webhook in Options and press Test;
   - Voice: Sound → Voice, press Alt+Shift+V and say "show NQ five minute".
2. The gallery index URL assumes `main` on `sh1lll/TVSuite`; change `GALLERY_URL` in `src/background.js` if it's hosted elsewhere.

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
- D12: Risk Guard blocks the chart page and warns; it never liquidates (no access to orders by design). Broker-side PDLL/"Liquidate and Block" is the real enforcement.
- D13: All outbound integrations (Discord, Telegram, lights, AI) run in the background worker; secrets live in their own storage keys that the page never reads.
- D14: The recorder draws the chart's own canvases instead of screen capture: no permission prompt, records only the chart, works in the background tab.
- D15: Indicators are translated to Pine (TradingView can't run other languages); the built-in translator handles a defined subset and says exactly which line it can't, AI handles the rest.
- D16: Co-watch has no server; handshake by copy-paste codes; optional public STUN only.
- D17: A tab's open panel tab/sub-view is per tab (not synced), so several open charts don't fight.
- D7: Session HUD and tab use a cached next-event search (measured 50–75 ms/s before).
