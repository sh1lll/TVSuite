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
  };
  renderSites();

  // Discord / Telegram (secrets live under their own key; only this page and the background read it).
  const SECRETS = 'share:secrets';
  const secrets = async () => (await chrome.storage.local.get(SECRETS))[SECRETS] || {};
  const putSecrets = async (patch) => chrome.storage.local.set({ [SECRETS]: { ...(await secrets()), ...patch } });
  (async () => { const sc = await secrets(); $('discordWebhook').value = sc.discord?.webhook || ''; $('tgToken').value = sc.telegram?.token || ''; $('tgChat').value = sc.telegram?.chatId || ''; })();
  const grant = (origins) => chrome.permissions.request({ origins });
  $('saveDiscord').onclick = async () => {
    const url = $('discordWebhook').value.trim();
    if (url && !/^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return status('shareStatus', 'That doesn’t look like a Discord webhook URL', 'err');
    if (url && !(await grant(['https://discord.com/*', 'https://discordapp.com/*']))) return status('shareStatus', 'Permission not granted', 'err');
    await putSecrets({ discord: { webhook: url } });
    const st = await loadSettings(); st.share.discord.enabled = !!url; await saveSettings(st);
    status('shareStatus', url ? 'Discord saved.' : 'Discord removed.', 'ok');
  };
  $('saveTelegram').onclick = async () => {
    const token = $('tgToken').value.trim(), chatId = $('tgChat').value.trim();
    if (token && !(await grant(['https://api.telegram.org/*']))) return status('shareStatus', 'Permission not granted', 'err');
    await putSecrets({ telegram: { token, chatId } });
    const st = await loadSettings(); st.share.telegram.enabled = !!(token && chatId); await saveSettings(st);
    status('shareStatus', token ? 'Telegram saved.' : 'Telegram removed.', 'ok');
  };
  $('findChat').onclick = async () => {
    const token = $('tgToken').value.trim();
    if (!/^\d+:[\w-]+$/.test(token)) return status('shareStatus', 'Enter the bot token first', 'err');
    if (!(await grant(['https://api.telegram.org/*']))) return status('shareStatus', 'Permission not granted', 'err');
    try {
      const r = await (await fetch(`https://api.telegram.org/bot${token}/getUpdates`)).json();
      const chats = [...new Map((r.result || []).map((u) => u.message?.chat || u.channel_post?.chat).filter(Boolean).map((c) => [c.id, c])).values()];
      if (!chats.length) return status('shareStatus', 'No messages yet — send your bot a message, then try again.', 'err');
      $('tgChat').value = String(chats[chats.length - 1].id);
      status('shareStatus', `Found: ${chats.map((c) => `${c.title || c.username || c.first_name} (${c.id})`).join(', ')}. Press Save.`, 'ok');
    } catch (err) { status('shareStatus', `Telegram: ${err.message}`, 'err'); }
  };
  const test = (target) => async () => {
    const r = await chrome.runtime.sendMessage({ type: 'share.send', payload: { kind: 'test', targets: [target], title: 'TVSuite test', text: 'If you can read this, TVSuite can post here.' } });
    const res = r?.results?.[target];
    status('shareStatus', res?.ok ? `Test sent to ${target}.` : `${target}: ${res?.error || r?.error}`, res?.ok ? 'ok' : 'err');
  };
  $('testDiscord').onclick = test('discord');
  $('testTelegram').onclick = test('telegram');

  // Room lighting devices (secrets: Hue username, HA token, Govee key — this page and the background only).
  const LKEY = 'lights:secrets';
  const FIELDS = {
    hue: [['bridge', 'Bridge address', 'https://192.168.1.20'], ['username', 'App key (press Pair)', ''], ['group', 'Room/zone id (or leave empty)', '1'], ['light', 'Light id (if no room)', '']],
    ha: [['base', 'Home Assistant URL', 'http://homeassistant.local:8123'], ['token', 'Long-lived access token', ''], ['entities', 'Light entities', 'light.desk, light.strip']],
    wled: [['base', 'WLED address', 'http://192.168.1.50']],
    govee: [['apiKey', 'Govee API key', ''], ['devices', 'Devices (sku/device, comma separated)', 'H6159/AB:CD:EF:12:34:56:78:90']],
  };
  const lights = async () => (await chrome.storage.local.get(LKEY))[LKEY] || { devices: [] };
  const fieldInputs = () => {
    const type = $('lightType').value;
    $('lightFields').replaceChildren(...FIELDS[type].map(([k, label, ph]) => {
      const l = document.createElement('label'); l.className = 'row'; l.append(label + ' ');
      const i = document.createElement('input'); i.id = `lf-${k}`; i.placeholder = ph; i.type = /token|apiKey/.test(k) ? 'password' : 'text'; i.autocomplete = 'off';
      l.append(i); return l;
    }));
    if (type === 'hue') {
      const b = document.createElement('button'); b.textContent = 'Pair with bridge'; b.type = 'button';
      b.onclick = async () => {
        const bridge = $('lf-bridge').value.trim().replace(/\/+$/, '');
        if (!/^https?:\/\//.test(bridge)) return status('lightStatus', 'Enter the bridge address, e.g. https://192.168.1.20', 'err');
        if (!(await chrome.permissions.request({ origins: [`${new URL(bridge).origin}/*`] }))) return status('lightStatus', 'Permission not granted', 'err');
        const r = await chrome.runtime.sendMessage({ type: 'lights.pairHue', bridge });
        if (r?.username) { $('lf-username').value = r.username; status('lightStatus', 'Paired. Press “Add device”.', 'ok'); } else status('lightStatus', r?.error || 'Pairing failed', 'err');
      };
      $('lightFields').append(b);
    }
  };
  $('lightType').onchange = fieldInputs;
  fieldInputs();
  const renderLights = async () => {
    const { devices } = await lights();
    $('lightDevices').replaceChildren(...devices.map((d) => {
      const row = document.createElement('div'); row.className = 'site';
      const label = document.createElement('span'); label.textContent = `${{ hue: 'Hue', ha: 'Home Assistant', wled: 'WLED', govee: 'Govee' }[d.type]} — ${d.bridge || d.base || d.devices || ''}`;
      const test = document.createElement('button'); test.textContent = 'Test';
      test.onclick = async () => { const r = await chrome.runtime.sendMessage({ type: 'lights.apply', test: true, state: { on: true, rgb: [91, 140, 255], bri: 0.8, flash: true } }); const mine = r?.results?.find((x) => x.id === d.id); status('lightStatus', mine?.ok ? 'Sent — your light should flash blue.' : `Failed: ${mine?.error || r?.error}`, mine?.ok ? 'ok' : 'err'); };
      const del = document.createElement('button'); del.textContent = 'Remove';
      del.onclick = async () => { const cur = await lights(); cur.devices = cur.devices.filter((x) => x.id !== d.id); await chrome.storage.local.set({ [LKEY]: cur }); renderLights(); };
      row.append(label, test, del); return row;
    }));
    if (!devices.length) $('lightDevices').textContent = 'No devices yet.';
  };
  $('addLight').onclick = async () => {
    const type = $('lightType').value;
    const dev = { id: `l${Date.now().toString(36)}`, type };
    for (const [k] of FIELDS[type]) dev[k] = $(`lf-${k}`).value.trim();
    const addr = dev.bridge || dev.base;
    if (type !== 'govee' && !/^https?:\/\/[^/]+/.test(addr || '')) return status('lightStatus', 'Enter the device address (http:// or https://)', 'err');
    if (type === 'hue' && !dev.username) return status('lightStatus', 'Press “Pair with bridge” first', 'err');
    if (type === 'ha' && (!dev.token || !dev.entities)) return status('lightStatus', 'Home Assistant needs a token and at least one light entity', 'err');
    if (type === 'govee' && (!dev.apiKey || !dev.devices)) return status('lightStatus', 'Govee needs an API key and device list', 'err');
    const origin = type === 'govee' ? 'https://openapi.api.govee.com' : new URL(addr).origin;
    if (!(await chrome.permissions.request({ origins: [`${origin}/*`] }))) return status('lightStatus', 'Permission not granted', 'err');
    const cur = await lights(); cur.devices.push(dev); await chrome.storage.local.set({ [LKEY]: cur });
    status('lightStatus', 'Added. Press Test. (Hue over https: if Test fails, open the bridge address in a tab once and accept its certificate.)', 'ok');
    renderLights();
  };
  renderLights();

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
  if (['#media', '#notify', '#share', '#lights', '#voice'].includes(location.hash)) document.getElementById(location.hash.slice(1)).scrollIntoView();

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
