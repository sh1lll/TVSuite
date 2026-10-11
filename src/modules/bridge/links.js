// "Open in…" destinations for an instrument. URLs use each site's public quote/chart path.
import { formatSymbol } from './symbols.js';

const enc = encodeURIComponent;
export function openLinks(c) {
  if (!c) return [];
  const tv = formatSymbol(c, 'tradingview');
  const out = [{ id: 'tradingview', label: 'TradingView', url: `https://www.tradingview.com/chart/?symbol=${enc(tv)}` }];
  const y = formatSymbol(c, 'yahoo');
  if (y) out.push({ id: 'yahoo', label: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${enc(y)}` });
  if (c.kind === 'stock') {
    out.push({ id: 'finviz', label: 'Finviz', url: `https://finviz.com/quote.ashx?t=${enc(c.ticker)}` });
    out.push({ id: 'stocktwits', label: 'StockTwits', url: `https://stocktwits.com/symbol/${enc(c.ticker)}` });
    out.push({ id: 'edgar', label: 'SEC filings', url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${enc(c.ticker)}&type=&dateb=&owner=include&count=40` });
  }
  if (c.kind === 'crypto') {
    out.push({ id: 'binance', label: 'Binance', url: `https://www.binance.com/en/trade/${enc(c.base)}_${enc(c.quote === 'USD' ? 'USDT' : c.quote)}` });
    out.push({ id: 'coinbase', label: 'Coinbase', url: `https://www.coinbase.com/advanced-trade/spot/${enc(formatSymbol(c, 'coinbase'))}` });
    out.push({ id: 'stocktwits', label: 'StockTwits', url: `https://stocktwits.com/symbol/${enc(`${c.base}.X`)}` });
  }
  if (c.kind === 'future') out.push({ id: 'cme', label: 'CME Group search', url: `https://www.cmegroup.com/search.html?q=${enc(c.root)}` });
  return out;
}
