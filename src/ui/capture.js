// Capture controller: screenshot cards (Alt+Shift+S copies one), the recorder toggle (Alt+Shift+R), and
// automatic sharing to Discord/Telegram for whatever you switched on.
import { toast } from './kit.js';
import { captureChartCanvas, captureChart } from '../modules/journal/capture.js';
import { composeCard, canvasToBlob } from '../modules/capture/card.js';
import { activeSession } from '../modules/sessions/sessions.js';
import { money } from '../modules/risk/rules.js';

export function setupCapture(app) {
  const { bus, getSettings, adapter, root } = app;

  function cardInfo(extra = {}) {
    const s = getSettings(), c = s.capture.card;
    const obs = adapter.readObservation?.() || {};
    const sess = activeSession(s.sessions.list, new Date());
    const r = s.risk.enabled ? app.risk?.last?.() : null;
    const price = obs.price ?? obs.close;
    const chips = [];
    if (c.show.price && Number.isFinite(price)) chips.push({ text: price.toLocaleString('en-US', { maximumFractionDigits: 5 }) });
    if (c.show.session && sess) chips.push({ text: sess.name, color: sess.color });
    if (c.show.pnl && r) chips.push({ text: `Day ${money(r.dayTotal)}`, color: r.dayTotal < 0 ? '#ff6b78' : '#5ee39b' });
    if (extra.pnl != null && extra.pnl !== '') chips.push({ text: `Trade ${money(+extra.pnl)}`, color: +extra.pnl < 0 ? '#ff6b78' : '#5ee39b' });
    if (extra.r != null && extra.r !== '') chips.push({ text: `${+extra.r > 0 ? '+' : ''}${(+extra.r).toFixed(2)}R`, color: +extra.r < 0 ? '#ff6b78' : '#5ee39b' });
    for (const t of extra.tags || []) chips.push({ text: `#${t}` });
    return {
      theme: c.theme, aspect: c.aspect, watermark: c.watermark, time: c.show.time, brand: c.show.brand,
      title: extra.title || c.title || obs.symbol || skinsSymbol() || 'Chart',
      subtitle: extra.subtitle ?? [sess?.name, obs.symbol && c.title ? obs.symbol : null].filter(Boolean).join(' · '),
      chips,
    };
  }
  const skinsSymbol = () => app.skins?.symbol?.() || '';

  function makeCard(extra = {}, chart = null) {
    const shot = chart || captureChartCanvas({ root: adapter.layoutHost?.() || undefined, maxWidth: 1800 });
    return composeCard(shot, { ...cardInfo(extra), ...(extra.override || {}) });
  }

  async function copyCanvas(canvas) {
    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return blob;
  }

  async function quickCard() {
    try {
      const c = makeCard();
      try { await copyCanvas(c); toast(root, 'Screenshot card copied, paste it anywhere'); }
      catch (_) { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `tvsuite-${Date.now()}.png`; a.click(); toast(root, 'Screenshot card downloaded'); }
      bus.emit('capture:card', c);
      autoShare('cards', { title: cardInfo().title, image: c.toDataURL('image/png'), filename: 'chart.png' });
    } catch (err) { toast(root, `Capture failed: ${err.message}`, 'err'); }
  }

  function toggleRecording() {
    try {
      const on = app.recorder.toggle();
      toast(root, on ? 'Recording the chart, Alt+Shift+R to stop' : 'Recording stopped, saving…');
    } catch (err) { toast(root, err.message, 'err', 4000); }
  }

  // Auto-share: only kinds switched on for a target, and only when a webhook/bot is configured (background checks).
  function wants(kind) { const sh = getSettings().share; return ['discord', 'telegram'].some((t) => sh[t].enabled && sh[t][kind]); }
  async function autoShare(kind, payload) {
    if (!app.share || !wants(kind)) return null;
    try {
      const res = await app.share({ kind, ...payload });
      const bad = Object.entries(res.results || {}).filter(([, v]) => !v.ok);
      if (bad.length) toast(root, `Share failed (${bad.map(([t, v]) => `${t}: ${v.error}`).join('; ')})`, 'err', 5000);
      return res;
    } catch (err) { toast(root, `Share failed: ${err.message}`, 'err', 4000); return null; }
  }

  bus.on('journal:saved', (e) => {
    if (!wants('journal')) return;
    let image = e.image;
    try { image = makeCard({ pnl: e.pnl, r: e.resultR, tags: e.tags }).toDataURL('image/jpeg', 0.9); } catch (_) { /* fall back to the plain capture */ }
    autoShare('journal', { title: `Journal · ${e.symbol || 'trade'} · ${e.side}`, text: e.note || '', fields: [e.pnl != null && e.pnl !== '' ? { name: 'P&L', value: money(+e.pnl) } : null, e.tags?.length ? { name: 'Tags', value: e.tags.map((t) => `#${t}`).join(' ') } : null, e.session ? { name: 'Session', value: e.session } : null].filter(Boolean), image, filename: 'trade.jpg' });
  });
  bus.on('risk:alert', (a) => {
    if (a.level !== 'breach') return;
    let image = null;
    try { image = captureChart({ root: adapter.layoutHost?.() || undefined, maxWidth: 1200 }); } catch (_) { /* text only */ }
    autoShare('risk', { title: a.id === 'pdpt' ? '🎯 Daily target reached' : '⛔ Risk limit hit', text: a.text, image, filename: 'chart.jpg' });
  });
  bus.on('recorder:saved', (r) => {
    if (r.error) { toast(root, `Recording: ${r.error}`, 'err', 4000); return; }
    toast(root, `Recording saved (${(r.size / 1048576).toFixed(1)} MB)`);
    if (r.id) autoShare('recordings', { title: r.name, text: `Recorded ${Math.round(r.duration)} s`, recordingId: r.id });
  });

  return { makeCard, copyCanvas, quickCard, toggleRecording, autoShare, cardInfo };
}
