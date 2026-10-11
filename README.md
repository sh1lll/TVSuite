# TVSuite

An extension to bring features that I believe should've been in TradingView a long time ago, but aren't at all.

TVSuite is one open-source, local-only suite for TradingView:

- **Live skins.** Animated backgrounds that sit *under* your candles: 10 canvas scenes and 3 GLSL shaders.
  - They can **react to the chart**: candle range, price speed, distance from the daily open, session opens.
  - **Adaptive calm mode** quiets the background automatically when the market gets wild.
  - Skins can **switch at Tokyo / London / New York opens**.
  - You can **generate new skins from a sentence** with any model you connect.
  - **Skin Studio**: remix any built-in with your own colours and motion, or write your own canvas/GLSL skin. Starter custom skins are included.
  - Skins can be **shared as links**.
  - **Your own media as a skin**: upload an image, GIF or video (MP4, WebM, MOV, PNG, JPG, WebP, AVIF, SVG) or paste a link (Giphy, Imgur, Dropbox, Google Drive and GitHub links are converted to direct files).
- **Sound.** Event sounds for trade entered/closed and TradingView alerts (detected from TradingView's own pop-ups, or by hotkey), local price-level alerts that don't use TradingView alert slots, daily-open crosses, big candles, bar closes and session opens/closes. Includes:
  - 15 built-in effects, or your own audio files or links;
  - ambient trading beds (rain, ocean, noise, lo-fi, drone, or your own loop) that duck under event sounds;
  - spoken announcements ("NQ crossed 21,000");
  - optional desktop notifications.
- **Platform Bridge.**
  - Translate any symbol between TradingView, NinjaTrader, Tradovate, ProjectX/TopstepX, thinkorswim, Sierra Chart, Rithmic, IBKR, MetaTrader, Yahoo, Binance and Coinbase.
  - Convert watchlists between those formats.
  - Open the current symbol on other sites.
  - **Linked tabs**: TradingView jumps to what TopstepX or your broker tab shows.
  - Right-click any ticker on any web page → **Open in TradingView**.
- **Risk Guard** (for prop-firm and personal rules):
  - **Rules like your broker's risk settings:** personal daily loss limit and profit target with a **Block** or warn action, firm daily loss limit, trailing max loss (static / end-of-day / intraday, with lock), consistency rule, max contracts, and per-position risk/profit brackets.
  - **P&L sources:** your own entries, the journal, or numbers read from the screen (click the P&L in TradingView's Account Manager or TopstepX).
  - **Warnings** come as sound, voice, notification and lights.
  - **Block:** a lock screen until the trading day resets. TVSuite never closes positions; leave "Liquidate" to your broker.
  - **Chart-time tracker:** time on the chart per session and symbol, with break reminders.
- **Capture:**
  - screenshot cards ready for X/Discord (Alt+Shift+S);
  - a **trade recorder** that records the chart while you're in a trade (MP4/WebM, no screen-share prompt);
  - a recordings library;
  - **Discord & Telegram** sending of cards, journal entries, risk hits and recordings.
- **Mini windows** (Alt+Shift+P): a floating, always-on-top mini chart (price, tick line, session, day P&L) while you're in other apps, and a floating player for your own video, YouTube or Twitch while you trade.
- **Room lighting:** Philips Hue, Home Assistant (Govee LAN, LIFX, Nanoleaf…), WLED or Govee cloud follow the session colour, flash on fills and alerts, and go red when a limit is hit.
- **Voice commands** (Alt+Shift+V or the command box), opt-in, with on-device recognition when Chrome offers it. For example: "show NQ five minute", "journal this", "log a loss of 200", "what's my P&L".
- **Indicators in Python, JavaScript or Java**, translated to Pine Script v6 for TradingView: a built-in translator for indicator code, and your AI model for the rest.
- **Co-watch:** a friend's chart and yours follow each other over a direct peer-to-peer link, with chat and "look here" pings. Connect by swapping two codes; there's no server.
- **Template manager.** Backup, snapshot history, diff vs live, and conflict-aware restore of drawing templates and chart themes, plus a factory reset that snapshots first. It reads and writes the same backup files as victornpb/tradingview-backup and vngbh/tradingview-template-manager.
- **Trade journal.** Alt+Shift+J captures a clean chart image with symbol, price, session, side, entry, stop, target, tags and notes. A local journal page shows stats by session, symbol, tag, side and weekday, plus an equity curve in R and CSV/JSON export.
- **Session clock HUD, position-size calculator** (stocks / futures / forex / crypto) and **focus mode**.
- Runs as a **Chrome extension**, inside **TradingView Desktop** (via `desktop/launcher.mjs`), or as a **userscript**.
- Works on **platforms that embed TradingView charts** (e.g. TopstepX/ProjectX, broker web platforms). Enable it per site.

No account, no telemetry, no servers. Chart-reactive features read price text that's already on your screen, locally.

> Not affiliated with or endorsed by TradingView. TradingView's internal DOM and endpoints are undocumented and change without notice. See *Status* below.

## Install

```sh
npm install
npm run build            # → dist/extension, dist/tvsuite-inject.js, dist/tvsuite.user.js
```

- **Chrome / Edge / Brave / Arc / Opera:** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `dist/extension`. Then open a TradingView chart. Click the **TVS** button (bottom-left) or press **Alt+Shift+T**.
- **Userscript (Tampermonkey/Violentmonkey):** install `dist/tvsuite.user.js`. AI generation is extension-only.
- **TradingView Desktop:**
  ```sh
  node desktop/launcher.mjs doctor   # what it found; changes nothing
  node desktop/launcher.mjs          # attach if a debug port is open, else launch TradingView Desktop with one
  ```
  Quit TradingView fully first (including the tray/menu-bar icon). Keep the launcher running; Ctrl+C stops injecting into new windows.
  ⚠ While TradingView runs with a debugging port, any program on your computer can control it. The port is bound to 127.0.0.1. Fully quit TradingView when you're done.

## Using it

| Key | Action |
|---|---|
| Alt+Shift+T | Open/close the TVSuite panel |
| Alt+Shift+K | Skin on/off |
| Alt+Shift+F | Focus mode (hide TradingView toolbars) |
| Alt+Shift+J | Capture the chart to the journal |
| Alt+Shift+H | Hide all TVSuite UI (screenshots, streams) |
| Alt+Shift+E / X | Sound: trade entered / closed (when TVSuite can't see your fills) |
| Alt+Shift+M | Sound: mute / unmute |
| Alt+Shift+S | Screenshot card → clipboard |
| Alt+Shift+R | Start / stop recording |
| Alt+Shift+P | Mini chart window |
| Alt+Shift+V | Voice command (when Voice is on) |

Hotkeys can be changed in **About**.

- **Skins tab:**
  - pick a skin;
  - choose a mode: **Under the candles** (default) or **Overlay (blend)**, a fallback that never touches the page;
  - tune Opacity, Dim, Blur, Saturation, Black & white, frame rate and resolution;
  - adjust per-skin parameters;
  - turn on **React to the chart** (opt-in) and **adaptive calm mode**;
  - generate, import or share skins.
- **Sound tab:** turn Sound on, pick an ambient bed, choose a sound (and voice) per event, add price alerts, upload your own sounds or paste links, and edit the words that identify TradingView's order/alert pop-ups.
- **Risk tab:** Today (day P&L, limit bars, quick trade entry), Rules, Time (chart time), Journal.
- **Capture tab:** Card, Recorder, Mini (windows), Share (what goes to Discord/Telegram).
- **Sound tab:** Sound, Lights, Voice.
- **Bridge tab:** Symbols (translator, Open in…, linked tabs), Lists (watchlist converter), Co-watch, Indicators.
- **Templates tab:** Fetch, Snapshot, Export, Import, Compare with live, Restore (overwrite / skip / rename), Snapshots list, Factory reset.
- **Options page:** AI provider and key (Anthropic, or any OpenAI-compatible endpoint including local Ollama), Discord & Telegram, room-lighting devices, desktop notifications, other sites, and data export.

### Make your own skin

A skin is JSON. Canvas skins define `draw(ctx, api)`, and optionally `setup(api)`:

```js
function draw(ctx, api) {
  const { w, h, t, s, p, lib } = api;          // s = chart signals (0..1), p = params
  ctx.fillStyle = lib.hsl(p.hue + s.dist * 40, 60, 8); ctx.fillRect(0, 0, w, h);
  // ...
}
```

Shader skins provide a Shadertoy-style `mainImage(out vec4 fragColor, in vec2 fragCoord)` with the extra uniforms `iSignal` (intensity, range, velocity, dist), `iCalm` and `iPulse`. See `src/modules/skins/builtins.js` for examples and `src/modules/skins/packs.js` for the schema.

## How "under the candles" works

TVSuite never changes a TradingView setting. A tiny MAIN-world script turns the chart's *full-canvas background fill* into a transparent clear, only for canvases attached inside the chart. The skin layer sits beneath them inside an isolated stacking context. Because nothing is written to your layout:

- the transparent background can't leak to your phone or other computers;
- snapshots, which render on detached canvases, keep your real background colour.

If TradingView ever changes how it paints, switch to **Overlay** mode. **About → Diagnostics** shows whether background clears are happening.

All skin code runs in a Worker with an OffscreenCanvas, inside an opaque-origin sandbox page whose CSP blocks all network access. Generated or shared code never touches the TradingView page.

## Development

```sh
npm test        # unit tests (node:test)
npm run e2e     # builds, then drives real Chromium + the extension against a mock TradingView page
npm run watch   # rebuild on change
npm run demo    # records a captioned demo video + stills to test/e2e/out/demo/
```

The e2e suite serves `test/fixtures/mock-tv.html` and a fake template backend on the real `https://www.tradingview.com/chart/` origin through request interception. Screenshots are written to `test/e2e/out/`.

## Status

See [`docs/ROADMAP.md`](docs/ROADMAP.md). Research: [TradingView gaps](docs/research/tradingview-gaps.md) · [ChartSkins teardown](docs/research/chartskins.md) · [template-manager analysis](docs/research/template-manager.md) · [platform bridge](docs/research/platform-bridge.md) · [integration facts](docs/research/integrations.md) · [ideas](docs/IDEAS.md).

**Verified:** 104 unit tests and 60 e2e checks. The e2e checks run the real extension against the mock page. They cover:
- the skin layer and transparency;
- every built-in skin;
- overlay mode, hotkeys, reactive and calm mode;
- share links, the sandbox escape probe and the watchdog;
- template fetch, export, snapshot, diff, restore and reset;
- the popup and options page;
- media skins (upload and link);
- sound: every effect and ambient bed renders non-silent, order-toast detection, price alerts, hotkeys and mute, ambient beds, your own uploaded sound, and the in-page engine in desktop mode;
- bridge translation, watchlist conversion, and linked tabs jumping the chart;
- Risk Guard (warn, block + override, screen picker, journal P&L), chart time;
- screenshot card → mock Discord, recorder entry→exit→saved→mock Telegram→playable;
- mini chart as real Document Picture-in-Picture, library player;
- lights against mock WLED / Home Assistant servers, typed voice commands through the chart API;
- Python/JS/Java → Pine, and co-watch between two tabs;
- the desktop bundle, and the launcher over CDP.

**Not yet verified on live TradingView** (it can't be reached from the build environment):
- DOM selectors;
- that production TradingView paints its background with a full-canvas `fillRect`;
- the template endpoints, which come from two working public scripts;
- real TradingView Desktop installs on Windows and macOS;
- the wording of TradingView's real order-fill and alert pop-ups (the keywords are editable);
- sound autoplay inside a real TradingView tab after you first click the page;
- desktop notifications (headless Chromium can't grant the permission);
- ProjectX contract roots other than ENQ (NQ) and MNQ;
- reading P&L from TradingView's Account Manager / TopstepX, real lights, a real microphone, the Pine Editor paste, co-watch across different networks;
- whether a hidden chart tab keeps repainting into the mini window.

## License

MIT
