// Site adapter for tradingview.com (web) and TradingView Desktop (same web app inside Electron).
// All selectors are best-effort observations of TradingView's DOM, which is undocumented and
// changes without notice. Every lookup has a fallback and failures degrade to "no signals".
import { parsePrice, parseTitle } from '../modules/skins/signals.js';

const q = (sel, root = document) => { try { return root.querySelector(sel); } catch (_) { return null; } };

let hoverTarget = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerover', (e) => { hoverTarget = e.target; }, true);
  document.addEventListener('pointerleave', () => { hoverTarget = null; }, true);
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) hoverTarget = null; }, true);
}
function pointerOverChart() {
  try { return !!(hoverTarget && hoverTarget.closest && hoverTarget.closest('.chart-markup-table')); } catch (_) { return false; }
}
const qa = (sel, root = document) => { try { return [...root.querySelectorAll(sel)]; } catch (_) { return []; } };

export const tradingview = {
  id: 'tradingview',
  name: 'TradingView',
  features: { templates: true },

  matches(loc = location) {
    return /(^|\.)tradingview\.com$/.test(loc.hostname) && /^\/chart(\/|$)/.test(loc.pathname);
  },

  // Element the skin layer is placed into (spans every chart in a multi-chart layout).
  layoutHost() {
    return q('.layout__area--center') || q('.chart-container')?.parentElement || null;
  },

  ready() { return !!q('.chart-markup-table canvas, .chart-container canvas'); },

  // Scope (for the MAIN-world clear) and elements that must have transparent CSS backgrounds.
  clearScope: '.chart-markup-table, .chart-container',
  axesSelector: '.price-axis, .time-axis, [class*="price-axis"], [class*="time-axis"]',
  transparentSelectors: [
    '.chart-container', '.chart-container-border', '.chart-widget', '.chart-markup-table',
    '.chart-markup-table td', '.chart-gui-wrapper', '.layout__area--center > div',
  ],

  // One observation of the main series: { symbol, open, high, low, close, price }.
  // While the crosshair is over the chart the legend shows the *hovered* historical bar, so OHLC is
  // skipped then and only the live price from the tab title is used.
  readObservation() {
    const obs = {};
    const legend = q('[data-name="legend-series-item"]') || q('[data-name="legend-source-item"]');
    if (legend && !pointerOverChart()) {
      for (const item of qa('[class*="valueItem"]', legend)) {
        const title = (q('[class*="valueTitle"]', item)?.textContent || '').trim().toUpperCase();
        const value = parsePrice(q('[class*="valueValue"]', item)?.textContent);
        if (!Number.isFinite(value)) continue;
        if (title === 'O') obs.open = value;
        else if (title === 'H') obs.high = value;
        else if (title === 'L') obs.low = value;
        else if (title === 'C') obs.close = value;
      }
      const sym = q('[data-name="legend-source-title"]', legend)?.textContent?.trim();
      if (sym) obs.symbol = sym;
    }
    const fromTitle = parseTitle(document.title);
    if (fromTitle) {
      obs.price = fromTitle.price;
      obs.symbol = obs.symbol || fromTitle.symbol;
    }
    return Object.keys(obs).length ? obs : null;
  },

  // Hide chrome for focus mode.
  focusHideSelectors: ['.layout__area--top', '.layout__area--left', '.layout__area--right', '.layout__area--bottom'],
};

// TradingView charts embedded in other platforms (Charting Library: TopstepX/ProjectX, brokers, prop firms).
// The library renders the same DOM structure as tradingview.com, usually inside a same-origin iframe,
// so the TradingView selectors apply; account features (templates) do not.
export const tradingviewEmbed = {
  ...tradingview,
  id: 'tradingview-embed',
  name: 'TradingView chart (embedded)',
  features: { templates: false },
  matches: () => !!q('.chart-markup-table, .chart-container'),
};

// Generic adapter: any canvas-based page, with the container chosen by a user selector.
export function genericAdapter(selector) {
  return {
    id: 'generic',
    name: 'Custom site',
    matches: () => true,
    layoutHost: () => q(selector) || document.body,
    ready: () => !!q(selector),
    clearScope: selector,
    axesSelector: null,
    transparentSelectors: [],
    features: { templates: false },
    readObservation: () => {
      const t = parseTitle(document.title);
      return t ? { price: t.price, symbol: t.symbol } : null;
    },
    focusHideSelectors: [],
  };
}

// customSites: [{ host, kind: 'tv-embed' | 'generic', selector? }]
export function pickAdapter(customSites = []) {
  if (tradingview.matches()) return tradingview;
  // about:blank / srcdoc frames (common for embedded charting libraries) have no host of their own: use their parent's.
  let host = location.hostname;
  if (!host) { try { host = window.parent.location.hostname; } catch (_) { host = ''; } }
  const site = customSites.find((s) => s.host === host);
  if (!site) return null;
  if (site.kind === 'generic' && site.selector) return genericAdapter(site.selector);
  return tradingviewEmbed;
}
