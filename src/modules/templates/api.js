// Client for the TradingView web endpoints that store drawing templates and chart themes.
// These are private, undocumented endpoints used by TradingView's own UI; they were taken from the
// working public scripts victornpb/tradingview-backup and vngbh/tradingview-template-manager and may change.
// Requests run with the signed-in user's own session, from the TradingView page itself.

export const TOOL_TYPES = [
  'LineToolTrendLine', 'LineToolRay', 'LineToolInfoLine', 'LineToolExtended', 'LineToolTrendAngle',
  'LineToolHorzLine', 'LineToolHorzRay', 'LineToolVertLine', 'LineToolCrossLine',
  'LineToolFibRetracement', 'LineToolTrendBasedFibExtension', 'LineToolFibChannel', 'LineToolFibTimeZone',
  'LineToolFibSpeedResistanceFan', 'LineToolTrendBasedFibTime', 'LineToolFibCircles', 'LineToolFibSpiral',
  'LineToolFibSpeedResistanceArcs', 'LineToolFibWedge', 'LineToolPitchfan',
  'LineToolGannSquare', 'LineToolGannFixed', 'LineToolGannComplex', 'LineToolGannFan',
  'LineToolRiskRewardLong', 'LineToolRiskRewardShort',
  'LineToolBrush', 'LineToolHighlighter',
  'LineToolArrowMarker', 'LineToolArrow', 'LineToolArrowMarkUp', 'LineToolArrowMarkDown',
  'LineToolRectangle', 'LineToolRotatedRectangle', 'LineToolPath', 'LineToolCircle',
  'LineToolEllipse', 'LineToolPolyline', 'LineToolTriangle', 'LineToolArc',
  'LineToolBezierQuadro', 'LineToolBezierCubic',
  'LineToolText', 'LineToolTextAbsolute', 'LineToolTextNote', 'LineToolPriceNote', 'LineToolNote',
  'LineToolTable', 'LineToolCallout', 'LineToolComment', 'LineToolPriceLabel', 'LineToolSignpost',
];

export const toolLabel = (tool) => (tool === 'THEMES' ? 'Themes' : tool.replace(/^LineTool/, '').replace(/([a-z])([A-Z])/g, '$1 $2'));

export class TvApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function readCsrf(cookie = (typeof document !== 'undefined' ? document.cookie : '')) {
  const hit = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('csrftoken='));
  return hit ? decodeURIComponent(hit.slice('csrftoken='.length)) : '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run `fn` over items with at most `limit` in flight.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function createTvApi({ origin, fetchImpl = (...a) => fetch(...a), csrf = readCsrf, retries = 2 } = {}) {
  const base = origin || (typeof location !== 'undefined' && /(^|\.)tradingview\.com$/.test(location.hostname) ? location.origin : 'https://www.tradingview.com');

  async function request(path, init = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(base + path, { credentials: 'include', ...init });
        if (res.status === 429 || res.status >= 500) throw new TvApiError(`HTTP ${res.status}`, res.status);
        if (res.status === 401 || res.status === 403) throw new TvApiError('Not signed in to TradingView (or session expired)', res.status);
        if (!res.ok) throw new TvApiError(`HTTP ${res.status} for ${path}`, res.status);
        return res;
      } catch (err) {
        lastErr = err;
        if (err instanceof TvApiError && err.status && err.status < 429) throw err; // not retryable
        if (attempt < retries) await sleep(300 * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  async function getJson(path) {
    const res = await request(path);
    try { return await res.json(); } catch (_) { throw new TvApiError(`Unexpected (non-JSON) response for ${path}`); }
  }

  async function post(path, fields) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    await request(path, { method: 'POST', headers: { 'X-CSRFToken': csrf() }, body: fd });
  }

  const parseContent = (data, what) => {
    if (!data || typeof data.content !== 'string') throw new TvApiError(`Malformed ${what}`);
    return JSON.parse(data.content);
  };

  const api = {
    base,
    listThemes: () => getJson('/themes/'),
    getTheme: async (name) => parseContent(await getJson(`/theme/?themeName=${encodeURIComponent(name)}`), `theme "${name}"`),
    saveTheme: (name, content) => post('/save-theme/', { name, content: JSON.stringify(content) }),
    removeTheme: (name) => post('/remove-theme/', { name }),
    listTemplates: (tool) => getJson(`/drawing-templates/${tool}/`),
    getTemplate: async (tool, name) => parseContent(await getJson(`/drawing-template/${tool}/?templateName=${encodeURIComponent(name)}`), `${tool} template "${name}"`),
    saveTemplate: (tool, name, content) => post('/save-drawing-template/', { name, tool, content: JSON.stringify(content) }),
    removeTemplate: (tool, name) => post('/remove-drawing-template/', { name, tool }),

    // Fetch everything. Returns { THEMES, TOOLS, errors: [{ tool, name?, message }] }.
    async fetchAll({ tools = TOOL_TYPES, concurrency = 4, onProgress } = {}) {
      const data = { THEMES: {}, TOOLS: {} };
      const errors = [];
      let done = 0;
      const total = tools.length + 1;
      const tick = (label) => onProgress?.({ done: ++done, total, label });

      try {
        const names = await api.listThemes();
        await mapLimit(names, concurrency, async (name) => {
          try { data.THEMES[name] = await api.getTheme(name); } catch (err) { errors.push({ tool: 'THEMES', name, message: err.message }); }
        });
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw err;
        errors.push({ tool: 'THEMES', message: err.message });
      }
      tick('Themes');

      await mapLimit(tools, concurrency, async (tool) => {
        try {
          const names = await api.listTemplates(tool);
          if (!Array.isArray(names)) throw new TvApiError('Unexpected template list');
          if (names.length) data.TOOLS[tool] = {};
          for (const name of names) {
            try { data.TOOLS[tool][name] = await api.getTemplate(tool, name); }
            catch (err) { errors.push({ tool, name, message: err.message }); }
          }
        } catch (err) {
          if (err.status === 401 || err.status === 403) throw err;
          errors.push({ tool, message: err.message });
        }
        tick(toolLabel(tool));
      });
      return { ...data, errors };
    },
  };
  return api;
}
