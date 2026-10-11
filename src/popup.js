// Extension popup: quick toggles that write to the shared settings document.
import { loadSettings, saveSettings } from './core/settings.js';
import { BUILTIN_CANVAS, BUILTIN_SHADERS } from './modules/skins/builtins.js';

const $ = (id) => document.getElementById(id);

async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }

(async () => {
  const s = await loadSettings();
  const save = () => saveSettings(s);
  const options = [...BUILTIN_CANVAS, ...BUILTIN_SHADERS].map((b) => ({ value: b.id, label: b.name, rec: { kind: 'builtin', base: b.id, id: b.id, name: b.name } }))
    .concat(s.skins.library.map((sk) => ({ value: sk.id, label: `★ ${sk.name}`, rec: sk })));
  const activeId = s.skins.active?.id || s.skins.active?.base;
  for (const o of options) $('skin').append(new Option(o.label, o.value, false, o.value === activeId));

  $('enabled').checked = s.skins.enabled;
  $('mode').value = s.skins.mode;
  $('opacity').value = s.skins.opacity;
  $('reactive').checked = s.skins.reactive.enabled;
  $('sessionThemes').checked = s.skins.sessionThemes;

  $('enabled').onchange = () => { s.skins.enabled = $('enabled').checked; save(); };
  $('skin').onchange = () => { s.skins.active = options.find((o) => o.value === $('skin').value).rec; s.skins.enabled = true; $('enabled').checked = true; save(); };
  $('mode').onchange = () => { s.skins.mode = $('mode').value; save(); };
  $('opacity').oninput = () => { s.skins.opacity = +$('opacity').value; save(); };
  $('reactive').onchange = () => { s.skins.reactive.enabled = $('reactive').checked; save(); };
  $('sessionThemes').onchange = () => { s.skins.sessionThemes = $('sessionThemes').checked; save(); };
  $('options').onclick = () => chrome.runtime.openOptionsPage();

  const tab = await activeTab();
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) { /* chrome:// pages */ }
  const onTv = /(^|\.)tradingview\.com$/.test(host);
  $('panel').onclick = async () => { try { await chrome.tabs.sendMessage(tab.id, { type: 'panel.toggle' }); window.close(); } catch (_) { $('status').textContent = 'TVSuite is not running on this tab. Open a TradingView chart (or use "Turn on here").'; } };
  $('here').hidden = onTv || !/^https:/.test(tab?.url || '');
  $('here').onclick = async () => {
    const granted = await chrome.permissions.request({ origins: [`https://${host}/*`] });
    if (!granted) { $('status').textContent = 'Permission not granted.'; return; }
    if (!s.sites.some((x) => x.host === host)) s.sites.push({ host, kind: 'tv-embed' });
    await save();
    await chrome.runtime.sendMessage({ type: 'sites.sync' });
    $('status').textContent = `Enabled on ${host}. Reload the page.`;
  };
  try {
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    $('status').textContent = st?.ok ? `Running (${st.adapter}) · skin ${st.status?.state || 'off'}${st.status?.fps ? ` · ${st.status.fps} fps` : ''}` : '';
  } catch (_) { if (!onTv) $('status').textContent = 'Not running on this tab.'; }
})();
