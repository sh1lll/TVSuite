# What TradingView is missing (as of Oct 2026)

*Compiled 2026-10-11. Direct access to reddit.com, x.com and tradingview.com was blocked from the research environment.
Evidence therefore comes from search-engine snippets of TradingView support/blog/idea pages, Chrome Web Store mirrors,
a cached r/TradingView "Feature Request" mirror, and GitHub repositories read directly. Items marked **[?]** could
not be confirmed. "Ext?" = can a browser extension do it client-side (Yes / Partial / No). Size: S days · M 1–3 weeks · L > month.*

## 0. Already shipped — not gaps

Multi-condition alerts (5 conditions, same symbol, Plus+), watchlist alerts (Premium+), alert presets (5),
Fibonacci-drawing alerts (May 2026), alert notification scheduling (Jul 2026), 40 built-in alert sounds (no custom upload),
synchronized bar replay (2024), Volume Footprint chart + Pine `request.footprint()` (2024 / Jan 2026), tick charts,
TPO, drawings sync across layouts (2023), multi-chart symbol/interval/crosshair/date-range sync, symbol notes, chart CSV export,
broker trades CSV export, order presets & brackets (broker-dependent), screener autosave/undo (May 2026), options tools,
Pine v6 / Logs / Profiler / enums / maps / `once` / tables in bottom panel, Desktop multi-monitor + tabs, AI Chart Copilot
(shipped as a Chrome extension beta, Apr 2026), Auto Pitchfork & Auto Chart Patterns.

## A. Basic QoL / UX

| # | Gap | Evidence | Ext? | Size |
|---|---|---|---|---|
| A1 | User-remappable hotkeys | r/TradingView "still no customizable hotkeys?"; idea "Custom Key Shortcuts…"; extensions Magical Keyboard Shortcuts, TradingViewPlus, tv-enhance | Yes | S–M |
| A2 | One-key hide/show all indicators; visibility presets (clean / analysis / live) | same idea; PresetSwitcher userscript | Yes | S |
| A3 | Disable "spacebar = next symbol" | Magical Keyboard Shortcuts free option | Yes | S |
| A4 | Folders/categories for favorite and invite-only indicators | idea "Categorize scripts in different classes" | Partial | M |
| A5 | Unified favorites panel (tools + timeframes) | r/TradingView feature-request flair | Yes | S |
| A6 | Opening news shouldn't close the watchlist | r/TradingView feature-request flair | Yes | S |
| A7 | Country filter in symbol search | TradingView idea (RELIANCE) | Partial | M |
| A8 | Watchlist caps (1000 symbols; few lists on Free) | support 43000611193; "Unlimited Watchlists", TickerStation | Yes (separate panel) | M |

## B. Drawing / tools

| # | Gap | Evidence | Ext? | Size |
|---|---|---|---|---|
| B1 | Export/import/share drawing templates & themes | r/TradingView request; victornpb/tradingview-backup, vngbh/tradingview-template-manager | **Yes — TVSuite ships this** | M |
| B2 | Native auto-trendlines (TrendSpider-style) | competitor comparisons; spiderlines userscript | Partial | M–L |
| B3 | Multi-timeframe overlay, Raindrop charts | TrendSpider comparisons | Partial / No | L |
| B4 | Position tool with multiple TPs / partial exits | Pine workarounds only | Partial | M |
| B5 | Risk → lots/contracts using real contract specs | Lot Size Calculator (2K+ users), Traidly, PilotView | **Yes — TVSuite ships a calculator** | M |
| B6 | Recurring/programmatic drawings (session lines, external levels) | spx-gex-monitor, spiderlines | Yes (web) | M |

## C. Alerts

| # | Gap | Evidence | Ext? | Size |
|---|---|---|---|---|
| C1 | Bulk-create / copy alerts across symbols | TVAlertsManager, QuickAlerts | Yes | M |
| C2 | Alert backup / restore / migrate | "Tradingview Alerts Manager" | Yes | M |
| C3 | Native Telegram/Discord delivery | webhook relays, tradingview-telegram-bot | Partial | S–M |
| C4 | Custom alert sounds | blog 46455 (no upload); tradingview_sound_customization | Yes | S |
| C5 | Screener alerts ("new symbol entered my screen") | not native; Pine workarounds capped | Partial | M |
| C6 | Multi-condition alerts across symbols/watchlists | support 43000761492 | Partial | L |
| C7 | More than 5 alert presets | support | Yes | S–M |
| C9 | Alert analytics (hit rate, searchable history) | alert-log CSV workarounds | Yes | S–M |

## D. Data / export / backup

| # | Gap | Evidence | Ext? | Size |
|---|---|---|---|---|
| D1 | Full account backup (layouts, templates, themes, alerts, watchlists, scripts) | only third-party pieces | Yes/Partial | M–L |
| D2 | Bulk OHLCV download across a watchlist | batch-download userscript; plan bar caps | Partial | M |
| D3 | Official automation API | **tradesdontlie/tradingview-mcp: 6.7K★** — the strongest demand signal | Partial | L |
| D4 | Pine library backup / git sync | Stratr, VS Code extensions | Yes/Partial | M |
| D5 | Rich watchlist export/import | native .txt only | Yes | S |

## E. Layout / workspace

| # | Gap | Ext? | Size |
|---|---|---|---|
| E1 | Layout folders/tags/search | Yes | S–M |
| E2 | Saved multi-window arrangements (TV MultiView Launcher ~690 users) | Yes (Chrome) | M |
| E3 | More than 16 charts per layout | Partial | M |
| E4 | Auto-apply an indicator template per asset class/symbol | Yes | M |
| E5 | Detachable watchlist/DOM panels | Partial | M |
| E6 | Bar Replay across detached windows **[?]** | Partial | L |

## F. Journaling / risk

| # | Gap | Ext? | Size |
|---|---|---|---|
| F1 | Built-in trade journal (tags, R-multiples, stats by session) — 6+ new extensions in 2026 | Yes | M–L |
| F2 | One-click screenshot + metadata to journal | Yes | S |
| F3 | Personal risk guard (daily loss limit, lockout) — TopstepX has it natively | Partial | M–L |
| F4 | ATM-style auto-breakeven/trailing | Partial, risky | L |
| F5 | Realistic paper trading (slippage/commission) | No | — |

## G. Pine Script

Optimization (akumidv/tradingview-assistant 295★, OptiPie) — Partial/Yes, M–L · portfolio backtests — Partial, L ·
read user drawings — No · HTTP/file I/O — No · hard limits (40 requests, 500 drawings, 64 plots) — No ·
step debugger — No · git/version control — Partial, M · Pine Screener limits — Partial, M.

## H. Order flow

Liquidity heatmap, aggregated crypto footprint/CVD, tape with big-trade filters — **Partial, crypto only**
(public exchange WebSockets); stock/futures L2 — No; deeper footprint customization — No; TPO composites — Partial.

## I. Desktop app

No plugin/automation API; the CDP port is increasingly hard to open (tradingview-mcp #130 macOS v3.1 "bad option",
#42 Windows MSIX access denied; AUMID activation reported working on 3.3.0). Extensions, including TradingView's own
AI Copilot beta, don't run in Desktop. → **TVSuite's desktop launcher targets exactly this gap.**

## J. Social

Public chat rooms retired Sep 30 2026 (revival userscripts appeared) · feed filtering/mute — Yes, S ·
idea visibility/publishing policy — No · copy trading — No.

## K. Customization / aesthetics

| # | Gap | Ext? | Size |
|---|---|---|---|
| K1 | Custom UI themes beyond light/dark ("creating an additional theme is not possible") | Yes | S–M |
| K2 | Global UI / status-line font & size | Yes | S |
| K3 | Share/import color themes publicly | Yes | M |
| K5 | **Animated / live chart backgrounds** (ChartSkins is the only product, paid, days old) | **Yes — TVSuite ships this** | M |

## Strongest demand, ranked

1. Programmatic/AI control (D3/I1) · 2. Strategy optimization (G1) · 3. Alert bulk/backup/routing (C1–C3) ·
4. Position sizing (B5) · 5. Journaling & screenshot capture (F1/F2) · 6. Custom hotkeys (A1) ·
7. Watchlists & multi-window (A8/E2) · 8. Template/theme/layout backup (B1/D1).

**Avoid:** anything that bypasses server-enforced plan limits, ad removal, or client-side automated order management.
**Caution:** several GitHub repos in this space ("TradingView-Premium-…", "Pro-Charts" binaries) look like malware lures.

## Key sources

TradingView support/blog pages listed above (via search snippets), r/TradingView feature-request flair (mirror),
github.com/victornpb/tradingview-backup, github.com/akumidv/tradingview-assistant-chrome-extension,
github.com/tradesdontlie/tradingview-mcp (+ issues #42, #130), github.com/trading-peter/tv-enhance,
github.com/webclinic017/PresetSwitcher, github.com/Tucsky/aggr-tv-extension, github.com/ywtaoo/tradingview_sound_customization,
Chrome Web Store listings via extscope/chromeboard mirrors (Magical Keyboard Shortcuts, Lot Size Calculator, Traidly,
Alerts Manager, TV MultiView Launcher, ChartRecap, TickerStation), competitor comparisons (liberatedstocktrader, zerosumnasdaq,
ATAS, NinjaTrader, TopstepX).
