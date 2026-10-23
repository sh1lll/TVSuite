// Levels tab: copy your TradingView drawings onto another platform's chart, or paste a Ledgeline export (copied
// from TradingView's Pine Logs) and draw it. Works on tradingview.com and on embedded charts (TopstepX/ProjectX,
// TradeSea) through the chart's own page API.
import { el, setChildren } from '../core/dom.js';
import { section, row, select, toggle, button, toast, chip } from './kit.js';
import { parseLevels, countByType, LEVEL_TYPES, LEVEL_NAMES } from '../modules/levels/parse.js';
import { describeCopy, pickCopy, marketKey } from '../modules/drawings/model.js';

export function levelsTab(app) {
  const { getSettings, update, root } = app;
  const wrap = el('div');
  let summary, status, tplNames = [], permCount = 0, snapCount = 0;
  let dstatus, copies = {}, chosen = null, chartSymbol = null, dPermCount = 0;
  let lstatus, injected = null;
  const onTV = /(^|\.)tradingview\.com$/.test(location.hostname);

  const say = (text, kind = '') => { if (status) setChildren(status, el('div', { class: `note${kind ? ` ${kind}` : ''}` }, text)); };

  function paintSummary() {
    if (!summary) return;
    const all = parseLevels(getSettings().levels.text);
    if (!all.length) { setChildren(summary, el('div', { class: 'note' }, 'No levels found yet.')); return; }
    const n = countByType(all);
    setChildren(summary, el('div', { class: 'row' }, ...LEVEL_TYPES.filter((t) => n[t]).map((t) => chip(`${n[t]} ${LEVEL_NAMES[t]}`))));
  }

  async function run(fn, done) {
    let msg = null, kind = 'err';
    try {
      const r = await fn();
      if (r?.ok) { msg = done(r); kind = 'ok'; toast(root, msg); } else msg = r?.reason || 'Something went wrong.';
    } catch (err) { msg = err.message; }
    // The chart reports permanent ids a moment after drawing, so the count is read again after a short wait.
    await new Promise((res) => setTimeout(res, 400));
    permCount = await app.levels.permanentCount();
    render();
    say(msg, kind);
  }

  const sayD = (text, kind = '') => { if (dstatus) setChildren(dstatus, el('div', { class: `note${kind ? ` ${kind}` : ''}` }, text)); };

  async function loadDrawings() {
    copies = await app.drawings.copies();
    dPermCount = await app.drawings.permanentCount();
    const probe = await app.queryMain(JSON.stringify({ cmd: 'levelsProbe' }), 1500);
    chartSymbol = probe?.symbol || null;
    if (!chosen || !copies[chosen]) chosen = pickCopy(copies, chartSymbol);
  }

  // Pasting reports what the chart actually made a moment later (tools it doesn't have are skipped).
  async function runD(fn, done) {
    let msg = null, kind = 'err';
    try {
      const r = await fn();
      if (r?.ok) {
        if (r.attempted != null) await new Promise((res) => setTimeout(res, 900));
        msg = done(r, app.drawings.lastDone()); kind = 'ok'; toast(root, msg);
      } else msg = r?.reason || 'Something went wrong.';
    } catch (err) { msg = err.message; }
    await loadDrawings();
    render();
    sayD(msg, kind);
  }
  const pasted = (r, d) => {
    const skipped = [...new Set([...(r.skipped || []), ...(d?.skipped || [])])];
    const made = d ? d.made : r.attempted;
    return `Pasted ${made} drawing${made === 1 ? '' : 's'}${skipped.length ? `. Skipped (this chart doesn't have them): ${skipped.map((n) => n.replace(/_/g, ' ')).join(', ')}` : ''}`;
  };

  // Exported copies travel as text where the extension's storage doesn't reach: TradingView Desktop, the
  // userscript, or someone else's TVSuite.
  let importText = '';
  function importBox() {
    const box = el('textarea', { rows: 3, placeholder: 'Import copy: paste a block exported with Export copy (from TradingView Desktop, or from someone else).' });
    box.value = importText;
    box.addEventListener('input', () => { importText = box.value; });
    const doImport = (text) => runD(async () => { const r = await app.drawings.importText(text); chosen = r.key; importText = ''; return r; }, (r) => `Imported ${r.count} drawings for ${r.key}. Press Paste here to put them on this chart.`);
    return el('div', {},
      box,
      el('div', { class: 'btns' },
        button('Import from clipboard', async () => {
          let t = '';
          try { t = await navigator.clipboard.readText(); } catch (_) { sayD('The browser blocked clipboard reading here. Paste into the box with Cmd/Ctrl+V, then press Import copy.', 'err'); return; }
          doImport(t);
        }),
        button('Import copy', () => doImport(box.value))));
  }

  function drawingsSection() {
    const d = getSettings().drawings;
    const keys = Object.keys(copies).sort((a, b) => copies[b].at - copies[a].at);
    const cur = chosen && copies[chosen];
    const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const pick = keys.length ? select({ label: 'Copy to paste', value: chosen, options: keys.map((k) => [k, `${k} · ${copies[k].items.length} drawings · ${when(copies[k].at)}`]), onChange: (v) => { chosen = v; render(); } }) : null;
    return section('TradingView drawings',
      el('div', { class: 'note' }, onTV
        ? 'Copy the drawings on this chart, then open TopstepX, TradeSea or another platform with a TradingView chart and paste them there. One copy is kept per market (NQ and MNQ share one), and copying again replaces it. In TradingView Desktop, also press Export copy and import the text on the other platform.'
        : 'Paste drawings you copied on tradingview.com. Open the chart there, press Copy drawings from this chart in this tab, then come back here. From TradingView Desktop, use Export copy there and Import copy here.'),
      el('div', { class: 'btns' },
        button('Copy drawings from this chart', () => runD(() => app.drawings.copy(), (r) => `Copied ${r.count} drawings for ${r.key}${r.failed ? ` (${r.failed} couldn't be read)` : ''}`), onTV ? 'primary' : ''),
        button('Export copy', () => runD(async () => {
          const t = await app.drawings.exportText(chosen);
          if (!t) return { ok: false, reason: 'Copy drawings from a chart first.' };
          try { await navigator.clipboard.writeText(t); return { ok: true, clip: true }; }
          catch (_) { importText = t; return { ok: true, clip: false }; }
        }, (r) => r.clip ? `Copied the ${chosen} drawings to the clipboard as text. Paste them into Import copy in TVSuite on the other platform.` : 'The clipboard was blocked here, so the text is in the Import copy box below. Select it all and copy it by hand.'), '', { disabled: !cur })),
      pick,
      cur ? el('div', { class: 'note' }, `${describeCopy(cur.items)}. From ${cur.symbol || chosen}${chartSymbol && marketKey(chartSymbol) !== chosen ? `; this chart is ${chartSymbol}, so check the prices line up` : ''}.`) : el('div', { class: 'note' }, 'Nothing copied yet.'),
      el('div', { class: 'row' }, el('span', { class: 'grow' }, 'Pasted permanently on this site'), dPermCount ? chip(`${dPermCount} drawings`, 'ok') : chip('None')),
      toggle({ label: 'Lock pasted drawings', checked: d.lock, onChange: (v) => update((st) => { st.drawings.lock = v; }, { silent: true }) }),
      toggle({ label: 'Replace what TVSuite pasted before', checked: d.replace, onChange: (v) => update((st) => { st.drawings.replace = v; }, { silent: true }) }),
      el('div', { class: 'btns' },
        button('Paste here', () => runD(() => app.drawings.paste({ key: chosen, permanent: true }), pasted), onTV ? '' : 'primary', { disabled: !cur }),
        button('Preview (until reload)', () => runD(() => app.drawings.paste({ key: chosen, permanent: false }), pasted), '', { disabled: !cur }),
        button('Remove pasted drawings', () => runD(async () => {
          const a = await app.drawings.clear(); const b = await app.drawings.removePermanent();
          return a?.ok || b?.ok ? { ok: true, count: (a?.count || 0) + (b?.count || 0) } : (b || a);
        }, (r) => r.count ? `Removed ${r.count} pasted drawings` : 'No pasted drawings to remove')),
        cur ? button('Delete this copy', () => runD(async () => { await app.drawings.deleteCopy(chosen); chosen = null; return { ok: true }; }, () => 'Copy deleted')) : null),
      importBox(),
      el('div', { class: 'note' }, 'Paste here saves the drawings into this platform\'s chart layout, like ones you drew by hand: they stay without TVSuite and you can edit or delete them. Reload once to check the platform keeps them. Remove deletes only what TVSuite pasted; your own drawings stay. Prices carry over as they are, so paste onto the same contract you copied from.'),
      dstatus = el('div'));
  }

  const sayL = (text, kind = '') => { if (lstatus) setChildren(lstatus, el('div', { class: `note${kind ? ` ${kind}` : ''}` }, text)); };

  // Labs: proof of concept for indicators on embedded charts without TradingView.
  function labsSection() {
    const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString();
    const runL = async (fn, done) => {
      let msg, kind = 'err';
      try { const r = await fn(); if (r?.ok) { msg = done(r); kind = 'ok'; } else msg = r?.reason || 'Something went wrong.'; } catch (err) { msg = err.message; }
      render(); sayL(msg, kind);
    };
    return section('Labs (experimental)',
      el('div', { class: 'note' }, 'Two experiments for running indicators on TopstepX, TradeSea and other embedded charts without TradingView.'),
      toggle({ label: 'Add TVSuite indicators to this platform\'s chart', checked: app.labs.indicatorsOn(), onChange: (v) => { app.labs.setIndicators(v); sayL(v ? 'On for this site. Reload the page, then find "TVSuite Demo MA" in the chart\'s Indicators menu.' : 'Off for this site. Reload the page to take it out.', 'ok'); } }),
      el('div', { class: 'row' }, el('span', { class: 'grow' }, 'Injected on this chart'),
        injected == null ? chip('Not checked') : injected.length ? chip(injected.join(', '), 'ok') : chip('None')),
      el('div', { class: 'btns' },
        button('Check injection', () => runL(async () => { const r = await app.levels.probe(); if (r?.ok) injected = r.indicators || []; return r; },
          () => (injected.length ? `Injected: ${injected.join(', ')}. Add it from the chart's Indicators menu.` : 'Nothing injected yet. Turn the toggle on and reload the page.')))),
      el('div', { class: 'note' }, 'Injected indicators run inside the platform\'s chart on its own live data (the demo plots an SMA and a volume-weighted MA). They only load when the chart is created, so changes need a page reload.'),
      el('div', { class: 'btns' },
        button('Draw session levels from chart bars', () => runL(() => app.labs.drawSessions(),
          (r) => `Read ${r.bars.toLocaleString()} bars (${r.resolution}${r.volume ? ', with volume' : ''}) and drew ${r.count} levels for ${r.day}: ${r.levels.map((l) => `${l.label} ${fmt(l.top)}`).join(' · ')}`), 'primary'),
        button('Remove session levels', () => runL(() => app.labs.clearSessions(), (r) => `Removed ${r.count} levels`))),
      el('div', { class: 'note' }, 'Compute and draw: TVSuite reads the bars already on this chart, works out prior day high/low, overnight high/low and the RTH open (New York time), and draws them. Nothing comes from TradingView.'),
      lstatus = el('div'));
  }

  // Template names for the current draw mode come from the Backup tab's snapshots, so reload them on each render.
  async function loadTemplates() {
    tplNames = [...(await app.levels.templates()).keys()].sort((a, b) => a.localeCompare(b));
    snapCount = await app.levels.snapshotCount();
    permCount = await app.levels.permanentCount();
    render();
  }

  function render() {
    const s = getSettings().levels;
    const text = el('textarea', { rows: 7, placeholder: 'Paste the Ledgeline export here.\nTurn on "Export levels to Pine Logs" in Ledgeline, open the indicator\'s Pine Logs, and copy the lines.' });
    text.value = s.text;
    text.addEventListener('input', () => { update((st) => { st.levels.text = text.value; }, { silent: true }); paintSummary(); });
    const paste = async () => {
      try { text.value = await navigator.clipboard.readText(); update((st) => { st.levels.text = text.value; }, { silent: true }); paintSummary(); }
      catch (_) { say('The browser blocked clipboard reading here. Paste into the box with Cmd/Ctrl+V instead.', 'err'); }
    };

    const color = (t) => {
      const inp = el('input', { type: 'color', value: s.colors[t] || '#9696a0', title: `${LEVEL_NAMES[t]} color` });
      inp.addEventListener('input', () => update((st) => { st.levels.colors[t] = inp.value; }, { silent: true }));
      return inp;
    };
    // A saved template replaces the color for that type; a missing one (deleted since) falls back to the color.
    // Always shown; with no saved templates of this kind it stays on Color and the note below says why.
    const template = (t) => {
      const cur = s.templates?.[t] || '';
      const sel = el('select', { title: `${LEVEL_NAMES[t]} template`, style: { width: '150px' }, disabled: !tplNames.length && !cur },
        el('option', { value: '' }, tplNames.length ? 'Color' : 'Color (no templates)'),
        ...tplNames.map((n) => el('option', { value: n, selected: n === cur }, n)),
        cur && !tplNames.includes(cur) ? el('option', { value: cur, selected: true }, `${cur} (not found)`) : null);
      sel.value = cur;
      sel.addEventListener('change', () => update((st) => { st.levels.templates[t] = sel.value; }, { silent: true }));
      return sel;
    };
    const hours = el('input', { type: 'number', min: 1, max: 336, step: 1, value: s.extendHours });
    hours.addEventListener('input', () => update((st) => { st.levels.extendHours = Math.max(1, Math.min(336, +hours.value || 24)); }, { silent: true }));

    summary = el('div');
    status = el('div');
    const tool = s.style === 'box' ? 'Rectangle' : 'Horizontal Line';
    setChildren(wrap,
      drawingsSection(),
      section('Ledgeline levels',
        text,
        el('div', { class: 'btns' }, button('Paste from clipboard', paste), button('Clear text', () => { text.value = ''; update((st) => { st.levels.text = ''; }, { silent: true }); paintSummary(); })),
        summary),
      section('What to draw',
        select({ label: 'Draw as', value: s.style, options: [['box', 'Boxes (top to bottom)'], ['line', 'Lines (middle)']], onChange: (v) => { update((st) => { st.levels.style = v; }, { silent: true }); loadTemplates(); } }),
        ...LEVEL_TYPES.map((t) => el('div', { class: 'row' },
          el('div', { class: 'grow' }, toggle({ label: LEVEL_NAMES[t], checked: s.types[t] !== false, onChange: (v) => update((st) => { st.levels.types[t] = v; }, { silent: true }) })),
          template(t), color(t))),
        el('div', { class: 'note' }, tplNames.length
          ? `Pick one of your saved ${tool} templates for a type, or keep Color.`
          : snapCount
            ? `Your TVSuite backup has no ${tool} templates yet. Save one in TradingView (right-click a ${tool.toLowerCase()} → Template → Save drawing template as), then press Snapshot now in TVSuite's Templates tab on tradingview.com.`
            : `No template backup yet. Open tradingview.com, go to TVSuite's Templates tab and press Snapshot now. Your saved ${tool} templates then show up here, on every site.`),
        toggle({ label: 'Show labels', checked: s.labels, onChange: (v) => update((st) => { st.levels.labels = v; }, { silent: true }) }),
        row('Box length (h)', hours),
        toggle({ label: 'Replace the previous TVSuite levels when drawing', checked: s.replace, onChange: (v) => update((st) => { st.levels.replace = v; }, { silent: true }) })),
      section('Chart',
        el('div', { class: 'row' }, el('span', { class: 'grow' }, 'Levels'), s.active ? chip('On', 'ok') : chip('Off')),
        el('div', { class: 'btns' },
          button(s.active ? 'Redraw on this chart' : 'Draw on this chart', () => run(() => app.levels.draw(), (r) => `Drew ${r.count} levels`), 'primary'),
          button('Remove TVSuite levels', () => run(() => app.levels.clear(), (r) => `Removed ${r.count} levels`)),
          button('Check this chart', () => run(() => app.levels.probe(), (r) => `Chart API found (${r.via})${r.symbol ? ` on ${r.symbol}` : ''}. Boxes ${r.rectangles ? 'yes' : 'no'}, lines ${r.lines ? 'yes' : 'no'}.`))),
        el('div', { class: 'note' }, 'Once drawn, levels stay on: they come back every time a chart opens, on any site TVSuite runs on, until you press Remove. They\'re drawn with the chart\'s own tools, locked, and kept out of your saved layout. Only levels drawn here are removed; your own drawings stay. TVSuite never touches orders.'),
        status),
      section('Permanent',
        el('div', { class: 'row' }, el('span', { class: 'grow' }, 'Saved on this site'), permCount ? chip(`${permCount} levels`, 'ok') : chip('None')),
        toggle({ label: 'Lock permanent levels', checked: s.lockPermanent, onChange: (v) => update((st) => { st.levels.lockPermanent = v; }, { silent: true }) }),
        el('div', { class: 'btns' },
          button('Draw permanently', () => run(() => app.levels.drawPermanent(), (r) => `Saved ${r.count} levels into this chart`)),
          button('Remove permanent levels', () => run(() => app.levels.removePermanent(), (r) => r.count ? `Removed ${r.count} permanent levels` : 'No permanent levels to remove'))),
        el('div', { class: 'note' }, 'Permanent levels are saved into this platform\'s chart layout, like drawings you made by hand, so they stay without TVSuite and you can move or delete them yourself. Drawing permanently turns the auto-redraw above off so the two don\'t double up. TVSuite remembers what it saved on this site and can remove it again. Reload the page once to check that the platform keeps them; if it doesn\'t save layouts, use Draw on this chart instead.')),
      labsSection(),
    );
    paintSummary();
  }

  render();
  loadTemplates();
  loadDrawings().then(render).catch(() => {});
  return { el: wrap, render };
}
