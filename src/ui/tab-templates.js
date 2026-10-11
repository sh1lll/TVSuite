// Templates tab: fetch, snapshot, diff, selective restore, import/export, factory reset.
import { el, downloadJson, pickFile, setChildren } from '../core/dom.js';
import { section, row, select, toggle, button, chip, modal, confirmTyped, toast } from './kit.js';
import { createTvApi, toolLabel, TOOL_TYPES } from '../modules/templates/api.js';
import { normalizeBackup, makeBackup, backupFilename, diff, planRestore, summarizePlan, countEntries, entries } from '../modules/templates/model.js';
import { loadSnapshots, writeSnapshots, saveSnapshot } from '../modules/templates/snapshots.js';


export function templatesTab(app) {
  const { root, getSettings } = app;
  const api = createTvApi();
  const wrap = el('div');
  const state = { live: null, source: null, sourceLabel: '', diff: null, busy: false, filter: '', selected: new Set(), strategy: 'overwrite', progress: 0, msg: '', msgKind: '' };

  const keyOf = (tool, name) => `${tool}\u0000${name}`;

  async function username() {
    const ans = await app.queryMain('user');
    return ans?.username || 'user';
  }

  const saveSnap = async (data, reason) => saveSnapshot(data, { reason, user: await username(), keep: getSettings().templates.keepSnapshots });

  function setMsg(msg, kind = '') { state.msg = msg; state.msgKind = kind; render(); }

  async function busy(label, fn) {
    if (state.busy) return;
    state.busy = true; state.progress = 0; setMsg(label);
    try { await fn(); } catch (err) { setMsg(err.message || String(err), 'err'); console.error('[TVSuite]', err); }
    finally { state.busy = false; render(); }
  }

  async function fetchLive() {
    const res = await api.fetchAll({ concurrency: getSettings().templates.concurrency, onProgress: ({ done, total, label }) => { state.progress = done / total; setMsg(`Fetching ${label}… (${done}/${total})`); } });
    state.live = { THEMES: res.THEMES, TOOLS: res.TOOLS };
    return res;
  }

  function useSource(data, label) {
    state.source = data;
    state.sourceLabel = label;
    state.selected = new Set(entries(data).map((e) => keyOf(e.tool, e.name)));
    state.diff = state.live && data !== state.live ? diff(data, state.live) : null;
  }

  const actions = {
    fetch: () => busy('Fetching from TradingView…', async () => {
      const res = await fetchLive();
      useSource(state.live, 'Live account');
      const c = countEntries(state.live);
      setMsg(`Fetched ${c.themes} themes and ${c.templates} drawing templates${res.errors.length ? ` (${res.errors.length} errors — see console)` : ''}.`, res.errors.length ? 'err' : 'ok');
      if (res.errors.length) console.warn('[TVSuite] template fetch errors', res.errors);
    }),
    snapshot: () => busy('Taking snapshot…', async () => {
      if (!state.live) await fetchLive();
      const snap = await saveSnap(state.live, 'manual');
      setMsg(`Snapshot saved (${snap.counts.total} items).`, 'ok');
    }),
    exportFile: async () => {
      if (!state.source) return setMsg('Fetch or import something first.', 'err');
      const pick = { THEMES: {}, TOOLS: {} };
      for (const e of entries(state.source)) {
        if (!state.selected.has(keyOf(e.tool, e.name))) continue;
        if (e.tool === 'THEMES') pick.THEMES[e.name] = e.content; else (pick.TOOLS[e.tool] ??= {})[e.name] = e.content;
      }
      const user = await username();
      downloadJson(backupFilename(user), makeBackup(pick, user));
      setMsg(`Exported ${countEntries(pick).total} items.`, 'ok');
    },
    importFile: async () => {
      const f = await pickFile();
      if (!f) return;
      try {
        const b = normalizeBackup(JSON.parse(f.text));
        useSource({ THEMES: b.THEMES, TOOLS: b.TOOLS }, `File: ${f.name}${b.meta.user ? ` (from ${b.meta.user})` : ''}`);
        setMsg(`Loaded ${countEntries(state.source).total} items. Fetch live to compare, then Restore.`, 'ok');
      } catch (err) { setMsg(`Import failed: ${err.message}`, 'err'); }
    },
    compare: () => busy('Comparing with live account…', async () => {
      await fetchLive();
      state.diff = diff(state.source, state.live);
      const n = state.diff.filter((d) => d.status !== 'same').length;
      setMsg(n ? `${n} differences vs live.` : 'Identical to your live account.', 'ok');
    }),
    restore: () => busy('Planning restore…', async () => {
      if (!state.source) throw new Error('Nothing loaded to restore.');
      if (!state.live) await fetchLive();
      const sel = [...state.selected].map((k) => { const [tool, name] = k.split('\u0000'); return { tool, name }; });
      const ops = planRestore(state.source, state.live, sel, state.strategy);
      const sum = summarizePlan(ops);
      if (!sum.save) { setMsg(`Nothing to write (${sum.unchanged} unchanged, ${sum.skip} skipped).`, 'ok'); return; }
      const ok = await modal(root, {
        title: 'Restore to TradingView?',
        body: el('div', { class: 'kv' }, 'Will save', String(sum.save), 'Overwrite', String(sum.overwrite), 'Renamed', String(sum.renamed), 'Skipped', String(sum.skip), 'Unchanged', String(sum.unchanged), 'Safety', getSettings().templates.snapshotBeforeRestore ? 'snapshot first' : 'no snapshot'),
        actions: [{ label: 'Cancel', value: false }, { label: `Write ${sum.save} items`, value: true, variant: 'green' }],
      });
      if (!ok) { setMsg('Restore cancelled.'); return; }
      if (getSettings().templates.snapshotBeforeRestore) await saveSnap(state.live, 'before restore');
      const writes = ops.filter((o) => o.op === 'save');
      let done = 0, failed = 0;
      for (const o of writes) {
        try {
          if (o.tool === 'THEMES') await api.saveTheme(o.target, o.content); else await api.saveTemplate(o.tool, o.target, o.content);
        } catch (err) { failed++; console.error('[TVSuite] restore failed for', o.tool, o.target, err); }
        state.progress = ++done / writes.length;
        setMsg(`Writing ${done}/${writes.length}…`);
      }
      state.live = null;
      setMsg(`Restored ${done - failed} items${failed ? `, ${failed} failed` : ''}. Reload TradingView to see them; themes may need selecting in Chart settings.`, failed ? 'err' : 'ok');
    }),
    factoryReset: async () => {
      const ok = await confirmTyped(root, { title: 'Delete ALL drawing templates and themes?', text: 'TVSuite takes a snapshot first, so you can restore from the Snapshots list below. Type DELETE to confirm.', word: 'DELETE' });
      if (!ok) return setMsg('Factory reset cancelled.');
      busy('Snapshotting before reset…', async () => {
        const res = await fetchLive();
        if (res.errors.length) throw new Error('Some templates could not be read, so the safety snapshot would be incomplete. Reset aborted.');
        await saveSnap(state.live, 'before factory reset');
        const all = entries(state.live);
        let done = 0;
        for (const e of all) {
          if (e.tool === 'THEMES') await api.removeTheme(e.name); else await api.removeTemplate(e.tool, e.name);
          state.progress = ++done / all.length;
          setMsg(`Deleting ${done}/${all.length}…`);
        }
        state.live = { THEMES: {}, TOOLS: {} };
        useSource(state.live, 'Live account');
        setMsg(`Deleted ${all.length} items. A snapshot was saved first.`, 'ok');
      });
    },
  };

  async function snapshotsSection() {
    const list = await loadSnapshots();
    const box = el('div');
    if (!list.length) box.append(el('div', { class: 'note' }, 'No snapshots yet. TVSuite also snapshots automatically before restores and resets.'));
    for (const sn of list) {
      box.append(el('div', { class: 'row' },
        el('div', { class: 'grow' }, el('div', {}, new Date(sn.createdAt).toLocaleString()), el('div', { class: 'note' }, `${sn.counts.themes} themes · ${sn.counts.templates} templates · ${sn.reason}`)),
        button('Load', () => { useSource(sn.data, `Snapshot ${new Date(sn.createdAt).toLocaleString()}`); setMsg('Snapshot loaded. Compare or Restore below.', 'ok'); }, 'sm'),
        button('↓', () => downloadJson(backupFilename(sn.user || 'user', new Date(sn.createdAt)), makeBackup(sn.data, sn.user)), 'sm', { title: 'Export' }),
        button('✕', async () => { await writeSnapshots(list.filter((x) => x.id !== sn.id)).catch((err) => setMsg(err.message, 'err')); render(); }, 'sm', { title: 'Delete snapshot' })));
    }
    return section(`Snapshots (${list.length})`, box);
  }

  function listView() {
    if (!state.source) return el('div', { class: 'note' }, 'Fetch your templates from TradingView, load a snapshot, or import a backup file.');
    const statusOf = new Map((state.diff || []).map((d) => [keyOf(d.tool, d.name), d.status]));
    const groups = new Map();
    for (const e of entries(state.source)) {
      if (state.filter && !`${toolLabel(e.tool)} ${e.name}`.toLowerCase().includes(state.filter)) continue;
      if (!groups.has(e.tool)) groups.set(e.tool, []);
      groups.get(e.tool).push(e);
    }
    const order = ['THEMES', ...TOOL_TYPES];
    const list = el('div', { class: 'list' });
    for (const tool of [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
      list.append(el('div', { class: 'g' }, `${toolLabel(tool)} (${groups.get(tool).length})`));
      for (const e of groups.get(tool)) {
        const k = keyOf(e.tool, e.name);
        const cb = el('input', { type: 'checkbox', checked: state.selected.has(k) });
        cb.addEventListener('change', () => { if (cb.checked) state.selected.add(k); else state.selected.delete(k); });
        const st = statusOf.get(k);
        list.append(el('label', {}, cb, el('span', { class: 'nm' }, e.name), st && st !== 'same' ? chip(st, st === 'added' ? 'ok' : st === 'changed' ? 'warn' : 'err') : null));
      }
    }
    const removed = (state.diff || []).filter((d) => d.status === 'removed');
    if (removed.length) list.append(el('div', { class: 'g' }, `Only on live account (${removed.length})`), ...removed.map((d) => el('div', { class: 'note', style: { padding: '0 10px' } }, `${toolLabel(d.tool)} › ${d.name}`)));
    const search = el('input', { type: 'text', placeholder: 'Filter…', value: state.filter });
    search.addEventListener('input', () => { state.filter = search.value.toLowerCase(); const l = listView(); wrap.querySelector('[data-list]')?.replaceWith(l); search.focus(); });
    const box = el('div', { dataset: { list: '1' } },
      el('div', { class: 'row' }, el('div', { class: 'grow' }, search),
        button('All', () => { state.selected = new Set(entries(state.source).map((e) => keyOf(e.tool, e.name))); render(); }, 'sm'),
        button('None', () => { state.selected.clear(); render(); }, 'sm')),
      list);
    return box;
  }

  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    const snaps = await snapshotsSection();
    if (seq !== renderSeq) return; // a newer render started while we awaited storage
    const c = state.source ? countEntries(state.source) : null;
    const dis = state.busy ? { disabled: true } : {};
    setChildren(wrap, 
      section('Backup',
        el('div', { class: 'btns grid2' }, button('Fetch from TradingView', actions.fetch, 'primary', dis), button('Snapshot now', actions.snapshot, '', dis),
          button('Export selected…', actions.exportFile, '', dis), button('Import file…', actions.importFile, '', dis))),
      el('div', { class: 'progress' }, el('i', { style: { width: `${Math.round(state.progress * 100)}%` } })),
      state.msg ? el('div', { class: `note ${state.msgKind}` }, state.msg) : null,
      section(state.source ? `${state.sourceLabel} — ${c.themes} themes · ${c.templates} templates` : 'Templates', listView()),
      state.source ? section('Restore selected',
        select({ label: 'If name exists', value: state.strategy, options: [['overwrite', 'Overwrite'], ['skip', 'Keep existing (skip)'], ['rename', 'Save as "name (restored)"']], onChange: (v) => { state.strategy = v; } }),
        el('div', { class: 'btns' }, button('Compare with live', actions.compare, '', dis), button('Restore to TradingView…', actions.restore, 'green', dis))) : null,
      snaps,
      section('Automatic backup',
        toggle({ label: 'Snapshot my templates automatically while a chart is open', checked: getSettings().templates.autoBackup.enabled, onChange: (v) => app.update((st) => { st.templates.autoBackup.enabled = v; }) }),
        select({ label: 'Every', value: String(getSettings().templates.autoBackup.everyHours), options: [['6', '6 hours'], ['24', 'day'], ['168', 'week']], onChange: (v) => app.update((st) => { st.templates.autoBackup.everyHours = +v; }) }),
        el('div', { class: 'note' }, 'Read-only: fetches and stores a snapshot; skips unchanged ones. Keeps the newest ' + getSettings().templates.keepSnapshots + ' snapshots.')),
      section('Danger zone', button('Factory reset — delete all templates & themes…', actions.factoryReset, 'danger', dis)),
      el('div', { class: 'note' }, 'Uses TradingView\'s own (undocumented) web endpoints with your session, from this tab. Compatible with victornpb/vngbh backup files.'),
    );
  }

  const unsub = app.bus.on('templates:auto', (r) => { setMsg(`Automatic backup saved (${r.counts.total} items).`, 'ok'); });
  render();
  return { el: wrap, render, dispose: unsub };
}
