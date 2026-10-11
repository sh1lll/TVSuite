# Integration facts (researched 2026-10-11)

H = official doc/source · M = several consistent secondary sources · UNCONFIRMED = not verified. Most doc hosts couldn't be fetched directly, so facts come from search summaries citing official pages, GitHub source snippets, and the official Govee PDF.

## Cross-cutting
- Extension **service worker with host permissions is exempt from CORS** (H). Content scripts fetch as the page origin → all device/webhook calls go through the background worker.
- Content scripts on https pages can't fetch `http://` LAN (mixed content). From the worker, http LAN fetches work in practice (M).
- Chrome 142+ **Local Network Access** permission: whether extensions with host permissions are exempt is UNCONFIRMED → test on a real machine.
- Self-signed TLS (Hue, HA without a cert): worker fetch fails with `ERR_CERT_AUTHORITY_INVALID`; opening `https://<ip>` once and accepting the cert may help (UNCONFIRMED).

## Lights
- **Philips Hue**: since the RED compliance date, new firmware **drops plain HTTP** (H). Use `https://<ip>/api/<user>/lights/<id>/state` (v1 shape) or CLIP v2 `PUT https://<ip>/clip/v2/resource/light/<id>` with `hue-application-key`. Pairing: press the link button, then `POST /api {"devicetype":"tvsuite#chrome"}` (error 101 before the press). v1 fields: `on`, `bri` 1–254, `hue` 0–65535, `sat`, `xy`, `alert: select|lselect`. ~10 light cmds/s (M).
- **Govee**: cloud `https://openapi.api.govee.com/router/api/v1/user/devices` (GET) and `/device/control` (POST), header `Govee-API-Key`, body `{requestId, payload:{sku, device, capability:{type, instance, value}}}`. Colour = `color_setting/colorRgb` with value `(r<<16)|(g<<8)|b`; power = `on_off/powerSwitch`; brightness = `range/brightness` 1–100 (M). Limit 10,000/day per account (H, legacy) and ~10/min per device. **LAN API is UDP-only, so impossible from a browser** (use Home Assistant or govee2mqtt instead).
- **Home Assistant**: `POST /api/services/light/turn_on`, `Authorization: Bearer <long-lived token>`, body `{entity_id, rgb_color, brightness, flash: short|long}` (H). The worker path avoids HA's CORS config.
- **WLED**: `POST http://<ip>/json/state` `{on, bri, seg:[{col:[[r,g,b]], fx}]}`; sends `Access-Control-Allow-Origin: *` (H).

## Sharing
- **Discord webhook**: `POST https://discord.com/api/webhooks/{id}/{token}` JSON `{content, username, embeds}` (≤2000 chars, ≤10 embeds); files via multipart `payload_json` + `files[0]`. **10 MiB upload limit since 2025-01-16** (H). Honour 429 `Retry-After`.
- **Telegram**: `https://api.telegram.org/bot<TOKEN>/sendMessage|sendPhoto|sendVideo|sendDocument` (multipart). `chat_id` from `getUpdates` after messaging the bot. Uploads ≤50 MB, photos ≤10 MB (M). ~1 msg/s per chat.

## Browser APIs
- **Document Picture-in-Picture**: `documentPictureInPicture.requestWindow({width,height})` needs transient activation and a **top-level window** (fails in iframes) (H). One per tab. From a top-frame content script click handler: expected to work (UNCONFIRMED). Opener throttling while the tab is hidden: UNCONFIRMED (hidden tabs normally pause rAF unless playing audio).
- **Web Speech**: server-based by default, so **audio goes to Google** (H). On-device: `recognition.processLocally = true` after `SpeechRecognition.available/install({langs, processLocally:true})` (H, ~Chrome 139+). In a content script the mic permission belongs to tradingview.com; in an extension iframe use `allow="microphone"` (UNCONFIRMED that recognition works there).
- **MediaRecorder**: WebM VP8/VP9/AV1 everywhere; **MP4 since Chrome 126** (H). Probe `video/mp4;codecs=avc1.42E01E` → `video/mp4` → `video/webm;codecs=vp9` → `video/webm`.

## TradingView internals (undocumented, may break)
- `window.TradingViewApi` exists in the **MAIN world**: `activeChart().setSymbol()`, `.onSymbolChanged().subscribe()`, `.createShape`, `.getAllStudies()`, `layoutName()` (M; public userscripts tv-shooter, tv-enhance, tradingview-mcp).
- Pine Editor is Monaco but **`window.monaco` is reported undefined** (M) → paste via clipboard/keyboard instead.
