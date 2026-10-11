// Options page: AI provider, custom sites, data export/import.
import { DEFAULT_AI } from './ai/providers.js';
import { loadSettings, saveSettings } from './core/settings.js';

const $ = (id) => document.getElementById(id);
const status = (id, text, kind = '') => { $(id).textContent = text; $(id).className = `note ${kind}`; };

async function loadAi() { const { ai } = await chrome.storage.local.get('ai'); return { ...DEFAULT_AI, ...(ai || {}) }; }

(async () => {
  const ai = await loadAi();
  $('provider').value = ai.provider; $('model').value = ai.model; $('baseUrl').value = ai.baseUrl; $('apiKey').value = ai.apiKey;
  const syncProvider = () => { $('baseUrlRow').style.display = $('provider').value === 'openai-compatible' ? '' : 'none'; };
  $('provider').onchange = () => {
    if ($('provider').value === 'anthropic' && !/^claude-/.test($('model').value)) $('model').value = DEFAULT_AI.model;
    syncProvider();
  };
  syncProvider();

  $('saveAi').onclick = async () => {
    const cfg = { provider: $('provider').value, model: $('model').value.trim() || DEFAULT_AI.model, baseUrl: $('baseUrl').value.trim() || DEFAULT_AI.baseUrl, apiKey: $('apiKey').value.trim() };
    if (cfg.provider === 'openai-compatible') {
      const origin = new URL(cfg.baseUrl).origin + '/*';
      const ok = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
      if (!ok) return status('aiStatus', `Access to ${origin} is needed to call that provider.`, 'err');
    }
    await chrome.storage.local.set({ ai: cfg });
    status('aiStatus', 'Saved.', 'ok');
  };
  $('testAi').onclick = async () => {
    status('aiStatus', 'Generating…');
    const res = await chrome.runtime.sendMessage({ type: 'ai.generate', prompt: 'calm ocean at night' });
    if (res?.error) status('aiStatus', res.error, 'err');
    else status('aiStatus', `OK — got "${res.skin.name}" (${res.skin.code.length} chars of code).`, 'ok');
  };

  async function renderSites() {
    const s = await loadSettings();
    $('sites').replaceChildren(...s.sites.map((site, i) => {
      const row = document.createElement('div'); row.className = 'site';
      const label = document.createElement('span'); label.textContent = `${site.host} — ${site.kind === 'generic' ? `generic (${site.selector})` : 'TradingView embed'}`;
      const del = document.createElement('button'); del.textContent = 'Remove';
      del.onclick = async () => {
        s.sites.splice(i, 1); await saveSettings(s);
        await chrome.permissions.remove({ origins: [`https://${site.host}/*`] }).catch(() => {});
        await chrome.runtime.sendMessage({ type: 'sites.sync' }); renderSites();
      };
      row.append(label, del); return row;
    }));
  }
  $('addSite').onclick = async () => {
    const host = $('siteHost').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return status('siteStatus', 'Enter a host name like topstepx.com', 'err');
    const kind = $('siteKind').value, selector = $('siteSelector').value.trim();
    if (kind === 'generic' && !selector) return status('siteStatus', 'Generic sites need a CSS selector for the chart container', 'err');
    const ok = await chrome.permissions.request({ origins: [`https://${host}/*`] });
    if (!ok) return status('siteStatus', 'Permission not granted', 'err');
    const s = await loadSettings();
    s.sites = s.sites.filter((x) => x.host !== host).concat([{ host, kind, ...(kind === 'generic' ? { selector } : {}) }]);
    await saveSettings(s);
    await chrome.runtime.sendMessage({ type: 'sites.sync' });
    status('siteStatus', `Added ${host}. Reload that site's tab.`, 'ok');
    renderSites();
  };
  renderSites();

  $('exportAll').onclick = async () => {
    const all = await chrome.storage.local.get(null);
    delete all.ai;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' }));
    a.download = 'tvsuite-data.json'; a.click();
  };
  $('importAll').onclick = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      try { const data = JSON.parse(await input.files[0].text()); delete data.ai; await chrome.storage.local.set(data); alert('Imported. Reload TradingView tabs.'); }
      catch (err) { alert(`Import failed: ${err.message}`); }
    };
    input.click();
  };
})();
