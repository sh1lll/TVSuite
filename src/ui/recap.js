// Recap controller: build a session/day recap on demand or automatically when a session closes or the
// trading day ends; preview it, copy/download it, and send it to Discord/Telegram if you chose to.
import { el } from '../core/dom.js';
import { button, toast, modal, copyText } from './kit.js';
import { storage } from '../core/storage.js';
import { computeRecap, drawRecap, recapText } from '../modules/risk/recap.js';
import { tradingDay } from '../modules/risk/rules.js';
import { isOpen } from '../modules/sessions/sessions.js';
import { canvasToBlob } from '../modules/capture/card.js';

const DONE = 'recap:done';

export function createRecap(app) {
  const { getSettings, bus, root } = app;
  const cfg = () => getSettings().recap;

  async function build({ day = null, session = null } = {}) {
    const s = getSettings();
    const d = day || tradingDay(new Date(), s.risk.tz, s.risk.reset);
    const since = Date.now() - 3 * 86400e3;
    const [journal, recs] = await Promise.all([
      app.journal?.list ? app.journal.list({ since }).catch(() => []) : [],
      app.recordings?.list ? app.recordings.list().catch(() => []) : [],
    ]);
    const inDay = (at) => tradingDay(new Date(at), s.risk.tz, s.risk.reset) === d && (!session || isOpen(session, new Date(at)));
    const stats = computeRecap({ day: d, session, cfg: s.risk, state: app.risk.state(), journal, chartTime: app.chartTime.days()[d] || null, recordings: recs.filter((r) => inDay(r.createdAt)).length });
    const canvas = drawRecap(stats, { theme: s.capture.card.theme, watermark: s.capture.card.watermark, brand: s.capture.card.show.brand });
    return { stats, canvas, text: recapText(stats) };
  }

  async function share(r, targets) {
    if (!app.share) return null;
    return app.share({ kind: 'recap', ...(targets ? { targets } : {}), title: r.stats.session ? `${r.stats.session.name} session recap` : 'Day recap', text: r.text, image: r.canvas.toDataURL('image/png'), filename: 'recap.png' });
  }

  function show(r) {
    const img = el('img', { src: r.canvas.toDataURL('image/jpeg', 0.9), alt: 'Recap card', style: { width: '100%', borderRadius: '10px', display: 'block' }, dataset: { recapImg: '1' } });
    const send = (t) => async () => { try { const res = await share(r, [t]); const x = res?.results?.[t]; toast(root, x?.ok ? `Recap sent to ${t}` : `${t}: ${x?.error || 'not set up'}`, x?.ok ? 'ok' : 'err', 4000); } catch (err) { toast(root, err.message, 'err'); } };
    const body = [img, el('div', { class: 'note', dataset: { recapText: '1' } }, r.text),
      el('div', { class: 'btns', style: { flexWrap: 'wrap' } },
        button('Copy image', async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await canvasToBlob(r.canvas) })]); toast(root, 'Recap copied'); } catch (_) { toast(root, 'Copy failed — use Download', 'warn'); } }, 'primary sm', { icon: 'copy' }),
        button('Copy text', async () => { await copyText(r.text); toast(root, 'Summary copied'); }, 'sm'),
        button('Download', () => { const a = el('a', { href: r.canvas.toDataURL('image/png'), download: `tvsuite-recap-${r.stats.day}${r.stats.session ? `-${r.stats.session.id}` : ''}.png` }); document.body.append(a); a.click(); a.remove(); }, 'sm', { icon: 'download' }),
        app.share ? button('Discord', send('discord'), 'sm') : null, app.share ? button('Telegram', send('telegram'), 'sm') : null)];
    return modal(root, { title: r.stats.session ? `${r.stats.session.name} session recap` : 'Day recap', body, wide: true, actions: [{ label: 'Close', value: true }] });
  }

  async function make(opts = {}) {
    try { const r = await build(opts); bus.emit('recap:made', r); return r; }
    catch (err) { toast(root, `Recap failed: ${err.message}`, 'err'); return null; }
  }
  async function makeAndShow(opts) { const r = await make(opts); if (r) show(r); return r; }

  // Automatic recaps: one tab claims each (day, session) so several open charts make it once.
  async function claim(key) {
    const done = (await storage.get(DONE, {})) || {};
    if (done[key]) return false;
    done[key] = Date.now();
    for (const k of Object.keys(done)) if (Date.now() - done[k] > 14 * 86400e3) delete done[k];
    await storage.set(DONE, done);
    return true;
  }
  async function auto(opts, key) {
    if (!(await claim(key))) return;
    const r = await make(opts);
    if (!r) return;
    const msg = el('span', {}, `${opts.session ? opts.session.name : 'Day'} recap ready — `, el('a', { href: '#', onclick: (e) => { e.preventDefault(); show(r); } }, 'view'));
    toast(root, msg, 'ok', 8000);
    bus.emit('sound:manual', { type: 'sessionClose', vars: { session: opts.session?.name || 'Trading day' } });
    const sh = getSettings().share;
    if (['discord', 'telegram'].some((t) => sh[t].enabled && sh[t].recap)) share(r);
  }
  let open = null, lastDay = null;
  function tick() {
    const s = getSettings(), c = cfg();
    const now = new Date();
    const day = tradingDay(now, s.risk.tz, s.risk.reset);
    const list = s.sessions.list.filter((x) => x.enabled !== false);
    const nowOpen = new Set(list.filter((x) => { try { return isOpen(x, now); } catch (_) { return false; } }).map((x) => x.id));
    if (c.auto === 'session' && open) {
      for (const sess of list) {
        if (open.has(sess.id) && !nowOpen.has(sess.id) && (!c.sessions.length || c.sessions.includes(sess.id))) auto({ session: sess, day }, `${day}:${sess.id}`);
      }
    }
    if (c.auto === 'day' && lastDay && lastDay !== day) auto({ day: lastDay }, `${lastDay}:day`);
    open = nowOpen; lastDay = day;
  }
  setInterval(tick, 20000);
  tick();
  return { build, make, show: makeAndShow, showResult: show, tick };
}
