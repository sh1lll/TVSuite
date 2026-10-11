// Linked tabs: each TVSuite tab publishes the symbol it shows, so a TradingView tab can jump to what
// TopstepX/your broker shows (and the other way round). Stored in extension storage only.
import { storage } from '../../core/storage.js';

const KEY = 'bridge:seen';
const MAX_AGE = 12 * 3600e3;

export function createSymbolLink({ getSymbol, getSettings, bus }) {
  let last = null, seen = {};
  const here = location.host;
  async function publish() {
    if (!getSettings().bridge.share) return;
    const symbol = getSymbol();
    if (!symbol || symbol === last) return;
    last = symbol;
    const cur = (await storage.get(KEY, {})) || {};
    const now = Date.now();
    for (const [h, v] of Object.entries(cur)) if (!v || now - v.at > MAX_AGE) delete cur[h];
    cur[here] = { symbol, at: now, url: location.origin + location.pathname };
    await storage.set(KEY, cur);
  }
  function others(all = seen) {
    return Object.entries(all || {}).filter(([h, v]) => h !== here && v && Date.now() - v.at < MAX_AGE)
      .map(([host, v]) => ({ host, ...v })).sort((a, b) => b.at - a.at);
  }
  storage.get(KEY, {}).then((v) => { seen = v || {}; bus.emit('bridge:seen', others()); });
  const unwatch = storage.watch(KEY, (v) => { seen = v || {}; bus.emit('bridge:seen', others()); });
  const timer = setInterval(() => { publish().catch(() => {}); }, 1500);
  return { others: () => others(), publish, stop: () => { clearInterval(timer); unwatch(); } };
}
