# vngbh/tradingview-template-manager — analysis

*Repo: https://github.com/vngbh/tradingview-template-manager. Inspected 2026-10-11 at commit `a1f0280` (4 commits, all 2026-04-20). It is a 604-line console/userscript, `tradingview-template-manager.user.js` v2.0, with no LICENSE file.*

## What it is

A fork and extension of **victornpb/tradingview-backup** (credited in its README). It shares that script's backup JSON format and its exact 52-entry `LineTool*` list; I diffed the two lists and they are identical. It adds:
- a restyled floating UI (a `TV` button at bottom-left, a 520 px panel);
- select all / select none;
- a **Factory Reset** that deletes every drawing template and theme on the account, using two endpoints the original never used: `/remove-theme/` and `/remove-drawing-template/`.

You install it by pasting it into the DevTools console. A userscript header exists, but it only matches `https://www.tradingview.com/chart/*`.

## How it works (endpoints)

These are all undocumented TradingView web endpoints. They're called with the user's cookies, and POSTs carry a `X-CSRFToken` header taken from the `csrftoken` cookie (Django).

| Purpose | Request |
|---|---|
| List themes | `GET /themes/` → `["name", …]` |
| Read theme | `GET /theme/?themeName=<name>` → `{ content: "<json string>" }` |
| Save theme | `POST /save-theme/` form: `name`, `content` |
| Delete theme | `POST /remove-theme/` form: `name` |
| List templates for a tool | `GET /drawing-templates/<LineToolX>/` → `["name", …]` |
| Read template | `GET /drawing-template/<LineToolX>/?templateName=<name>` → `{ content }` |
| Save template | `POST /save-drawing-template/` form: `name`, `tool`, `content` |
| Delete template | `POST /remove-drawing-template/` form: `name`, `tool` |

Backup file: `{ "_": { INFO, USER, DATE }, "THEMES": { name: obj }, "TOOLS": { LineToolX: { name: obj } } }`.
The username comes from the page global `initData.metaInfo.username`.

## Problems found

| # | Issue | Impact |
|---|---|---|
| 1 | **No safety net before Factory Reset.** It deletes everything after a single click-through modal; nothing is backed up first. | Irreversible data loss if the user didn't export first. |
| 2 | **Factory-reset progress is wrong.** `total` grows while it iterates (`total += names.length` per tool), so the bar jumps around and can read 100% early. | Misleading UI. |
| 3 | **HTML injection through template names.** `addCheckbox` builds `label.innerHTML` from the template name, and `setStatus` interpolates names into `innerHTML`. A name like `<img src=x onerror=…>` executes. | Self-XSS. Also a vector when importing someone else's backup file. |
| 4 | **Import blindly merges.** `Object.assign(userData, imported)` with unvalidated JSON; unknown tools are silently ignored, and a malformed file can leave the UI half-populated. | Confusing failures. |
| 5 | **No conflict handling on restore.** Same-named templates are always overwritten, with no diff and no preview. | Silent overwrite of newer templates. |
| 6 | **Sequential fetching.** 52 list calls plus one call per template, one at a time with `sleep(10)` between them. | Slow on large accounts. |
| 7 | **No error checking on responses.** `res.json()` is called without checking `res.ok`; a logged-out user gets a cryptic parse error per tool. POST results are never checked. | "Applied!" can be reported even when every POST failed. |
| 8 | **CSRF cookie not URL-decoded.** | Breaks if the token contains encoded characters. |
| 9 | **Only matches `www.tradingview.com`.** Regional subdomains (`in.`, `uk.`…) are excluded, and its fetches hard-code `www.`. | Doesn't work on regional sites, and would be cross-origin there. |
| 10 | **`URL.revokeObjectURL` immediately after `a.click()`.** | Can cancel the download in some browsers. |
| 11 | **UI on by default, no hotkey, `localStorage` key on TradingView's origin.** | Clutter; state shares TradingView's storage. |
| 12 | **No LICENSE.** | Reuse terms unclear. TVSuite reimplements from the documented behaviour and doesn't copy code. |

## How TVSuite's Templates tab addresses these

- **Automatic snapshot** before every restore and before factory reset. The reset aborts if any template couldn't be read, so the safety snapshot is never incomplete. It also requires typing `DELETE`. (1)
- Progress is computed from a fixed total. (2)
- All UI is built with `textContent`/DOM APIs inside a shadow root; no `innerHTML` with data. (3)
- `normalizeBackup()` validates the format and keeps only `LineTool*` keys, with clear errors. (4)
- **Diff vs live**: added, changed, removed and same, using a key-order-independent compare. Restore offers three strategies: **overwrite / skip / save as "name (restored)"**, with a confirmation summary. (5)
- Bounded concurrency (4 in flight) with retry and backoff on 429/5xx. (6)
- `401/403` is reported as "not signed in" and stops the run; HTTP errors are checked on every request, and per-item failures are counted. (7)
- The CSRF cookie is decoded; requests use `location.origin`, so regional subdomains work. (8, 9)
- Revocation is deferred. (10)
- The panel is closed by default, opens with Alt+Shift+T, and uses extension storage. (11)
- Local **snapshot history** with load, export and delete, plus a configurable retention count.
- Backup files stay **interchangeable** with victornpb/vngbh: same top-level keys. TVSuite writes an ISO date and a combined `INFO` string.

## Still open / unverified

- The endpoints were taken from two scripts that their authors report as working. They have **not** been exercised against live TradingView from this environment (it was blocked). The e2e suite runs them against a faithful fake backend.
- Indicator (study) templates, chart layouts, watchlists and alerts use other endpoints that aren't yet mapped. See ROADMAP ⏳/🧪.
