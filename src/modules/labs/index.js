// Labs: experiments for running indicators on embedded charts (TradeSea, TopstepX) without TradingView.
//  1. Injected indicators: TVSuite's own indicators added to the platform's chart when it's created (page script).
//  2. Compute and draw: TVSuite reads the chart's bars, works levels out itself and draws them.
import { sessionLevels } from './sessions.js';

const IND_FLAG = 'tvsuite:labs:indicators'; // read by the page script when the platform creates its chart
const COLORS = { PDH: '#f23645', PDL: '#22ab94', ONH: '#ff9800', ONL: '#ff9800', RTHO: '#9598a1' };

export function createLabs(app) {
  const noAnswer = { ok: false, reason: 'No answer from the chart.' };

  // The flag lives in this site's own storage, which the page script can read synchronously at chart creation.
  const indicatorsOn = () => { try { return localStorage.getItem(IND_FLAG) === '1'; } catch (_) { return false; } };
  const setIndicators = (on) => { try { if (on) localStorage.setItem(IND_FLAG, '1'); else localStorage.removeItem(IND_FLAG); } catch (_) { /* storage blocked */ } };

  async function drawSessions() {
    const r = await app.queryMain(JSON.stringify({ cmd: 'chartBars' }), 6000);
    if (!r?.ok) return r || noAnswer;
    const { day, levels } = sessionLevels(r.bars);
    if (!levels.length) return { ok: false, reason: 'Not enough bars on the chart to work out session levels.' };
    const payload = levels.map((l) => ({ type: l.key, top: l.top, bottom: l.bottom, label: l.label, color: COLORS[l.key] || '#9598a1' }));
    const d = await app.queryMain(JSON.stringify({ cmd: 'levelsDraw', levels: payload, opts: { style: 'line', replace: true, bucket: 'demo' } }), 4000);
    if (!d?.ok) return d || noAnswer;
    return { ok: true, count: d.count, day, bars: r.bars.length, resolution: r.resolution, volume: r.volume, levels };
  }

  const clearSessions = async () => (await app.queryMain(JSON.stringify({ cmd: 'levelsClear', bucket: 'demo' }), 2000)) || noAnswer;

  return { indicatorsOn, setIndicators, drawSessions, clearSessions };
}
