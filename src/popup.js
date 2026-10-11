// Extension popup: quick toggles that write to the shared settings document.
import { loadSettings, saveSettings } from './core/settings.js';
import { BUILTIN_CANVAS, BUILTIN_SHADERS } from './modules/skins/builtins.js';

const $ = (id) => document.getElementById(id);

async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }

(async () => {
  const s = await loadSettings();
  // Re-read before each write so changes made in a TradingView tab meanwhile aren't overwritten.
  const save = async (mutate) => { const fresh = await loadSettings(); mutate(fresh); await saveSettings(fresh); };
  const options = [...BUILTIN_CANVAS, ...BUILTIN_SHADERS].map((b) => ({ value: b.id, label: b.name, rec: { kind: 'builtin', base: b.id, id: b.id, name: b.name } }))
    .concat(s.skins.library.map((sk) => ({ value: sk.id, label: `★ ${sk.name}`, rec: sk })));
  const activeId = s.skins.active?.id || s.skins.active?.base;
  for (const o of options) $('skin').append(new Option(o.label, o.value, false, o.value === activeId));

  $('enabled').checked = s.skins.enabled;
  $('mode').value = s.skins.mode;
  $('opacity').value = s.skins.opacity;
  $('reactive').checked = s.skins.reactive.enabled;
  $('sessionThemes').checked = s.skins.sessionThemes;

  $('enabled').onchange = () => save((f) => { f.skins.enabled = $('enabled').checked; });
  $('skin').onchange = () => { const rec = options.find((o) => o.value === $('skin').value).rec; $('enabled').checked = true; save((f) => { f.skins.active = rec; f.skins.enabled = true; }); };
  $('mode').onchange = () => save((f) => { f.skins.mode = $('mode').value; });
  $('opacity').oninput = () => save((f) => { f.skins.opacity = +$('opacity').value; });
  $('reactive').onchange = () => save((f) => { f.skins.reactive.enabled = $('reactive').checked; });
  $('sessionThemes').onchange = () => save((f) => { f.skins.sessionThemes = $('sessionThemes').checked; });
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
    await save((f) => { if (!f.sites.some((x) => x.host === host)) f.sites.push({ host, kind: 'tv-embed' }); });
    await chrome.runtime.sendMessage({ type: 'sites.sync' });
    $('status').textContent = `Enabled on ${host}. Reload the page.`;
  };
  try {
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    $('status').textContent = st?.ok ? `Running (${st.adapter}) · skin ${st.status?.state || 'off'}${st.status?.fps ? ` · ${st.status.fps} fps` : ''}` : '';
  } catch (_) { if (!onTv) $('status').textContent = 'Not running on this tab.'; }
})();
