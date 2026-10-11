// Capture tab: screenshot cards, the smart recorder, and Discord/Telegram sharing.
import { el, setChildren } from '../core/dom.js';
import { section, row, toggle, segmented, button, chip, toast, slider } from './kit.js';
import { CARD_THEMES } from '../modules/capture/card.js';
import { pickMime } from '../modules/capture/recorder.js';

const stop = (n) => { n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };

export function captureTab(app) {
  const { getSettings, update, root, bus } = app;
  const wrap = el('div');
  const body = el('div', { class: 'wide-labels' });
  let view = getSettings().ui.captureView || 'card';
  const nav = segmented({ value: view, cls: 'subnav', options: [['card', 'Card', 'image'], ['recorder', 'Recorder', 'record'], ['mini', 'Mini', 'pip'], ['share', 'Share', 'share']], onChange: (v) => { view = v; update((s) => { s.ui.captureView = v; }, { silent: true }); render(); } });

  // ---------------- Card ----------------
  let last = null;
  function card() {
    const c = getSettings().capture.card;
    const preview = el('div', { style: { borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--line2)', background: '#07080c', minHeight: '120px', display: 'grid', placeItems: 'center' }, dataset: { cardPreview: '1' } });
    const paint = () => {
      try {
        last = app.capture.makeCard();
        const img = el('img', { src: last.toDataURL('image/jpeg', 0.8), style: { display: 'block', width: '100%' }, alt: 'Card preview' });
        setChildren(preview, img);
        preview.dataset.w = String(last.width); preview.dataset.h = String(last.height);
      } catch (err) { setChildren(preview, el('div', { class: 'note' }, err.message)); }
    };
    const set = (fn) => { update((s) => fn(s.capture.card), { silent: true }); paint(); };
    const title = stop(el('input', { type: 'text', placeholder: 'Title (default: symbol)', value: c.title }));
    title.addEventListener('change', () => set((cc) => { cc.title = title.value.slice(0, 60); }));
    const mark = stop(el('input', { type: 'text', placeholder: '@yourhandle', value: c.watermark }));
    mark.addEventListener('change', () => set((cc) => { cc.watermark = mark.value.slice(0, 40); }));
    const themes = el('div', { class: 'btns', style: { flexWrap: 'wrap' } }, Object.entries(CARD_THEMES).map(([id, t]) => {
      const b = el('button', { type: 'button', class: `btn sm${c.theme === id ? ' primary' : ''}`, dataset: { theme: id }, style: { background: `linear-gradient(135deg, ${t.stops.join(', ')})`, color: t.text, border: c.theme === id ? '2px solid #fff' : '1px solid var(--line2)' } }, t.name);
      b.addEventListener('click', () => { set((cc) => { cc.theme = id; }); render(); });
      return b;
    }));
    const send = (target) => async () => {
      if (!last) return;
      if (!app.share) { toast(root, 'Sharing needs the browser extension', 'warn'); return; }
      try {
        const r = await app.share({ kind: 'cards', targets: [target], title: app.capture.cardInfo().title, image: last.toDataURL('image/png'), filename: 'chart.png' });
        const res = r.results[target];
        toast(root, res.ok ? `Sent to ${target}` : `${target}: ${res.error}`, res.ok ? 'ok' : 'err', 4000);
      } catch (err) { toast(root, err.message, 'err'); }
    };
    setTimeout(paint, 0);
    return [
      preview,
      el('div', { class: 'btns', style: { marginTop: '10px', flexWrap: 'wrap' } },
        button('Copy', async () => { if (!last) return; try { await app.capture.copyCanvas(last); toast(root, 'Card copied'); } catch (err) { toast(root, `Copy failed: ${err.message}`, 'err'); } }, 'primary', { icon: 'copy', dataset: { cardCopy: '1' } }),
        button('Download', () => { if (last) { const a = el('a', { href: last.toDataURL('image/png'), download: `tvsuite-${Date.now()}.png` }); document.body.append(a); a.click(); a.remove(); } }, '', { icon: 'download' }),
        button('Refresh', paint, '', { icon: 'refresh' }),
        button('Discord', send('discord'), 'sm', { dataset: { send: 'discord' } }), button('Telegram', send('telegram'), 'sm')),
      el('div', { class: 'note' }, `Alt+Shift+S copies a card from anywhere on the chart. The skin isn't included, just your chart, framed.`),
      section('Style', themes,
        row('Aspect', segmented({ value: c.aspect, options: [['auto', 'Fit'], ['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5']], onChange: (v) => set((cc) => { cc.aspect = v; }) })),
        row('Title', el('div', { class: 'grow' }, title)), row('Watermark', el('div', { class: 'grow' }, mark)),
        ...[['price', 'Price'], ['session', 'Session'], ['pnl', 'Day P&L (Risk Guard)'], ['time', 'Date & time'], ['brand', 'TVSuite mark']].map(([k, label]) => toggle({ label, checked: c.show[k], onChange: (v) => set((cc) => { cc.show[k] = v; }) }))),
    ];
  }

  // ---------------- Recorder ----------------
  let recList = null;
  function recorder() {
    const c = getSettings().capture.recorder;
    const set = (fn, again = false) => { update((s) => fn(s.capture.recorder), { silent: true }); if (again) render(); };
    const recording = app.recorder.recording();
    const mime = pickMime();
    if (!recList && app.recordings) app.recordings.list().then((l) => { recList = l; if (view === 'recorder' && wrap.isConnected) render(); });
    const status = el('span', { dataset: { recState: recording ? 'on' : 'off' } }, recording ? chip(`● REC ${Math.floor(app.recorder.elapsed())}s`, 'err') : chip('idle'));
    return [
      el('div', { class: 'hero', style: { padding: '14px', background: recording ? 'rgba(242,54,69,.14)' : 'var(--raise)', borderColor: recording ? 'rgba(242,54,69,.5)' : '' } },
        el('div', { class: 'row', style: { margin: 0 } },
          el('div', { class: 'grow' }, el('div', { style: { fontWeight: 700, fontSize: '14px' } }, 'Trade recorder'),
            el('div', { class: 'note', style: { margin: 0 } }, mime ? `Records the chart itself (no screen-share prompt) as ${mime.includes('mp4') ? 'MP4' : 'WebM'}` : 'This browser can’t record video')),
          status),
        el('div', { class: 'btns' }, button(recording ? 'Stop' : 'Record now', () => { app.capture.toggleRecording(); setTimeout(render, 200); }, recording ? 'danger' : 'primary', { icon: 'record', dataset: { recToggle: '1' } }),
          app.recordings ? button('Recordings', () => app.recordings.open(), '', { icon: 'film' }) : null)),
      section('Smart triggers',
        toggle({ label: 'Record my trades', hint: 'Starts on a trade entry (pop-up, Alt+Shift+E or open P&L ≠ 0), stops after you’re flat', checked: c.auto, onChange: (v) => set((x) => { x.auto = v; }, true) }),
        c.auto ? [
          toggle({ label: 'Stop after the exit', checked: c.stopOnExit, onChange: (v) => set((x) => { x.stopOnExit = v; }) }),
          slider({ label: 'Keep before entry', value: c.preRollSec, min: 0, max: 60, step: 5, fmt: (v) => (v ? `${v}s before` : 'off'), onInput: (v) => set((x) => { x.preRollSec = v; }) }),
          el('div', { class: 'note', dataset: { prerollState: app.recorder.armed() ? 'ready' : 'off' } }, c.mic ? 'Pre-roll is off while microphone narration is on.' : app.recorder.armed() ? `Pre-roll ready, keeping the last ${app.recorder.armed().preRollSec}s (${app.recorder.armed().mime.includes('mp4') ? 'MP4' : 'WebM'}).` : app.recorder.armError() ? `Pre-roll unavailable: ${app.recorder.armError()}` : c.preRollSec ? 'Pre-roll starts in a moment…' : 'Pre-roll off.'),
          slider({ label: 'Keep recording', value: c.postRollSec, min: 0, max: 120, step: 5, fmt: (v) => `${v}s after exit`, onInput: (v) => set((x) => { x.postRollSec = v; }) }),
          toggle({ label: 'Use open P&L from Risk Guard', hint: 'When it reads open P&L from the screen: ≠ 0 means in a trade', checked: c.useOpenPnl, onChange: (v) => set((x) => { x.useOpenPnl = v; }) }),
          toggle({ label: 'Also record TradingView alerts', checked: c.alsoOn.tvAlert, onChange: (v) => set((x) => { x.alsoOn.tvAlert = v; }) }),
          toggle({ label: 'Also record price-level alerts', checked: c.alsoOn.priceAlert, onChange: (v) => set((x) => { x.alsoOn.priceAlert = v; }) }),
        ] : null,
        slider({ label: 'Max length', value: c.maxMin, min: 1, max: 120, step: 1, fmt: (v) => `${v} min`, onInput: (v) => set((x) => { x.maxMin = v; }) }),
        el('div', { class: 'note' }, `Hotkey ${c.hotkey} starts/stops by hand.`)),
      section('Video',
        row('Frame rate', segmented({ value: String(c.fps), options: [['10', '10'], ['15', '15'], ['24', '24'], ['30', '30']], onChange: (v) => set((x) => { x.fps = +v; }) })),
        row('Quality', segmented({ value: c.quality, options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], onChange: (v) => set((x) => { x.quality = v; }) })),
        row('Height', segmented({ value: String(c.height), options: [['720', '720p'], ['1080', '1080p'], ['native', 'Native']], onChange: (v) => set((x) => { x.height = v === 'native' ? v : +v; }) })),
        ...[['symbol', 'Symbol & price'], ['timer', 'REC timer'], ['pnl', 'Day P&L'], ['events', 'Entry / exit / alert banners'], ['watermark', 'Watermark']].map(([k, label]) => toggle({ label, checked: c.overlays[k], onChange: (v) => set((x) => { x.overlays[k] = v; }) })),
        row('Watermark', el('div', { class: 'grow' }, (() => { const i = stop(el('input', { type: 'text', value: c.watermark, placeholder: '@yourhandle' })); i.addEventListener('change', () => set((x) => { x.watermark = i.value.slice(0, 40); })); return i; })())),
        toggle({ label: 'Narrate with my microphone', hint: 'Asks for microphone access the first time', checked: c.mic, onChange: (v) => set((x) => { x.mic = v; }) })),
      section('Saving',
        row('Save to', segmented({ value: c.save, options: [['library', 'TVSuite library'], ['download', 'Downloads'], ['both', 'Both']], onChange: (v) => set((x) => { x.save = v; }) })),
        slider({ label: 'Keep last', value: c.keep, min: 3, max: 100, step: 1, fmt: (v) => `${v} clips`, onInput: (v) => set((x) => { x.keep = v; }) })),
      recList?.length ? section(`Recent · ${recList.length}`, el('div', { class: 'list' }, recList.slice(0, 6).map((r) => el('div', { class: 'row', style: { padding: '0 10px' }, dataset: { recording: r.id } },
        el('span', { class: 'grow', style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
        el('span', { class: 'note', style: { margin: 0 } }, `${Math.round(r.duration || 0)}s · ${(r.size / 1048576).toFixed(1)} MB`),
        button('Open', () => app.recordings.open(r.id), 'sm'))))) : null,
    ];
  }

  // ---------------- Mini window (filled in by the PiP module) ----------------
  function mini() {
    const st = app.mini.state();
    const media = (getSettings().skins.library || []).filter((k) => k.kind === 'media');
    const sel = el('select', { class: 'grow' }, media.length ? media.map((m) => el('option', { value: m.url }, m.name)) : el('option', { value: '' }, 'No media yet, add some in Skins → Studio → Media'));
    const link = stop(el('input', { type: 'text', placeholder: 'YouTube, Twitch, or a link to an .mp4 / .gif', dataset: { playerLink: '1' } }));
    const guard = (fn) => () => fn().then(() => setTimeout(render, 300), (err) => toast(root, err.message, 'err', 4500));
    return [
      el('div', { class: 'note' }, st.pipSupported ? 'Mini windows float above every other app (Chrome Picture-in-Picture).' : 'This browser has no Picture-in-Picture for pages, so mini windows open as small pop-ups.'),
      section('Mini chart',
        el('div', { class: 'note' }, 'Keep an eye on the chart while you work elsewhere: live chart, price, a tick line, session countdown, day P&L vs your limit, record and mute buttons.'),
        el('div', { class: 'btns' }, button(st.chart ? 'Mini chart is open' : 'Open mini chart', guard(() => app.mini.openChart()), st.chart ? '' : 'primary', { icon: 'pip', dataset: { miniChart: '1' } })),
        el('div', { class: 'note' }, `Hotkey ${getSettings().capture.miniHotkey}.`)),
      section('Player',
        el('div', { class: 'note' }, 'Your own video, a stream or music video in a floating window while you trade.'),
        row('My media', sel, button('Play', guard(() => (sel.value ? app.mini.openPlayer({ kind: 'library', url: sel.value }) : Promise.reject(new Error('Add a video in Skins → Studio → Media first')))), 'sm')),
        el('div', { class: 'row' }, el('div', { class: 'grow' }, link), button('Play link', guard(() => app.mini.openPlayer({ kind: 'link', url: link.value })), 'sm primary', { dataset: { playLink: '1' } })),
        el('div', { class: 'note' }, 'YouTube and Twitch use their official embedded players.')),
    ];
  }

  // ---------------- Share ----------------
  function share() {
    const sh = getSettings().share;
    const kinds = [['cards', 'Screenshot cards (when you press Send / Alt+Shift+S)'], ['journal', 'Journal entries'], ['risk', 'Risk limit hits'], ['recordings', 'Trade recordings (Discord ≤ 10 MB, Telegram ≤ 50 MB)'], ['recap', 'Session / day recaps']];
    return [
      el('div', { class: 'note' }, 'Your Discord webhook and Telegram bot are set up in Options and stay in the extension’s background, never on the page.'),
      app.openOptions ? el('div', { class: 'btns' }, button('Set up Discord / Telegram', () => app.openOptions('share'), 'primary', { icon: 'share' })) : null,
      ['discord', 'telegram'].map((t) => section(t === 'discord' ? 'Discord' : 'Telegram',
        toggle({ label: `Send to ${t === 'discord' ? 'Discord' : 'Telegram'}`, checked: sh[t].enabled, onChange: (v) => { update((s) => { s.share[t].enabled = v; }, { silent: true }); render(); } }),
        sh[t].enabled ? kinds.map(([k, label]) => toggle({ label, checked: sh[t][k], onChange: (v) => update((s) => { s.share[t][k] = v; }, { silent: true }) })) : null)),
    ];
  }

  function render() {
    if (view !== 'recorder') recList = null;
    setChildren(body, view === 'card' ? card() : view === 'recorder' ? recorder() : view === 'mini' ? mini() : share());
    setChildren(wrap, nav, body);
  }
  const unsubs = [bus.on('recorder:armed', () => { if (view === 'recorder' && wrap.isConnected) render(); }), bus.on('mini:state', () => { if (view === 'mini' && wrap.isConnected) render(); }), bus.on('recorder:state', () => { if (view === 'recorder' && wrap.isConnected) render(); }), bus.on('recorder:saved', () => { recList = null; if (view === 'recorder' && wrap.isConnected) render(); })];
  const tick = setInterval(() => { if (view === 'recorder' && wrap.isConnected && app.recorder.recording()) render(); }, 1000);
  render();
  return { el: wrap, render, dispose: () => { unsubs.forEach((u) => u()); clearInterval(tick); } };
}
