// Focus mode: hide TradingView's surrounding chrome so only the chart remains.
const STYLE_ID = 'tvsuite-focus-css';

export function createFocus(adapter, bus) {
  let on = false;
  function set(v) {
    on = !!v;
    let style = document.getElementById(STYLE_ID);
    if (on) {
      if (!style) { style = document.createElement('style'); style.id = STYLE_ID; document.head.append(style); }
      style.textContent = `${adapter.focusHideSelectors.join(',\n')} { display: none !important; }`;
    } else style?.remove();
    // TradingView recalculates its layout on resize.
    window.dispatchEvent(new Event('resize'));
    bus.emit('focus:change', on);
  }
  return { set, toggle: () => set(!on), active: () => on };
}
