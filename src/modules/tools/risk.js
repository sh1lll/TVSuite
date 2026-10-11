// Position-size calculator. Pure logic.
// market: 'stock' (shares), 'forex' (lots; lotSize units per lot, pipSize per pip), 'futures' (contracts; pointValue $ per 1.0 move), 'crypto' (units)
// Floor with a tolerance so 0.49999999 (float noise from price subtraction) becomes 0.5, not 0.49.
const floorTo = (x, step) => Math.floor(x / step + 1e-7) * step;

export function positionSize({ account, riskPct, entry, stop, market = 'stock', pointValue = 1, lotSize = 100000, pipSize = 0.0001, quoteToAccount = 1 }) {
  const riskAmount = (account * riskPct) / 100;
  const dist = Math.abs(entry - stop);
  if (!(account > 0) || !(riskPct > 0) || !(dist > 0)) return { ok: false, reason: 'Enter account, risk %, and different entry/stop prices', riskAmount: riskAmount || 0 };
  const side = entry > stop ? 'long' : 'short';
  let units, unitLabel, perUnitRisk, rounded, actualRisk, notional;
  switch (market) {
    case 'futures':
      perUnitRisk = dist * pointValue;
      units = riskAmount / perUnitRisk;
      rounded = floorTo(units, 1);
      unitLabel = 'contracts';
      actualRisk = rounded * perUnitRisk;
      notional = rounded * entry * pointValue;
      break;
    case 'forex': {
      perUnitRisk = dist * lotSize * quoteToAccount;   // risk per 1.00 lot in account currency
      units = riskAmount / perUnitRisk;
      rounded = +floorTo(units, 0.01).toFixed(2);     // brokers usually allow 0.01 lots
      unitLabel = 'lots';
      actualRisk = rounded * perUnitRisk;
      notional = rounded * lotSize * entry * quoteToAccount;
      break;
    }
    case 'crypto':
      perUnitRisk = dist;
      units = riskAmount / perUnitRisk;
      rounded = +floorTo(units, 1e-6).toFixed(6);
      unitLabel = 'units';
      actualRisk = rounded * perUnitRisk;
      notional = rounded * entry;
      break;
    default:
      perUnitRisk = dist;
      units = riskAmount / perUnitRisk;
      rounded = floorTo(units, 1);
      unitLabel = 'shares';
      actualRisk = rounded * perUnitRisk;
      notional = rounded * entry;
  }
  const pips = market === 'forex' ? dist / pipSize : null;
  return {
    ok: true, side, riskAmount, distance: dist, pips, units, size: rounded, unitLabel, actualRisk, notional,
    leverage: account > 0 ? notional / account : 0,
    targets: [1, 2, 3].map((r) => ({ r, price: side === 'long' ? entry + dist * r : entry - dist * r })),
  };
}
