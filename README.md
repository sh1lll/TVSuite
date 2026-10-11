# TVSuite

An extension to bring features that I believe should've been in TradingView a long time ago, but aren't at all.

It's one open-source extension that runs locally. There's no account, no telemetry and no server behind it. The chart-reactive parts only read numbers that are already on your screen.

> Not affiliated with or endorsed by TradingView. TradingView's internal page structure and endpoints are undocumented and can change without notice.

## What's in it

### Skins

Animated backgrounds that sit under your candles instead of on top of them. There are 10 canvas scenes and 3 GLSL shaders to start with.

- Skins can react to the chart: candle range, how fast price is moving, distance from the daily open, and session opens.
- Calm mode quiets the background on its own when the market gets wild.
- Each session (Tokyo, London, New York) can have its own skin.
- Skin Studio lets you remix a built-in with your own colours and motion, or write a canvas/GLSL skin from scratch.
- Your own image, GIF or video works as a skin too (MP4, WebM, MOV, PNG, JPG, WebP, AVIF, SVG). Giphy, Imgur, Dropbox, Google Drive and GitHub links get converted to direct files.
- You can generate a skin from a sentence with whatever AI model you connect, and share skins as links.

### Sound

- Sounds for trade entered and closed, TradingView alerts, price levels, daily-open crosses, big candles, bar closes and session opens/closes. Pick from 15 built-in effects or use your own files or links.
- Fills and alerts are picked up from TradingView's own pop-ups, or you mark them with a hotkey.
- Price-level alerts that don't use up your TradingView alert slots.
- Background ambience (rain, ocean, noise, lo-fi, drone, or your own loop) that dips when an event sound plays.
- Spoken announcements like "NQ crossed 21,000", and optional desktop notifications.

### Risk Guard

Built for prop-firm and personal rules, laid out like a broker's risk settings:

- personal daily loss limit and daily profit target, each with a Block or Warn action;
- firm daily loss limit;
- trailing max loss (static, end-of-day or intraday, with a lock-at balance);
- consistency rule, max contracts, and per-position risk/profit brackets.

P&L comes from trades you enter, from the journal, or straight off the screen (click the P&L number in TradingView's Account Manager or TopstepX once and it reads it from then on). Warnings come through sound, voice, notifications and lights. Block puts a lock screen over the chart until the trading day resets. TVSuite never touches orders, so leave liquidation to your broker's own setting.

There's also a chart-time tracker (time per session and symbol, with break reminders) and an end-of-session recap card with P&L, win rate, profit factor, drawdown, R, chart time and whether you kept your rules.

### Capture

- Screenshot cards for X or Discord: your chart framed with symbol, price, session and P&L (Alt+Shift+S copies one).
- A trade recorder that starts when you enter and stops after you're flat, and keeps the seconds before your entry too. It records the chart itself, so there's no screen-share prompt. Clips land in a recordings library with entry and exit markers.
- Discord webhooks and Telegram bots for cards, journal entries, recaps, limit hits and recordings.

### Mini windows

A small always-on-top chart (price, tick line, session, day P&L) for when you're in other apps, and a floating player for your own video, YouTube or Twitch while you trade. Alt+Shift+P opens the mini chart.

### Platform Bridge

- Translates symbols between TradingView, NinjaTrader, Tradovate, ProjectX/TopstepX, thinkorswim, Sierra Chart, Rithmic, IBKR, MetaTrader, Yahoo, Binance and Coinbase.
- Converts watchlists between those formats.
- Linked tabs: TradingView jumps to whatever your TopstepX or broker tab is showing.
- Right-click any ticker on any web page and pick "Open in TradingView".
- Co-watch: a friend's chart and yours follow each other over a direct peer-to-peer link, with chat and "look here" pings. You connect by swapping two codes.

### Indicators in Python, JavaScript or Java

TradingView only runs Pine Script, so TVSuite translates. Write an indicator in Python, JavaScript or Java and get Pine v6 back. Anything the built-in translator can't handle (loops, for example) can go through your AI model instead. "Send to Pine Editor" opens TradingView's editor, types the script in, checks that it went in correctly, and can press Add to chart for you.

### Room lighting and voice

Philips Hue, Home Assistant (which also covers Govee LAN, LIFX and Nanoleaf), WLED or Govee cloud lights can follow the session colour, flash on fills and alerts, and turn red when you hit a limit.

Voice commands are opt-in (Alt+Shift+V, or type into the command box): "show NQ five minute", "journal this", "log a loss of 200", "what's my P&L". Chrome sends the audio to Google for recognition unless it can do it on-device, and the panel tells you which.

### The rest

- Template manager: backup, snapshot history, diff against your live account, and restore for drawing templates and chart themes, plus a factory reset that snapshots first. Backup files are compatible with victornpb/tradingview-backup and vngbh/tradingview-template-manager.
- Trade journal: Alt+Shift+J captures a clean chart image with symbol, price, session, side, entry, stop, target, tags and notes. The journal page shows stats by session, symbol, tag, side and weekday, an equity curve in R, and CSV/JSON export.
- Session clock in the top bar, a position-size calculator (stocks, futures, forex, crypto) and focus mode.

It runs as a Chrome extension, inside TradingView Desktop (through `desktop/launcher.mjs`), or as a userscript. It also works on platforms that embed TradingView charts, like TopstepX/ProjectX and TradeSea. Open the platform, click the TVSuite icon in the toolbar and press Turn on here. Chrome asks for access to that site (and to the chart's iframe, if it lives on the same domain), then the page reloads with TVSuite running. If it still doesn't start, press Check this page in the popup and use the report it prints.

## Install

```sh
npm install
npm run build            # → dist/extension, dist/tvsuite-inject.js, dist/tvsuite.user.js
```

Chrome, Edge, Brave, Arc or Opera: open `chrome://extensions`, turn on Developer mode, choose Load unpacked and pick `dist/extension`. Open a TradingView chart, then click the TVS button in the bottom-left corner or press Alt+Shift+T.

Userscript (Tampermonkey or Violentmonkey): install `dist/tvsuite.user.js`. AI generation only works in the extension.

TradingView Desktop:

```sh
node desktop/launcher.mjs doctor   # shows what it found, changes nothing
node desktop/launcher.mjs          # attaches if a debug port is open, otherwise launches TradingView Desktop with one
```

Quit TradingView fully first, including the tray or menu-bar icon, and keep the launcher running (Ctrl+C stops it). While TradingView runs with a debugging port, other programs on your computer can control it. The port is bound to 127.0.0.1, but quit TradingView when you're done.

## Hotkeys

| Key | Action |
|---|---|
| Alt+Shift+T | Open/close the TVSuite panel |
| Alt+Shift+K | Skin on/off |
| Alt+Shift+F | Focus mode (hide TradingView toolbars) |
| Alt+Shift+J | Capture the chart to the journal |
| Alt+Shift+H | Hide all TVSuite UI (screenshots, streams) |
| Alt+Shift+E / X | Mark a trade entered / closed |
| Alt+Shift+M | Mute / unmute |
| Alt+Shift+S | Screenshot card to clipboard |
| Alt+Shift+R | Start / stop recording |
| Alt+Shift+P | Mini chart window |
| Alt+Shift+V | Voice command (when Voice is on) |

You can change them in the About tab.

## Panel tabs

- Skins: Library, Studio, Look (mode, opacity, dim, blur, frame rate) and Smart (reactive and calm mode).
- Sound: Sound, Lights and Voice.
- Risk: Today, Rules, Time and Journal.
- Capture: Card, Recorder, Mini and Share.
- Bridge: Symbols, Lists, Co-watch and Indicators.
- Templates, Sessions, Tools and About.

Every tab is also available on a full settings page (the All settings button in the toolbar popup), so you can change skins, sound, risk rules and capture options without a chart open. Things that need a live chart, like previews and P&L meters, only show up in the panel over the chart.

You can drag the TVS button anywhere on screen and it stays there. If you'd rather not see it at all, untick Show the TVS button in the popup or in About → Launcher. The hotkey and the popup's Open panel button still work.

The options page holds the AI provider and key (Anthropic, or any OpenAI-compatible endpoint including a local Ollama), Discord and Telegram, light devices, desktop notifications, extra sites and data export.

## Make your own skin

A skin is JSON. Canvas skins define `draw(ctx, api)` and, optionally, `setup(api)`:

```js
function draw(ctx, api) {
  const { w, h, t, s, p, lib } = api;          // s = chart signals (0..1), p = params
  ctx.fillStyle = lib.hsl(p.hue + s.dist * 40, 60, 8); ctx.fillRect(0, 0, w, h);
  // ...
}
```

Shader skins provide a Shadertoy-style `mainImage(out vec4 fragColor, in vec2 fragCoord)` with three extra uniforms: `iSignal` (intensity, range, velocity, dist), `iCalm` and `iPulse`. See `src/modules/skins/builtins.js` for examples and `src/modules/skins/packs.js` for the schema.

## How "under the candles" works

TVSuite never changes a TradingView setting. A small script in the page turns the chart's full-canvas background fill into a transparent clear, only for canvases that are part of the chart, and the skin sits underneath. Since nothing is written to your layout, the transparent background can't leak to your phone or other computers, and snapshots keep your real background colour.

If TradingView changes how it paints, switch to Overlay mode. About → Diagnostics shows whether the background trick is working.

Skin code runs in a Worker with an OffscreenCanvas inside a sandboxed page that can't reach the network, so generated or shared skins never touch the TradingView page.

## Development

```sh
npm test        # unit tests (node:test)
npm run e2e     # builds, then drives real Chromium + the extension against a mock TradingView page
npm run watch   # rebuild on change
npm run demo    # records a captioned demo video + stills to test/e2e/out/demo/
```

The e2e suite serves `test/fixtures/mock-tv.html` and a fake template backend on the real `https://www.tradingview.com/chart/` origin through request interception, with local mock servers for Discord, Telegram and the light APIs, and the real Monaco editor for the Pine Editor checks. Screenshots go to `test/e2e/out/`.

## Status

The roadmap is in [`docs/ROADMAP.md`](docs/ROADMAP.md). Research notes: [TradingView gaps](docs/research/tradingview-gaps.md), [ChartSkins teardown](docs/research/chartskins.md), [template-manager analysis](docs/research/template-manager.md), [platform bridge](docs/research/platform-bridge.md), [integration facts](docs/research/integrations.md) and [ideas](docs/IDEAS.md).

There are 107 unit tests and 69 end-to-end checks. The end-to-end checks run the real extension in Chromium against the mock page, covering every feature above, the desktop bundle, and the launcher over CDP.

Some things can only be checked on live TradingView or real hardware:

- TradingView's page selectors, and whether it still paints its background with a single full-canvas fill;
- the template endpoints, which come from two working public scripts;
- TradingView Desktop on Windows and macOS;
- the exact wording of TradingView's order-fill and alert pop-ups (the keywords are editable);
- sound autoplay after the first click on a real chart, and desktop notifications;
- ProjectX contract roots other than ENQ (NQ) and MNQ;
- reading P&L from TradingView's Account Manager or TopstepX;
- real lights, a real microphone, and Send to Pine Editor on tradingview.com itself;
- MP4 (H.264) recording output, which depends on the browser's encoder;
- co-watch across different networks, and whether a hidden chart tab keeps repainting into the mini window.

## License

MIT
