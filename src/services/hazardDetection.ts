/**
 * Hazardous-waste evidence from a photo, with no ML model involved:
 *  1. Warning symbols -- the red-bordered diamond used on chemical hazard labels
 *     (GHS pictograms: flame, skull, corrosion, ...), found by colour + shape.
 *  2. Label text -- words such as POISON / FLAMMABLE / PESTICIDE read by OCR.
 * Platform-free (no React Native imports) so it can be unit-tested in Node.
 */

export type HazardKind =
  | 'toxic' | 'flammable' | 'corrosive' | 'pesticide' | 'medical'
  | 'aerosol' | 'chemical' | 'biohazard' | 'radioactive' | 'battery';

export interface PictogramHit {
  x: number; y: number; width: number; height: number;
  /** 0..1, share of the diamond-shape checks that passed. */
  score: number;
}

// ─── 1. Warning-symbol (red diamond) detection ────────────────────────────────

const MAX_SIDE = 320;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

/**
 * Finds hollow red diamonds (a square rotated 45 degrees with a red border and a
 * light interior) in an RGB image. `rgb` is tightly packed R,G,B per pixel.
 */
export function detectHazardPictograms(
  rgb: ArrayLike<number>,
  width: number,
  height: number,
): PictogramHit[] {
  // Downsample so the connected-component pass stays cheap on a phone.
  const step = Math.max(1, Math.ceil(Math.max(width, height) / MAX_SIDE));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  if (w < 24 || h < 24) return [];

  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y * step) * width + x * step) * 3;
      const [hue, sat, val] = rgbToHsv(rgb[i], rgb[i + 1], rgb[i + 2]);
      // The red used on GHS borders: strongly saturated, reasonably bright.
      if ((hue <= 14 || hue >= 346) && sat >= 0.55 && val >= 0.4) mask[y * w + x] = 1;
    }
  }

  const label = new Int32Array(w * h);
  const hits: PictogramHit[] = [];
  const stack: number[] = [];
  let next = 1;

  const redNear = (cx: number, cy: number, r: number, minX: number, minY: number, maxX: number, maxY: number): boolean => {
    for (let y = Math.max(minY, cy - r); y <= Math.min(maxY, cy + r); y++) {
      for (let x = Math.max(minX, cx - r); x <= Math.min(maxX, cx + r); x++) {
        if (mask[y * w + x]) return true;
      }
    }
    return false;
  };

  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start]) continue;
    // Flood-fill one connected red region.
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    stack.push(start);
    label[start] = next;
    while (stack.length) {
      const p = stack.pop() as number;
      const px = p % w;
      const py = (p - px) / w;
      count++;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !label[q]) { label[q] = next; stack.push(q); }
        }
      }
    }
    next++;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw < 14 || bh < 14 || bw > w * 0.99 || bh > h * 0.99) continue;
    const aspect = bw / bh;
    if (aspect < 0.75 || aspect > 1.33) continue;
    const fill = count / (bw * bh);
    if (fill < 0.05 || fill > 0.4) continue;

    // A hollow diamond: red on the midpoints of its four edges, empty at the bounding
    // box corners and in the middle. (A circle or an axis-aligned box fails this.)
    const tol = Math.max(2, Math.round(Math.min(bw, bh) * 0.07));
    const at = (fx: number, fy: number) => ({ x: Math.round(minX + fx * (bw - 1)), y: Math.round(minY + fy * (bh - 1)) });
    const edgePts = [at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
    const cornerPts = [at(0.06, 0.06), at(0.94, 0.06), at(0.06, 0.94), at(0.94, 0.94)];
    const edgeHits = edgePts.filter((p) => redNear(p.x, p.y, tol, minX, minY, maxX, maxY)).length;
    const cornerHits = cornerPts.filter((p) => redNear(p.x, p.y, tol, minX, minY, maxX, maxY)).length;
    const mid = at(0.5, 0.5);
    const centerRed = redNear(mid.x, mid.y, Math.max(1, Math.round(tol * 0.5)), minX, minY, maxX, maxY);
    // Also require the four apexes (top/bottom/left/right) to be red.
    const apexPts = [at(0.5, 0.04), at(0.5, 0.96), at(0.04, 0.5), at(0.96, 0.5)];
    const apexHits = apexPts.filter((p) => redNear(p.x, p.y, tol, minX, minY, maxX, maxY)).length;

    // The inside of a real label is white right next to the border (the black symbol
    // sits in the middle), which rules out solid red objects like fruit or paint.
    const innerPts = [at(0.5, 0.2), at(0.5, 0.8), at(0.2, 0.5), at(0.8, 0.5)];
    const innerLight = innerPts.filter((p) => {
      const i = ((p.y * step) * width + p.x * step) * 3;
      const [, sat, val] = rgbToHsv(rgb[i], rgb[i + 1], rgb[i + 2]);
      return val >= 0.7 && sat <= 0.3;
    }).length;

    const score = (edgeHits + apexHits + (4 - cornerHits) + innerLight) / 16;
    if (edgeHits >= 3 && apexHits >= 3 && cornerHits <= 1 && !centerRed && innerLight >= 2 && score >= 0.85) {
      hits.push({
        x: minX * step, y: minY * step, width: bw * step, height: bh * step,
        score: Math.round(score * 100) / 100,
      });
    }
  }
  return hits;
}

// ─── 2. Label-text keywords ───────────────────────────────────────────────────

export interface TextHazard { kinds: HazardKind[]; strong: string[]; weak: string[]; confidence: number }

// Strong terms are specific to hazardous products; weak ones appear on harmless labels
// too, so they only count in pairs. English plus common Filipino label words.
const STRONG_TERMS: Array<[RegExp, HazardKind]> = [
  [/\bPOISON(S|OUS)?\b|\bTOXIC\b|\bLASON\b|\bNAKAKALASON\b|FATAL IF (SWALLOWED|INHALED)|HARMFUL IF (SWALLOWED|INHALED)|\bDO NOT (INGEST|DRINK)\b|\bKEEP OUT OF REACH\b/, 'toxic'],
  [/\bFLAMMABLE\b|\bINFLAMMABLE\b|\bCOMBUSTIBLE\b|\bKEEP (AWAY )?FROM (FIRE|FLAME|HEAT)\b|\bKEROSENE\b|\bGASOLINE\b|\bPETROL\b|\bTHINNER\b|\bSOLVENT\b|\bNASUSUNOG\b/, 'flammable'],
  [/\bCORROSIVE\b|\bCAUSTIC\b|\bMURIATIC\b|\bHYDROCHLORIC\b|\bSULFURIC\b|\bSULPHURIC\b|\bNITRIC\b|\bCAUSES (SEVERE )?(SKIN )?BURNS\b|\bDRAIN CLEANER\b|\bBLEACH\b|\bSODIUM HYPOCHLORITE\b|\bLYE\b/, 'corrosive'],
  [/\bPESTICIDES?\b|\bINSECTICIDES?\b|\bHERBICIDES?\b|\bFUNGICIDES?\b|\bRODENTICIDES?\b|\bWEEDKILLERS?\b|\bWEED KILLER\b|\bPANGPATAY\b|\bINSEKTO\b|\bRAT POISON\b|\bPESTISIDYO\b/, 'pesticide'],
  [/\bBIOHAZARD\b|\bBIOLOGICAL HAZARD\b|\bINFECTIOUS\b|\bSHARPS\b|\bCLINICAL WASTE\b|\bMEDICAL WASTE\b/, 'biohazard'],
  [/\bRADIOACTIVE\b|\bRADIATION\b/, 'radioactive'],
  [/\bAEROSOL\b|\bPRESSURI[SZ]ED\b|\bEXTREMELY FLAMMABLE\b|\bCONTENTS UNDER PRESSURE\b|\bDO NOT (PUNCTURE|INCINERATE)\b/, 'aerosol'],
  [/\bLITHIUM\b|\bLI-?ION\b|\bNI-?MH\b|\bNI-?CD\b|\bLEAD[- ]ACID\b|\bBATTERY ACID\b|\bBATTERIES\b/, 'battery'],
  [/\bRX ONLY\b|\bPRESCRIPTION\b/, 'medical'],
];

const WEAK_TERMS = /\bDANGER\b|\bWARNING\b|\bCAUTION\b|\bHAZARD(OUS)?\b|\bPELIGRO\b|\bINGAT\b|\bDELIKADO\b|\bIRRITANT\b|\bHARMFUL\b|\bCHEMICAL\b|\bACID\b/g;

// OCR on curved or stylized labels often drops or swaps a letter ("FLAMMABIE"). Long,
// distinctive words are matched allowing one such slip (two for very long words); short
// words are not fuzzed because they collide with ordinary ones (TOXIC/TONIC).
const FUZZY_WORDS: Array<[string, HazardKind]> = [
  ['FLAMMABLE', 'flammable'], ['INFLAMMABLE', 'flammable'], ['CORROSIVE', 'corrosive'],
  ['PESTICIDE', 'pesticide'], ['INSECTICIDE', 'pesticide'], ['HERBICIDE', 'pesticide'],
  ['FUNGICIDE', 'pesticide'], ['RODENTICIDE', 'pesticide'], ['BIOHAZARD', 'biohazard'],
  ['RADIOACTIVE', 'radioactive'], ['HYDROCHLORIC', 'corrosive'], ['POISONOUS', 'toxic'],
  ['NAKAKALASON', 'toxic'], ['EXPLOSIVE', 'chemical'],
];

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Reads OCR text for hazard-label vocabulary. */
export function detectHazardText(rawText: string): TextHazard | null {
  const text = rawText.toUpperCase().replace(/\s+/g, ' ');
  if (!text.trim()) return null;

  const kinds = new Set<HazardKind>();
  const strong: string[] = [];
  for (const [re, kind] of STRONG_TERMS) {
    const m = text.match(re);
    if (m) { kinds.add(kind); strong.push(m[0].trim()); }
  }
  for (const token of text.split(/[^A-Z]+/)) {
    if (token.length < 8) continue;
    for (const [word, kind] of FUZZY_WORDS) {
      if (!kinds.has(kind) && editDistance(token, word, 2) <= (word.length >= 11 ? 2 : 1)) {
        kinds.add(kind);
        strong.push(word);
      }
    }
  }
  const weak = Array.from(new Set(text.match(WEAK_TERMS) ?? []));

  if (strong.length === 0 && weak.length < 2) return null;
  if (strong.length === 0) kinds.add('chemical');
  const confidence = Math.min(95, strong.length ? 70 + strong.length * 10 : 50 + weak.length * 5);
  return { kinds: Array.from(kinds), strong, weak, confidence };
}
