# Platform Bridge: TradingView ⇄ every other platform

Goal: whatever a trader has built in one platform (symbols, watchlists, drawings, layouts, alerts, journal,
scripts) should move to and from TradingView, and open tabs on different platforms should be able to *follow*
each other. Nothing here needs a server. Everything runs locally in the extension.

Status: ✅ shipped · 🔨 partial · ⏳ planned · 🧪 needs research · ❌ rejected (reason)

## 1. What exists now

| Feature | Status | Notes |
|---|---|---|
| **Symbol translator** | ✅ | TradingView ⇄ NinjaTrader (`ES 12-26`, `ES ##-##`), Tradovate/Rithmic/IBKR (`ESZ6`), ProjectX/TopstepX (`CON.F.US.ENQ.Z26`), thinkorswim (`/ESZ26`, `EUR/USD`, `$SPX`), Sierra Chart (`ESZ26-CME`), MetaTrader, Yahoo (`ES=F`, `EURUSD=X`, `^GSPC`, `BRK-B`), Binance (`BTCUSDT`), Coinbase (`BTC-USD`). Futures, stocks, crypto (incl. perps), FX and the major indexes. Round-trip unit-tested. |
| **Front-month estimate** | ✅ | For continuous symbols (`ES1!`) on platforms that need a dated contract, quarterly roots only. Shown with a "front month?" chip. Monthly products (CL, GC, ags) are left to the user, because their roll calendars differ per product. |
| **Open in…** | ✅ | TradingView, Yahoo, Finviz, StockTwits, SEC EDGAR, Binance, Coinbase, CME search. |
| **Right-click → Open in TradingView** | ✅ | On any web page: select `$NVDA`, `/ESZ26`, `ES 12-26`, `BTC-USD`… and TradingView opens on that chart. Cashtags and trailing punctuation are stripped. |
| **Linked tabs** | ✅ | Every TVSuite tab (TradingView, TopstepX/ProjectX or any added site) publishes its symbol to extension storage. The Bridge tab lists them with "Open here", which jumps this chart to the translated symbol (`?symbol=` keeps your layout). Entries expire after 12 h. Can be turned off. |
| **Watchlist converter** | ✅ | Reads TradingView `.txt` exports (with `###sections`), CSV with a Symbol/Ticker/Instrument column (Finviz, Yahoo, brokers; quoted cells handled), and one-per-line lists. Writes TradingView (sections kept), CSV (formula-injection safe), thinkorswim, NinjaTrader, Tradovate, Yahoo and plain lists. Reports skipped symbols and flattened sections. |
| **ProjectX root overrides** | ✅ | Only `ENQ` (NQ) and `MNQ` are confirmed from published contract ids. Every other root is marked *unverified* and can be overridden (`CL=CLE`). |

## 2. TradingView → other platforms (export)

| Idea | Feasibility | Status |
|---|---|---|
| **Drawings → NinjaTrader / Sierra / thinkorswim**: export horizontal lines, rays and rectangles (S/R levels, supply/demand zones) as level lists that other platforms import (NinjaTrader drawing objects through an add-on, Sierra "Study/Drawing" files, TOS price levels via thinkScript `input`s) | M. TradingView drawings come from the chart's private state, read in the MAIN world | 🧪 Map the drawing state on a real chart first |
| **Levels → thinkScript / NinjaScript / Pine generator**: "make an indicator that draws these 12 levels" for each platform | S, once the levels are readable | ⏳ |
| **Alerts → other platforms**: list your TradingView alerts and export them as a CSV of price/condition rows | M. Needs the alerts endpoints | 🧪 |
| **Journal → Tradervue / TradesViz / TraderSync / Edgewonk**: CSV in each tool's generic import layout | S. The journal is already local | ⏳ Field mapping per tool |
| **Chart theme → other platforms**: export TradingView colours as a NinjaTrader skin, Sierra graphics settings or a TOS colour scheme | M (each target has its own format) | ⏳ Start with NinjaTrader, whose skins are XAML resource dictionaries |
| **Pine → ThinkScript / NinjaScript / EasyLanguage** through the AI provider already configured, with side-by-side diff and a warning that translations need review | M. Uses the existing AI plumbing | ⏳ Opt-in, the user's own key. The reverse direction (Python/JS/Java → Pine) ✅ shipped |
| **Layout screenshot pack**: every chart in a multi-chart layout exported as PNGs with symbol and time | S | ⏳ Builds on journal capture |

## 3. Other platforms → TradingView (import)

| Idea | Feasibility | Status |
|---|---|---|
| **Watchlists from anywhere**: Finviz screener CSV, broker exports, thinkorswim, NinjaTrader lists | ✅ shipped (converter) | ✅ |
| **Trade history → chart markers**: import fills CSV (NinjaTrader, Tradovate, Rithmic, IBKR Flex, Binance/Coinbase) and draw entries/exits on the TradingView chart as an overlay. Also feeds the journal with R-multiples | M. Overlay drawn in TVSuite's own layer, not as TradingView drawings | ⏳ High value |
| **Levels from other platforms**: paste a NinjaTrader/Sierra level list and render it as TVSuite overlay lines on TradingView | S–M | ⏳ |
| **Webhook-in bridge**: a localhost receiver (desktop launcher) accepting TradingView-style alert JSON from other tools, which then plays TVSuite sounds and shows HUD banners | M. The launcher already has a loopback-only server pattern | 🧪 Security review needed |
| **Session templates**: import exchange calendars (CME holidays, early closes) as TVSuite session overrides | S | ⏳ |

## 4. Linking (live, both directions)

| Idea | Feasibility | Status |
|---|---|---|
| **Symbol link groups across platforms**, with colour groups like TradingView's own symbol sync but across sites and windows | ✅ basic (linked tabs) | 🔨 Next: auto-follow mode (opt-in) on TradingView via `?symbol=` navigation, debounced |
| **TradingView Desktop ⇄ browser**: the desktop launcher relays the linked symbol over CDP | M | ⏳ |
| **Broker DOM ⇄ TradingView**: when TopstepX/Tradovate changes contract, the TradingView chart follows | ✅ via linked tabs once the site is added in the popup | 🟡 Needs the symbol selector on the real TopstepX DOM |
| **Crosshair/time sync** between a TradingView tab and another charting site | L. Needs each site's time axis | 🧪 |
| **Co-watch with a friend** (symbol follow, chat, pings) over WebRTC | ✅ shipped | ✅ |
| **Discord/X/news → TradingView**: cashtag hover cards with a mini chart and "Open in TradingView" | M. A content script on chosen sites only, opt-in | ⏳ |
| **Clipboard watcher**: copy `ESZ26` anywhere and TVSuite offers to open it on the chart | S. Needs a page focus event and the clipboard permission | ⏳ Opt-in |

## 5. Rejected or careful

- ❌ **Mirroring orders between platforms** (trade copier). Real-money correctness and ToS risk, and brokers sell this with proper risk controls.
- ❌ **Scraping paid data from one platform to show in another.** Licensing.
- ⚠️ **TradingView private endpoints** (alerts, layouts) are used only read-only first, with the same safety pattern as the template manager: snapshot, diff, confirm.
