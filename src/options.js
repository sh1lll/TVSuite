// Options page: AI provider, custom sites, data export/import.
import { DEFAULT_AI } from './ai/providers.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { addMedia, listMedia, removeMedia, mediaSkin } from './core/media-store.js';

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
        const fresh = await loadSettings();
        fresh.sites = fresh.sites.filter((x) => x.host !== site.host);
        await saveSettings(fresh);
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

  // Desktop notifications: optional permission, requested only when switched on.
  const notifyState = async () => {
    const s = await loadSettings();
    const granted = await chrome.permissions.contains({ permissions: ['notifications'] });
    $('notifyOn').checked = !!s.sound.notify && granted;
  };
  $('notifyOn').onchange = async () => {
    const on = $('notifyOn').checked;
    if (on && !(await chrome.permissions.request({ permissions: ['notifications'] }))) { $('notifyOn').checked = false; return status('notifyStatus', 'Permission not granted', 'err'); }
    const s = await loadSettings();
    s.sound.notify = on;
    await saveSettings(s);
    status('notifyStatus', on ? 'On. Sound events also notify while the chart tab is hidden (Sound must be on).' : 'Off.', 'ok');
  };
  notifyState();
  };
  renderSites();

  async function renderMedia() {
    const items = await listMedia();
    const s = await loadSettings();
    $('mediaList').replaceChildren(...items.map((m) => {
      const row = document.createElement('div'); row.className = 'site';
      const label = document.createElement('span'); label.textContent = `${m.name} — ${m.type}, ${(m.size / 1048576).toFixed(1)} MB`;
      const inLib = s.skins.library.some((x) => x.id === `media-${m.id}`);
      const use = document.createElement('button'); use.textContent = 'Use as skin';
      use.onclick = async () => {
        const st = await loadSettings();
        const skin = mediaSkin(m);
        st.skins.library = [skin, ...st.skins.library.filter((x) => x.id !== skin.id)];
        st.skins.active = skin; st.skins.enabled = true;
        await saveSettings(st);
        status('mediaStatus', `"${m.name}" is now your skin on open TradingView tabs.`, 'ok');
        renderMedia();
      };
      const del = document.createElement('button'); del.textContent = 'Delete';
      del.onclick = async () => {
        await removeMedia(m.id);
        const st = await loadSettings();
        st.skins.library = st.skins.library.filter((x) => x.id !== `media-${m.id}`);
        if (st.skins.active?.id === `media-${m.id}`) st.skins.active = { kind: 'builtin', base: 'aurora', id: 'aurora', name: 'Aurora' };
        await saveSettings(st);
        renderMedia();
      };
      row.append(label, inLib ? Object.assign(document.createElement('span'), { textContent: 'in library', className: 'note' }) : '', use, del);
      return row;
    }));
    if (!items.length) $('mediaList').textContent = 'No media yet.';
  }
  $('mediaFile').onchange = async () => {
    for (const f of $('mediaFile').files) {
      try { await addMedia(f); status('mediaStatus', `Added ${f.name}.`, 'ok'); }
      catch (err) { status('mediaStatus', `${f.name}: ${err.message}`, 'err'); }
    }
    $('mediaFile').value = '';
    renderMedia();
  };
  renderMedia();
  if (['#media', '#notify'].includes(location.hash)) document.getElementById(location.hash.slice(1)).scrollIntoView();

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
