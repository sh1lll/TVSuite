# ChartSkins — teardown

*Researched 2026-10-11. chartskins.com itself could not be fetched from the research environment (proxy/DNS block), so
site claims come from the search-engine index of the homepage; desktop facts come from the public release repo
`github.com/musii123/chartskins-releases` (40 tags, release notes and electron-updater manifests). No binaries were run.*

Legend: **[C]** confirmed from a cited source · **[I]** inferred (reasoned from evidence, not stated by the vendor).

## 1. What it is

- "ChartSkins — Live backgrounds for TradingView": animated scenes, videos and GIFs shown behind TradingView candles. **[C]**
- Core claim: *"makes TradingView's own chart background transparent and slides your skin underneath, so wicks, levels and labels draw on top exactly like before."* It saves the original background and restores it when switched off. **[C]**
- Platforms: browser extension (Chrome, Brave, Edge, Arc, Opera, Opera GX), a desktop app for TradingView Desktop (Mac & Windows), and "trading platforms built on TradingView charts (beta)". No Firefox, Safari or Linux. **[C]**
- Independent product; not affiliated with TradingView. **[C]**

## 2. Business model and gamification

| Item | Detail |
|---|---|
| Free ("Standard crate") | 5 starter skins with a free account, a free daily case, small watermark **[C]** |
| Pro ("Holo case") | $3.25/mo billed $39/yr; all skins, no watermark, own media, Workshop uploads, up to 15 devices **[C]** |
| Checkout | Whop; licence key pasted "under Plan in your Locker" if emails differ **[C]** |
| Daily case | One case every ~20 h; "26 skins, five rarities"; odds Common 60 / Rare 27 / Epic 10 / Legendary 3; no duplicates; "no paid spins, ever" **[C]** |
| Workshop | Pro users upload loops, human-reviewed; free users can preview any Workshop skin for 30 s (v1.0.39) **[C]** |
| Own media (Pro) | MP4, WebM, MOV, GIF, PNG, JPG — stays on the computer unless submitted **[C]** |
| Growth loops | Watermark on free; Pro "Show ChartSkins badge" for streams; a free Pro month per public social post; 10 % affiliate; Discord giveaways **[C]** |
| Refunds | Contradictory: homepage says 7-day money-back, terms (v1.0.34) say all sales final **[C]** |

Skins seen: Midnight (fallback), Graphite, Starfield, Twinkle, Rain, Snow, Dusk, Aurora, Warp, Topo, Silk, Black Hole (Legendary),
Sakura, Waves, Fireflies, Matrix, Ocean, Fog, Nebula, Embers. **[C]**

## 3. How it works (web)

- "Look" panel controls: Opacity (was "Strength"), Dim, Blur, Speed, Black & white. 30 fps default, 60 optional; pauses in background tabs. Hotkey **Alt+Shift+B** toggles. **[C]**
- **Transparency is applied through TradingView's chart settings, not just CSS.** **[I, strong]** Evidence:
  - v1.0.18 fixed the see-through background being *saved into synced layouts* and appearing on the phone app and other computers. A CSS-only overlay could never reach synced layouts.
  - v1.0.24 added "Chart colour when skins are off", which picks the background TradingView gets back.
  - v1.0.30/31 had to special-case snapshots: snapshots came out transparent, and the fix could freeze or close TradingView on Windows.
- Workshop media is hosted on Cloudflare R2 (`r2.dev`) with a backup host for networks that block it. **[C]**

## 4. How it works (TradingView Desktop)

- Electron app (electron-builder + electron-updater; ~104 MB Windows NSIS, ~218 MB universal Mac zip/dmg). **[C]**
- 40 releases between 2026-10-06 and 2026-10-11, often several per hour. **[C]**
- **Hook mechanism: relaunching TradingView Desktop with a Chrome DevTools Protocol port and injecting over CDP.** **[I, strong]** Evidence:
  - a "flickering restart prompt" (v1.0.16);
  - TradingView closing whenever ChartSkins quit (fixed v1.0.7);
  - "open TradingView any way you like and your skin comes with it" (v1.0.2), i.e. it intercepts or relaunches;
  - "never closes TradingView on a connection retry anymore" (v1.0.31);
  - "TradingView could get restarted on its own when you switched windows" (v1.0.25).
- A "background helper that keeps skins on TradingView now only accepts the ChartSkins app (secret handshake)" (v1.0.19). This is a local helper process that re-injects after reloads and probably serves local media. **[C/I]**
- "Network watching limited to TradingView itself" (v1.0.22). The app observes TradingView's network traffic, probably to catch layout saves. **[C/I]**
- Windows pain: locating MSIX/Store versus tradingview.com installs (v1.0.16, v1.0.39); it used PowerShell, later dropped. **[C]**
- Mac pain: "TradingView not found on some Macs" (v1.0.23); unsigned until v1.0.40 (notarized). **[C]**
- v1.0.32: "Use TradingView in your browser? The app now points you to the ChartSkins browser extension." The desktop app only serves Desktop, so browser users get redirected. **[C]**
- Self-update verified against a custom signature (v1.0.22, v1.0.26). **[C]**

### Full desktop timeline (abridged quotes)

| Ver | Date (UTC) | Notes |
|---|---|---|
| 1.0.2 | 10-06 | Launch with TradingView; update screen; no Keychain prompts on Mac |
| 1.0.3 | 10-06 | Works with ChartSkins extension 1.0.9 |
| 1.0.4 | 10-06 | Send to support from Settings; menu-bar autostart |
| 1.0.5 | 10-06 | Works when chartskins.com is unreachable; quitting restores your background; fixes charts left transparent; Alt+Shift+B/P in Desktop; fit options for own videos |
| 1.0.6 | 10-06 | Daily case in-app; support reports no longer include your computer username |
| 1.0.7 | 10-06 | Quitting or updating no longer closes TradingView; re-attaches without a restart |
| 1.0.8 | 10-06 | Windows re-attach fixes; faster hand-off from Start menu/taskbar |
| 1.0.9 | 10-07 | Own videos/images play inside Desktop; skins come back after restarts |
| 1.0.10 | 10-07 | Terms consent; better handling of charts that platforms restyle |
| 1.0.13 | 10-07 | Discord |
| 1.0.16 | 10-08 | Windows: "TradingView not found" and flickering restart prompt fixed for Store builds |
| 1.0.17 | 10-08 | Rebuilt Ocean, Fog, Dusk, Embers, Snow, Nebula, Fireflies; Black & white; Strength renamed Opacity |
| 1.0.18 | 10-08 | Phone and other computers keep the normal background (stopped leaking into synced layouts) |
| 1.0.19 | 10-08 | Background helper only accepts the ChartSkins app ("secret handshake") |
| 1.0.22 | 10-08 | Signed updates; "Network watching limited to TradingView itself" |
| 1.0.24 | 10-08 | "Chart colour when skins are off" |
| 1.0.25 | 10-08 | Fixed TradingView restarting on window switch; free Twinkle skin |
| 1.0.30 | 10-08 | Snapshots show the real chart colour |
| 1.0.31 | 10-08 | Fixed snapshot freeze/close on Windows; no TradingView close on retry |
| 1.0.32 | 10-08 | Points browser users to the extension |
| 1.0.34 | 10-09 | Terms: all purchases final, use at own risk |
| 1.0.38 | 10-10 | Workshop media loads on networks that block the media host; HEVC/Windows explanations |
| 1.0.39 | 10-10 | Windows: finds Desktop without PowerShell; Workshop 30 s trials |
| 1.0.40 | 10-11 | Mac signed and notarized; one-click updates |

## 5. ProjectX / TopstepX and other platforms

- FAQ: "Does it work on TopstepX and other trading platforms?" — "on many of them, yes (beta)". On sites that embed TradingView charts, you click the ChartSkins icon, then **"Turn on here"**. It warns that some prop firms have rules about extensions on funded or evaluation accounts. **[C]**
- TopstepX (built by ProjectX) uses TradingView charts in the browser. **[C]**
- Per-site opt-in from the extension popup, extension-only. Embedded Charting Library builds restyle charts, hence "beta". **[I]**
- No NinjaTrader, Tradovate desktop or Sierra Chart support; native apps can't be skinned this way. **[I]**

## 6. Risks and quirks worth learning from

1. **Writing a transparent background into TradingView settings leaks across devices.** TVSuite avoids this entirely: it clears the background fill at draw time in the page's own canvas calls and never writes a chart setting.
2. **Snapshots.** Any approach that changes the background property breaks snapshots. TVSuite's clear only applies to canvases attached inside the chart DOM; snapshot rendering uses detached canvases. *This still needs verification on real TradingView.*
3. **An open CDP port is a big local attack surface.** Any local process can drive a logged-in TradingView session. ChartSkins added a "secret handshake" to its helper only at v1.0.19. TVSuite's launcher binds to `127.0.0.1`, only touches `tradingview.com/chart` targets, uses a fixed CDP method allow-list and says plainly that the port stays open until TradingView quits.
4. **Finding the Desktop executable is the hard part on Windows** (MSIX in `WindowsApps` is access-denied; activation is via the AUMID).
5. **Account, telemetry and phone-home** (sign-in codes, support reports, Pro checks) are absent from TVSuite. TVSuite is local-only with no account.

## Sources

- https://chartskins.com/ (search-index snapshot only)
- https://github.com/musii123/chartskins-releases and its releases, release tags v1.0.1–v1.0.40, and `latest.yml` / `latest-mac.yml` per tag
- https://github.com/covaceo/tradingview-local-skins (open-source CDP skinning toolkit, MIT; Desktop discovery patterns and the CDP security warning)
- https://help.topstepx.com/components/tradingview-tm-charts/chart-settings · https://www.topstep.com/blog/topstepx-platform-guide
- https://github.com/tradesdontlie/tradingview-mcp/issues/130 (macOS v3.1 rejects `--remote-debugging-port` with "bad option") · …/issues/42 (Windows MSIX access denied; AUMID activation reported working on 3.3.0)
