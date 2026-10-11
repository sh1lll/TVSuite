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
  $('fab').checked = s.ui.fab !== false;

  $('enabled').onchange = () => save((f) => { f.skins.enabled = $('enabled').checked; });
  $('skin').onchange = () => { const rec = options.find((o) => o.value === $('skin').value).rec; $('enabled').checked = true; save((f) => { f.skins.active = rec; f.skins.enabled = true; }); };
  $('mode').onchange = () => save((f) => { f.skins.mode = $('mode').value; });
  $('opacity').oninput = () => save((f) => { f.skins.opacity = +$('opacity').value; });
  $('reactive').onchange = () => save((f) => { f.skins.reactive.enabled = $('reactive').checked; });
  $('sessionThemes').onchange = () => save((f) => { f.skins.sessionThemes = $('sessionThemes').checked; });
  $('fab').onchange = () => save((f) => { f.ui.fab = $('fab').checked; });
  $('settings').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  $('options').onclick = () => chrome.runtime.openOptionsPage();
  $('journal').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('journal.html') });

  const tab = await activeTab();
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) { /* chrome:// pages */ }
  const onTv = /(^|\.)tradingview\.com$/.test(host);
  $('panel').onclick = async () => { try { await chrome.tabs.sendMessage(tab.id, { type: 'panel.toggle' }); window.close(); } catch (_) { $('status').textContent = 'TVSuite is not running on this tab. Open a TradingView chart (or use "Turn on here").'; } };
  const isHttps = /^https:/.test(tab?.url || '');
  $('here').hidden = onTv || !isHttps;
  $('here').onclick = async () => {
    // The chart is often inside an iframe on the platform's own domain; ask for those hosts in the same prompt.
    const hosts = new Set([host]);
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => [...document.querySelectorAll('iframe')].map((f) => { try { const u = new URL(f.src, location.href); return u.protocol === 'https:' ? u.hostname : ''; } catch (_) { return ''; } }).filter(Boolean) });
      const root = host.split('.').slice(-2).join('.');
      for (const h of r?.result || []) if (h === root || h.endsWith(`.${root}`)) hosts.add(h);
    } catch (_) { /* top frame only */ }
    const granted = await chrome.permissions.request({ origins: [...hosts].map((h) => `https://${h}/*`) });
    if (!granted) { $('status').textContent = 'Permission not granted.'; return; }
    await save((f) => { for (const h of hosts) if (!f.sites.some((x) => x.host === h)) f.sites.push({ host: h, kind: 'tv-embed' }); });
    await chrome.runtime.sendMessage({ type: 'sites.sync' });
    $('status').textContent = `Enabled on ${[...hosts].join(', ')}. Reloading…`;
    setTimeout(() => { chrome.tabs.reload(tab.id); window.close(); }, 600);
  };
  try {
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    $('status').textContent = st?.ok ? `Running (${st.adapter}) · skin ${st.status?.state || 'off'}${st.status?.fps ? ` · ${st.status.fps} fps` : ''}` : '';
  } catch (_) { if (!onTv) $('status').textContent = 'Not running on this tab.'; }
})();
