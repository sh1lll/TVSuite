// Single-file bundle for TradingView Desktop (injected over CDP by desktop/launcher.mjs) and for
// userscript managers / the devtools console. Runs entirely in the page's main world.
import './inject-host.js';
import './main-world.js';
import { startTVSuite } from './app.js';

const boot = () => startTVSuite({ ai: null }).catch((err) => console.error('[TVSuite] failed to start', err));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
