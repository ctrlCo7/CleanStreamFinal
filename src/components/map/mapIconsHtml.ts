// The map icons as HTML/SVG/CSS text, for the WebView (OpenFreeMap) maps. Same drawings as
// the React Native versions in MapIcons.tsx. No React Native imports, so it can be unit-tested.
import { MAP_COLORS } from './mapColors';

/**
 * A garbage truck seen from above, nose pointing up (north), so rotating it by the heading
 * makes it face the way it's driving: white cab with windshield, headlights and mirrors,
 * a shaded compactor body with a leaf badge, and the rear hopper. One drawing for every map
 * (the native maps render it with SvgXml). No apostrophes or backticks: the WebView pages
 * embed it inside JavaScript strings.
 */
export const truckSvg = (color: string = MAP_COLORS.truck, dark: string = MAP_COLORS.truckDark) =>
  `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="csTruckBody" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${dark}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/>
</linearGradient></defs>
<circle cx="24" cy="24" r="22.5" fill="${color}" fill-opacity="0.14"/>
<circle cx="24" cy="24" r="22.5" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="1.2"/>
<rect x="15.5" y="7" width="19" height="38" rx="5" fill="#000000" fill-opacity="0.16"/>
<rect x="12.6" y="11" width="3.2" height="6" rx="1.3" fill="#1F2937"/>
<rect x="32.2" y="11" width="3.2" height="6" rx="1.3" fill="#1F2937"/>
<rect x="12.6" y="28" width="3.2" height="6" rx="1.3" fill="#1F2937"/>
<rect x="32.2" y="28" width="3.2" height="6" rx="1.3" fill="#1F2937"/>
<rect x="12.6" y="35" width="3.2" height="6" rx="1.3" fill="#1F2937"/>
<rect x="32.2" y="35" width="3.2" height="6" rx="1.3" fill="#1F2937"/>
<rect x="16.5" y="40" width="15" height="4.5" rx="1.6" fill="#374151" stroke="#FFFFFF" stroke-width="1.2"/>
<rect x="15" y="17" width="18" height="25" rx="3.5" fill="url(#csTruckBody)" stroke="#FFFFFF" stroke-width="1.8"/>
<path d="M18.5 21.5h11M18.5 38h11" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="1.3" stroke-linecap="round"/>
<circle cx="24" cy="29.5" r="5.2" fill="#FFFFFF"/>
<path d="M21.2 32.2c0-3.9 2.6-6.1 5.9-6.2 0.1 3.7-2.2 6.2-5.9 6.2z" fill="${color}"/>
<path d="M21.2 32.2l3.3-3.3" stroke="#FFFFFF" stroke-width="0.9" stroke-linecap="round"/>
<rect x="12.8" y="9.2" width="2.6" height="3.4" rx="1" fill="${dark}"/>
<rect x="32.6" y="9.2" width="2.6" height="3.4" rx="1" fill="${dark}"/>
<rect x="15.5" y="4.5" width="17" height="14" rx="5" fill="#FFFFFF" stroke="${dark}" stroke-width="1.5"/>
<path d="M18 9c3.9-1.7 8.1-1.7 12 0v3.4c-3.9-1.1-8.1-1.1-12 0z" fill="#1E3A5F"/>
<rect x="19" y="14.3" width="10" height="2.2" rx="1.1" fill="${color}"/>
<circle cx="19.2" cy="5.9" r="1.2" fill="#FDE68A"/>
<circle cx="28.8" cy="5.9" r="1.2" fill="#FDE68A"/>
</svg>`;

export const TRUCK_SVG = truckSvg();

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
