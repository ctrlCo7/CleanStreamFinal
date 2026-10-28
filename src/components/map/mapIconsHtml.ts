// The map icons as HTML/SVG/CSS text, for the WebView (OpenFreeMap) maps. Same drawings as
// the React Native versions in MapIcons.tsx. No React Native imports, so it can be unit-tested.
import { MAP_COLORS } from './mapColors';

export const TRUCK_SVG = `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
<circle cx="22" cy="22" r="20" fill="${MAP_COLORS.truck}" opacity="0.18"/>
<rect x="14" y="6" width="16" height="11" rx="4" fill="${MAP_COLORS.truck}" stroke="#fff" stroke-width="2"/>
<rect x="16.5" y="8" width="11" height="4" rx="1.5" fill="#bdf0dd"/>
<rect x="13" y="16" width="18" height="22" rx="3" fill="#1D9E75" stroke="#fff" stroke-width="2"/>
<path d="M17 21h10M17 26h10M17 31h10" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/** The same pin as HTML/CSS for the OpenStreetMap map (anchor: bottom centre). */
export const teardropPinHtml = (color: string, glow = false, icon = '') =>
  `<div class="cs-drop-wrap">${glow ? `<div class="cs-drop-glow" style="background:${color}"></div>` : ''}`
  + `<div class="cs-drop" style="background:${color}"><div class="cs-drop-inner">${icon}</div></div></div>`;

export const TEARDROP_CSS = `
  .cs-drop-wrap { position: relative; width: 34px; height: 42px; }
  .cs-drop-glow { position: absolute; left: -5px; top: -5px; width: 44px; height: 44px; border-radius: 22px; opacity: 0.22; }
  .cs-drop { position: absolute; left: 3px; top: 2px; width: 28px; height: 28px; border-radius: 14px 14px 14px 0;
    transform: rotate(-45deg); border: 2.5px solid #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.3); box-sizing: border-box;
    display: flex; align-items: center; justify-content: center; }
  .cs-drop-inner { transform: rotate(45deg); width: 10px; height: 10px; border-radius: 5px; background: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 11px; line-height: 1; }
  .cs-drop-inner:not(:empty) { width: 16px; height: 16px; border-radius: 8px; background: transparent; }
`;
