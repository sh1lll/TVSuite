// Journal capture dialog: chart image + context, saved to the extension's local journal.
import { el } from '../core/dom.js';
import { button, row, toast } from './kit.js';
import { captureChart } from '../modules/journal/capture.js';
import { activeSession } from '../modules/sessions/sessions.js';
import { parseTags } from '../modules/journal/stats.js';

export function setupJournalCapture(app) {
  const { bus, root, adapter, getSettings } = app;
  let open = false;

  async function capture() {
    if (open) return;
    if (!app.journal) { toast(root, 'The journal is available in the browser extension.', 'warn', 3500); return; }
    let image;
    try { image = captureChart({ root: adapter.layoutHost() || undefined }); }
    catch (err) { toast(root, `Capture failed: ${err.message}`, 'err'); return; }
    const obs = adapter.readObservation?.() || {};
    const sess = activeSession(getSettings().sessions.list, new Date());
    const risk = getSettings().tools.risk;
    const side = el('select', {}, ['long', 'short', 'none'].map((v) => el('option', { value: v, selected: v === (risk.entry && risk.stop ? (risk.entry > risk.stop ? 'long' : 'short') : 'none') }, v)));
    const num = (v) => el('input', { type: 'number', step: 'any', value: v || '' });
    const entry = num(risk.entry), stop = num(risk.stop), target = num('');
    const pnl = el('input', { type: 'number', step: 'any', placeholder: 'P&L $ (optional)', dataset: { journalPnl: '1' } });
    const contracts = el('input', { type: 'number', step: 1, min: 0, placeholder: 'Contracts' });
    const tags = el('input', { type: 'text', placeholder: 'tags e.g. breakout a+' });
    const note = el('textarea', { placeholder: 'What did you see? Why this trade?', rows: 3 });
    open = true;
    const bg = el('div', { class: 'modal-bg', dataset: { journal: '1' } });
    const close = () => { bg.remove(); open = false; };
    const save = async () => {
      const entryRec = {
        createdAt: Date.now(), symbol: obs.symbol || '', price: obs.price ?? obs.close ?? null,
        ohlc: { o: obs.open, h: obs.high, l: obs.low, c: obs.close }, session: sess?.name || '',
        side: side.value, entry: entry.value, stop: stop.value, target: target.value, tags: parseTags(tags.value), note: note.value,
        pnl: pnl.value, contracts: contracts.value, id: `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        url: location.href.split('#')[0], image,
      };
      try {
        await app.journal.add(entryRec);
        if (pnl.value !== '' && app.risk) await app.risk.addTrade({ pnl: +pnl.value, contracts: contracts.value === '' ? null : +contracts.value, symbol: entryRec.symbol, journalId: entryRec.id });
        bus.emit('journal:saved', { ...entryRec, tags: entryRec.tags });
        close(); toast(root, pnl.value !== '' ? 'Saved to journal and Risk Guard' : 'Saved to journal');
      }
      catch (err) { toast(root, `Journal save failed: ${err.message}`, 'err', 4000); }
    };
    bg.append(el('div', { class: 'modal', style: { width: '460px' } },
      el('h3', {}, `Journal — ${obs.symbol || 'chart'}${sess ? ` · ${sess.name}` : ''}`),
      el('img', { src: image, alt: 'chart capture', style: { width: '100%', borderRadius: '4px', border: '1px solid var(--border)' } }),
      row('Side', side), row('Entry / stop', entry, stop), row('Target', target), row('P&L / contracts', pnl, contracts), row('Tags', tags), note,
      el('div', { class: 'btns', style: { justifyContent: 'space-between' } },
        button('Open journal', () => app.journal.open()),
        el('span', {}, button('Cancel', close), ' ', button('Save', save, 'primary')))));
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    root.append(bg);
    note.focus();
  }

  bus.on('journal:capture', capture);
  return { capture };
}
