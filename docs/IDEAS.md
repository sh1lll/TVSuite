# TVSuite ideas: the owner's list, assessed, plus adjacent ideas

Status: ✅ shipped in this repo · 🔨 partial · ⏳ next · 🧪 needs research · ❌ rejected (reason given)

## A. Your ideas: assessment and status

| Idea | Status | How it's done / notes |
|---|---|---|
| **Skins that react to the chart** (tint, intensity, particle speed from candle range, session change, distance from daily open; opt-in, local-only) | ✅ | `SignalTracker` reads the legend OHLC and the tab-title price four times a second. A per-bar EMA of range normalizes "big candle"; velocity is measured in range units per second; distance from the daily open is signed and clamped; a pulse fires on session change. **Off by default; nothing leaves the browser.** Live meters in the panel. |
| **Session-aware themes** (Tokyo / London / New York) | ✅ | Clock only, IANA time zones (DST-correct), overnight sessions, editable sessions, and a skin per session. On overlaps the most recently opened session wins, so London hands over to NY at 09:30 ET. A HUD shows the next open/close. |
| **Generated skins** ("rainy neon street" → any model → sandboxed canvas function) | ✅ | Anthropic (official SDK, `claude-opus-5-5` default, structured JSON output, refusal fallback) or any OpenAI-compatible endpoint, including local Ollama/LM Studio. The code runs in a **Worker + OffscreenCanvas inside an opaque-origin sandbox page** with `connect-src 'none'`. Network globals are removed, and a watchdog kills hung skins. The e2e suite verifies that a constructor-escape probe finds no `fetch`/`XHR`/`WebSocket`/`document`. |
| **Shader skins** (Shadertoy-style WebGL) | ✅ | `mainImage(out vec4, in vec2)` with `iTime`, `iResolution`, `iFrame`, `iDate` and `iMouse`, plus TVSuite's `iSignal`/`iCalm`/`iPulse`. WebGL2 with a WebGL1 fallback. Three original shaders ship. **Note:** most Shadertoy shaders are CC BY-NC-SA, so users can paste them for personal use, but the project shouldn't bundle them. `iChannel` textures aren't supported yet (⏳). |
| **Skin packs** (JSON, shareable by link, cheap community gallery) | ✅ | Schema `tvsuite.skin/1`, validation, and `TVSKIN1.` links (deflate + base64url) carried in the **URL fragment**, so no server ever sees them. Code-bearing skins get a trust prompt with a code preview. Gallery ✅: `gallery/index.json`, bundled and remote, with submissions via PR. |
| **Adaptive calm mode** | ✅ | Activity = max(range ratio, 2 × velocity) feeds a smoothstep with a threshold, a floor, and smoothing on the way in and out. The regime adapts, so a sustained high-volatility day becomes the new normal and calm releases. Unit-tested and verified e2e on the mock page. |
| **Adapters for other sites** (Grafana, exchange charts, any canvas dashboard) | ✅ | Adapter interface: `layoutHost`, `clearScope`, `readObservation`, `transparentSelectors`. Built-in adapters: `tradingview`, `tradingview-embed` (Charting Library on TopstepX/ProjectX and brokers; same DOM, runs in all frames) and `generic(selector)`. Sites are added per host with Chrome's optional permissions and registered at runtime. Popup has **"Turn on here…"**, ChartSkins-style. |
| **Desktop launcher** (start TradingView Desktop with a debug port, inject the same bundle) | ✅/🟡 | `desktop/launcher.mjs`: attach, launch, or doctor. Loopback only, chart-URL allow-list, CDP method allow-list, persistent injection across reloads, multi-window watch. Windows Store builds are activated by AUMID; `ELECTRON_*` is scrubbed for the macOS "bad option" reports. Verified against Chromium with a debug port; **not yet on a real TradingView Desktop install.** |
| **All-in-one suite** (skins + template manager) | ✅ | One extension, one panel: Skins · Templates · Sessions · Tools · About. Plus a desktop bundle and a userscript. |

## B. Adjacent ideas: make TradingView cooler

1. **Volume-reactive ambience.** If the volume legend is present, skins breathe with relative volume. ⏳ S
2. **Big-print flash.** A one-off ripple when a bar's range exceeds N× average. It respects calm mode, so it's never during chaos. ⏳ S
3. **P&L mood.** When the broker panel shows open P&L, tint slightly green or red. Opt-in, local. 🧪 M (DOM fragile)
4. **Skin playlists.** Rotate skins every N minutes ✅. Per asset class ⏳ S
5. **Per-symbol skins.** Remember a skin per ticker. ✅
6. **Time-of-day lighting.** Skins dim through the evening and switch to "night" palettes after your local cutoff. ⏳ S
7. **News-time guard.** Calm the skin around scheduled high-impact events from a user-maintained local list. No feed is fetched. ⏳ M
8. **Stream / screenshot mode.** One key hides TVSuite UI ✅ (Alt+Shift+H). Corner badge and freeze frame ⏳ S
9. **Shader editor with live preview.** A side-by-side GLSL editor in the options page with error underlines. ⏳ M
10. **Image-to-palette.** Drop an image; TVSuite extracts a palette and applies it to the aurora/plexus parameters. ⏳ S
11. **Sound-reactive skins** from microphone or system audio. Fun for streams, opt-in. 🧪 M
12. **Multi-chart layer modes:** one layer per chart pane, each optionally reacting to *its own* symbol. ⏳ M

## C. Should exist in TradingView (from the gap survey) and fit TVSuite

Ranked by demand evidence vs effort. See `docs/research/tradingview-gaps.md`.

| Feature | Gap | Feasibility | Plan |
|---|---|---|---|
| **Position-size calculator** (stocks, futures point value, FX lots, crypto) | B5 | ✅ shipped | Next: read entry/stop from the selected Long/Short Position drawing. 🧪 |
| **Hotkey remapper + visibility presets + "spacebar = next symbol" off** | A1–A3 | Yes, S–M | ⏳ Keydown capture → TradingView actions via simulated UI or DOM |
| **Full account backup** (templates ✅ with scheduled auto-backup ✅; layouts, indicator templates, watchlists, alerts still to do) | B1, D1, C2 | Partial, M–L | 🧪 Map the remaining endpoints on a real account |
| **Alert bulk tools** (create across a watchlist, copy, backup) | C1–C2 | Yes, M | 🧪 Endpoints; rate limits; ToS care |
| **Custom alert sounds** | C4 | ✅ shipped | Sound tab: TradingView alert/order toasts (keyword-matched) → built-in or your own audio, plus voice |
| **Screenshot → local journal** with tags, R-multiple, session and a notes DB in IndexedDB | F1/F2 | ✅ shipped | Next: auto-fill entry/stop from the selected position drawing 🧪 |
| **Personal risk guard** (daily loss lockout overlay) | F3 | Partial | 🧪 Can only *warn* or dim order buttons; never touches orders |
| **Layout search/tags** | E1 | Yes, S–M | ⏳ |
| **Custom UI themes** beyond light/dark (CSS variables for TradingView chrome) | K1/K2 | Yes, S–M | ⏳ Pairs naturally with skins: "full theme packs" |
| **Feed filtering** (mute authors/topics) | J2 | Yes, S | ⏳ |
| **Auto-apply indicator template per asset class** | E4 | Yes, M | 🧪 |
| **Watchlist export with sections + import from Finviz/CSV** | D5 | Yes, S | ⏳ |
| **Crypto order-flow overlays** from public exchange WebSockets (CVD, big trades, heatmap) | H1–H3 | Partial (crypto only), L | 🧪 Separate opt-in module; clearly labelled data source |

## D. Sound & senses: things that should exist (new lane)

| Idea | Status | Notes |
|---|---|---|
| **Event sounds**: trade entered/closed, TradingView alert, local price level, daily-open cross, big candle, bar close, session open/close/one minute to open, calm mode, journal capture | ✅ | 15 synthesized effects, or your own MP3/WAV/OGG/M4A/FLAC, or a link. Rate-limited. Every effect is verified non-silent by an offline render in e2e. |
| **Ambient trading beds**: rain, ocean, brown/pink noise, lo-fi pad, space drone, or your own loop or link | ✅ | Ducks automatically under event sounds and speech. |
| **Voice announcements** ("NQ crossed 21,000", "London is open") | ✅ | System voice, rate and voice picker, per-event toggle. |
| **Local price alerts** that don't use TradingView alert slots | ✅ | Read from the price on screen while the chart is open; once or every time; per symbol. |
| **Manual trade hotkeys** (Alt+Shift+E / X) and **mute** (Alt+Shift+M) | ✅ | For platforms whose fills TVSuite can't see. |
| **Sonification**: a soft pitch drone that follows price relative to the daily range, so you can hear a trend while looking elsewhere | ⏳ S | Uses the existing signal tracker |
| **Tape ticks**: a click per N contracts traded (crypto public trades or chart volume) | 🧪 M | Crypto WebSocket only, opt-in |
| **Tilt guard**: after N losing exits in a row (from toasts or the journal), play a calm cue and dim the chart for 60 s | ⏳ S | Warns only; never blocks orders |
| **Desktop notifications** mirroring sound events when the tab is in the background | 🟡 | Optional `notifications` permission, turned on in Options. Not verifiable headless. |
| **Pomodoro / break reminders** tied to session clock ("NY lunch: step away") | ⏳ S | |
| **Haptics** on supported devices (gamepad rumble / phone companion) | 🧪 | Gimmick, but fun for streams |
| **Per-symbol sound packs** (a different entry sound per instrument) | ⏳ S | Same model as per-symbol skins |
| **Shareable sound packs** (`tvsuite.sounds/1` JSON, synth settings only, no copyrighted audio) | ⏳ S | Same fragment-link scheme as skins |

## E. Platform Bridge: TradingView ⇄ other platforms (new lane)

Full list and status in `docs/research/platform-bridge.md`. Shipped: a symbol translator for 12 platforms, Open in…, right-click "Open in TradingView" on any site, linked tabs across platforms, a watchlist converter, and ProjectX root overrides. Next: trade-history CSV → chart markers, journal export to Tradervue/TradesViz, level export to NinjaTrader/Sierra/TOS, and Pine → ThinkScript/NinjaScript through the AI provider.

## F. Round 4: your picks, built

| Idea | Status | Notes |
|---|---|---|
| **Prop-firm rules tracker**, acting like a broker's "Personal Daily Loss Limit / Profit Target / Liquidate and Block" | ✅ | Risk Guard: PDLL, PDPT, Block/Warn, trailing max loss, consistency, brackets. P&L comes from you, the journal or the screen. Block = lock screen; liquidation stays with the broker (❌ by design). |
| **Journal available everywhere** | ✅ | P&L $ and contracts fields; Risk tab → Journal; synced with Risk Guard |
| **Chart-time tracker** (session-configurable) | ✅ | Per session/symbol, idle detection, limits, break reminders |
| **Floating mini window, both ways** | ✅/🟡 | Mini chart over other apps; a player over the chart |
| **Screenshot beautifier** | ✅ | Cards with themes, aspects, chips, watermark |
| **Smart recorder** (starts on entry, stops when flat, very configurable) | ✅ | Pre-roll ⏳ |
| **Indicators in Python / Java / JavaScript on TradingView** | ✅ | Translated to Pine v6 (TradingView runs only Pine) |
| **Discord / Telegram** | ✅ | Background-only, opt-in per kind |
| **Co-watch** | ✅/🟡 | WebRTC + copy-paste codes; TURN relay not provided |
| **Room lighting** (off by default) | ✅/🟡 | Hue, Home Assistant, WLED, Govee cloud |
| **Voice commands** (opt-in, labelled) | ✅/🟡 | On-device when available |

### Next ideas in this lane
- **Pre-roll recording** (segmented recorder, keep the 20 s before an entry). ⏳ M
- **End-of-session recap card**: trades, R, chart time, rules followed, auto-sent to Discord/Telegram. ⏳ S
- **Tilt guard**: N losses in a row → lights dim, calm cue, 60 s pause screen (Risk Guard has the plumbing). ⏳ S
- **Pre-trade checklist** on Alt+Shift+E (your rules, saved with the trade). ⏳ S
- **Local indicator preview**: run the translated indicator on TVSuite's own recorded prices and draw it on the skin layer. 🧪 M
- **Co-watch drawings**: share a horizontal level or zone with your partner. 🧪 M
- **Stream Deck / MIDI** buttons for entry/exit/record/card. ⏳ M

## G. Rejected or deferred on purpose

- ❌ **Bypassing plan limits** (alert counts, bars, indicators per chart) or **ad removal**: ToS and ethics. Out of scope.
- ❌ **Client-side automated order management** (auto-breakeven, trailing) without broker support: a correctness risk with real money.
- ❌ **Copying ChartSkins' skins/videos or Shadertoy shaders into the repo**: licensing. All bundled art is original procedural code.
- ⏳ **Writing the transparent background into TradingView settings**: deliberately avoided (it leaks into synced layouts; see ChartSkins v1.0.18).
