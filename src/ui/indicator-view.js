// Indicators view (Bridge tab): write an indicator in Python, JavaScript or Java → Pine Script v6 for
// TradingView. Built-in translator for the common subset; the configured AI model for anything else.
import { el, setChildren } from '../core/dom.js';
import { section, row, segmented, button, toast, copyText, chip, modal } from './kit.js';
import { transpile, EXAMPLES } from '../modules/indicators/transpile.js';
import { storage } from '../core/storage.js';
import { sendToPineEditor } from '../modules/indicators/pine-editor.js';

const KEY = 'indicators';
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '11.5px', lineHeight: '1.45', whiteSpace: 'pre', tabSize: 4 };

export function indicatorView(app) {
  const { root } = app;
  const wrap = el('div');
  let lang = 'auto', saved = [], current = { id: null, name: '' };
  const src = el('textarea', { rows: 14, spellcheck: 'false', dataset: { indSrc: '1' }, style: mono, placeholder: 'Write or paste an indicator in Python, JavaScript or Java…' });
  src.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); const s = src.selectionStart; src.setRangeText('    ', s, src.selectionEnd, 'end'); } });
  const out = el('textarea', { rows: 14, readonly: true, spellcheck: 'false', dataset: { indOut: '1' }, style: mono });
  out.addEventListener('keydown', (e) => e.stopPropagation());
  const status = el('div', { class: 'note', dataset: { indStatus: '1' } });
  const name = el('input', { type: 'text', placeholder: 'Name (to save it)', style: { maxWidth: '200px' } });
  name.addEventListener('keydown', (e) => e.stopPropagation());

  const setStatus = (text, kind = '') => { setChildren(status, kind ? chip(kind === 'err' ? 'error' : kind === 'ai' ? 'AI' : 'ok', kind === 'err' ? 'err' : 'ok') : null, ' ', text); };
  function translate() {
    try {
      const r = transpile(src.value, { lang, name: name.value || 'My indicator' });
      out.value = r.pine;
      setStatus(`Translated from ${r.lang === 'js' ? 'JavaScript' : r.lang === 'python' ? 'Python' : 'Java'}, copy it into TradingView’s Pine Editor and press “Add to chart”.`, 'ok');
      return true;
    } catch (err) { out.value = ''; setStatus(`${err.message}${app.ai ? ', or use “Translate with AI”.' : ''}`, 'err'); return false; }
  }
  async function viaAi() {
    if (!app.ai?.pine) { toast(root, 'AI translation needs the browser extension and a model in Options', 'warn', 4000); return; }
    setStatus('Translating with your AI model…');
    try { const r = await app.ai.pine(src.value, lang); out.value = r.pine; setStatus(r.notes || 'Translated by your AI model, review before use.', 'ai'); }
    catch (err) { setStatus(err.message, 'err'); }
  }
  async function send(addToChart) {
    if (!out.value && !translate()) return;
    const res = await sendToPineEditor(out.value, { queryMain: app.queryMain, addToChart });
    if (res.ok) {
      toast(root, res.added ? 'Sent to the Pine Editor and added to the chart' : res.addMissing ? 'Sent, couldn’t find “Add to chart”, press it in the Pine Editor' : 'Sent to the Pine Editor, press “Add to chart” when ready', 'ok', 4000);
      setStatus(`In the Pine Editor (${res.method === 'api' ? 'editor API' : res.method === 'pasted' ? 'pasted' : 'typed'}${res.added ? ', added to chart' : ''}).`, 'ok');
      return;
    }
    await copyText(out.value).catch(() => {});
    setStatus(res.message, 'err');
    modal(root, { title: 'Pine script copied', body: el('div', {},
      el('p', { class: 'note' }, res.message),
      el('ol', { class: 'note', style: { paddingLeft: '18px' } },
        el('li', {}, 'Open the Pine Editor (bottom panel of the chart).'),
        el('li', {}, 'Click inside it, select all (Ctrl/⌘ + A) and paste (Ctrl/⌘ + V).'),
        el('li', {}, 'Press “Save”, then “Add to chart”.'))),
      actions: [{ label: 'OK', value: true, variant: 'primary' }] });
  }

  async function load() { saved = (await storage.get(KEY, [])) || []; render(); }
  async function save() {
    const nm = name.value.trim() || 'My indicator';
    const item = { id: current.id || `i${Date.now().toString(36)}`, name: nm.slice(0, 60), lang, code: src.value.slice(0, 100000), updatedAt: Date.now() };
    saved = [item, ...saved.filter((x) => x.id !== item.id)].slice(0, 50);
    current = item;
    await storage.set(KEY, saved);
    toast(root, `Saved “${nm}”`);
    render();
  }

  function render() {
    setChildren(wrap,
      el('div', { class: 'note' }, 'TradingView only runs Pine Script, so TVSuite translates: write your indicator in Python, JavaScript or Java and get Pine v6 to paste into the Pine Editor.'),
      row('Language', segmented({ value: lang, options: [['auto', 'Auto'], ['python', 'Python'], ['js', 'JavaScript'], ['java', 'Java']], onChange: (v) => { lang = v; } })),
      el('div', { class: 'btns', style: { flexWrap: 'wrap' } }, el('span', { class: 'note', style: { margin: '0 4px 0 0', alignSelf: 'center' } }, 'Examples'),
        ...['python', 'js', 'java'].map((k) => button(k === 'js' ? 'JavaScript' : k[0].toUpperCase() + k.slice(1), () => { src.value = EXAMPLES[k]; lang = k; current = { id: null }; name.value = ''; render(); translate(); }, 'sm', { dataset: { example: k } }))),
      src,
      el('div', { class: 'btns', style: { flexWrap: 'wrap' } },
        button('Translate to Pine', translate, 'primary', { dataset: { translate: '1' } }),
        app.ai ? button('Translate with AI', viaAi, '', { icon: 'sparkle' }) : null),
      status,
      out,
      el('div', { class: 'btns', style: { flexWrap: 'wrap' } },
        button('Copy Pine', async () => { if (!out.value) return; await copyText(out.value); toast(root, 'Pine copied, paste it into the Pine Editor'); }, 'primary', { icon: 'copy', dataset: { copyPine: '1' } }),
        button('Send to Pine Editor', () => send(false), '', { icon: 'code', dataset: { sendPine: '1' } }),
        button('Send & add to chart', () => send(true), '', { dataset: { sendPineAdd: '1' } })),
      el('div', { class: 'note' }, 'Send opens TradingView’s Pine Editor if needed, replaces its script and checks it went in. If it can’t confirm, the script goes to your clipboard with steps.'),
      section(`My indicators · ${saved.length}`,
        el('div', { class: 'row' }, name, button('Save', save, 'sm')),
        saved.length ? el('div', { class: 'list' }, saved.map((it) => el('div', { class: 'row', style: { padding: '0 10px' } },
          el('span', { class: 'grow' }, it.name), chip(it.lang === 'js' ? 'JS' : it.lang),
          button('Open', () => { src.value = it.code; lang = it.lang; name.value = it.name; current = it; render(); translate(); }, 'sm'),
          button('Delete', async () => { saved = saved.filter((x) => x.id !== it.id); await storage.set(KEY, saved); render(); }, 'sm')))) : null));
  }
  render();
  load();
  return wrap;
}
