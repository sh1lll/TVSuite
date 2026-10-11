# TVSuite

An extension to bring features that I believe should've been in TradingView a long time ago, but aren't at all.

TVSuite is one open-source, local-only suite for TradingView:

- **Live skins.** Animated backgrounds that sit *under* your candles: 10 canvas scenes and 3 GLSL shaders.
  - They can **react to the chart**: candle range, price speed, distance from the daily open, session opens.
  - **Adaptive calm mode** quiets the background automatically when the market gets wild.
  - Skins can **switch at Tokyo / London / New York opens**.
  - You can **generate new skins from a sentence** with any model you connect.
  - Skins can be **shared as links**.
- **Template manager.** Backup, snapshot history, diff vs live, and conflict-aware restore of drawing templates and chart themes, plus a factory reset that snapshots first. It reads and writes the same backup files as victornpb/tradingview-backup and vngbh/tradingview-template-manager.
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

Hotkeys can be changed in **About**.

- **Skins tab:**
  - pick a skin;
  - choose a mode: **Under the candles** (default) or **Overlay (blend)**, a fallback that never touches the page;
  - tune Opacity, Dim, Blur, Saturation, Black & white, frame rate and resolution;
  - adjust per-skin parameters;
  - turn on **React to the chart** (opt-in) and **adaptive calm mode**;
  - generate, import or share skins.
- **Templates tab:** Fetch, Snapshot, Export, Import, Compare with live, Restore (overwrite / skip / rename), Snapshots list, Factory reset.
- **Options page:** AI provider and key (Anthropic, or any OpenAI-compatible endpoint including local Ollama), other sites, and data export.

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
```

The e2e suite serves `test/fixtures/mock-tv.html` and a fake template backend on the real `https://www.tradingview.com/chart/` origin through request interception. Screenshots are written to `test/e2e/out/`.

## Status

See [`docs/ROADMAP.md`](docs/ROADMAP.md). Research: [TradingView gaps](docs/research/tradingview-gaps.md) · [ChartSkins teardown](docs/research/chartskins.md) · [template-manager analysis](docs/research/template-manager.md) · [ideas](docs/IDEAS.md).

**Verified:** 52 unit tests and 24 e2e checks. The e2e checks run the real extension against the mock page. They cover:
- the skin layer and transparency;
- every built-in skin;
- overlay mode, hotkeys, reactive and calm mode;
- share links, the sandbox escape probe and the watchdog;
- template fetch, export, snapshot, diff, restore and reset;
- the popup and options page;
- the desktop bundle, and the launcher over CDP.

**Not yet verified on live TradingView** (it can't be reached from the build environment):
- DOM selectors;
- that production TradingView paints its background with a full-canvas `fillRect`;
- the template endpoints, which come from two working public scripts;
- real TradingView Desktop installs on Windows and macOS.

## License

MIT
