// About / settings tab: hotkeys, privacy, diagnostics, settings export/import.
import { el, downloadJson, pickFile, setChildren } from '../core/dom.js';
import { section, row, button, toast, kv } from './kit.js';
import { HOST } from '../core/env.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { withDefaults } from '../core/storage.js';

export function aboutTab(app) {
  const { getSettings, update, root, adapter, skins } = app;
  const wrap = el('div');

  function hotkeyInput(label, path) {
    const [a, b] = path;
    const inp = el('input', { type: 'text', value: getSettings()[a][b], placeholder: 'e.g. Alt+Shift+T' });
    inp.addEventListener('change', () => update((st) => { st[a][b] = inp.value.trim(); }));
    return row(label, inp);
  }

  async function render() {
    const stats = await app.queryMain('stats');
    const st = skins.status();
    const q = (sel) => { try { return document.querySelectorAll(sel).length; } catch (_) { return 0; } };
    setChildren(wrap, 
      section('Hotkeys', hotkeyInput('Panel', ['ui', 'panelHotkey']), hotkeyInput('Skin on/off', ['ui', 'skinHotkey']), hotkeyInput('Focus mode', ['tools', 'focusHotkey']), hotkeyInput('Hide TVSuite UI', ['ui', 'streamHotkey']), hotkeyInput('Journal capture', ['tools', 'journalHotkey'])),
      section('Privacy',
        el('div', { class: 'note' }, 'TVSuite has no account, no telemetry and no servers. Settings, skins and template snapshots stay in this browser. Chart-reactive skins read price text already on screen, locally. The only network calls are (1) TradingView\'s own template endpoints when you use the Templates tab and (2) the AI provider you configure, when you press Generate.')),
      section('Diagnostics',
        kv(
          'Host', HOST, 'Adapter', adapter.name, 'Skin state', `${st.state || 'off'}${st.mode ? ` (${st.mode})` : ''}`,
          'Background clears', String(stats?.clears ?? 'n/a'),
          'Chart canvases', String(q('.chart-markup-table canvas')), 'Legend found', q('[data-name="legend-series-item"]') ? 'yes' : 'no',
          'Layout host', adapter.layoutHost() ? 'yes' : 'no'),
        el('div', { class: 'note' }, 'If "Background clears" stays 0 while a skin is on in Under mode, TradingView changed how it paints; switch to Overlay mode and please report it.'),
        button('Refresh', render, 'sm')),
      section('Settings',
        el('div', { class: 'btns' },
          button('Export settings', () => downloadJson('tvsuite-settings.json', getSettings())),
          button('Import settings', async () => {
            const f = await pickFile(); if (!f) return;
            try { const data = withDefaults(DEFAULT_SETTINGS, JSON.parse(f.text)); update((s) => { Object.assign(s, data); }); toast(root, 'Settings imported'); app.rerender(); }
            catch (err) { toast(root, `Import failed: ${err.message}`, 'err'); }
          }),
          button('Reset to defaults', () => { update((s) => { Object.assign(s, structuredClone(DEFAULT_SETTINGS)); }); app.rerender(); }, 'danger'))),
      el('div', { class: 'note' }, 'TVSuite is an independent open-source project, not affiliated with or endorsed by TradingView.'),
    );
  }
  render();
  return { el: wrap, render };
}
