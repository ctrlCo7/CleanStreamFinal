// Keep in sync with CEBU_BARANGAYS in the mobile app (src/services/locationService.ts):
// a citizen's report and a barangay official's account both rely on this same `id`.
export interface Barangay { id: string; name: string; custom?: boolean; aliases?: string[] }

export const BARANGAYS: Barangay[] = [
  { id: 'adlaon', name: 'Adlaon' },
  { id: 'agsungot', name: 'Agsungot' },
  { id: 'apas', name: 'Apas' },
  { id: 'babag', name: 'Babag' },
  { id: 'bacayan', name: 'Bacayan' },
  { id: 'banilad', name: 'Banilad' },
  { id: 'basak-pardo', name: 'Basak Pardo' },
  { id: 'basak-san-nicolas', name: 'Basak San Nicolas' },
  { id: 'binaliw', name: 'Binaliw' },
  { id: 'bonbon', name: 'Bonbon' },
  { id: 'budla-an', name: 'Budla-an', aliases: ['Budlaan'] },
  { id: 'buhisan', name: 'Buhisan' },
  { id: 'bulacao', name: 'Bulacao' },
  { id: 'buot', name: 'Buot', aliases: ['Buot-Taup', 'Buot-Taup Pardo'] },
  { id: 'busay', name: 'Busay' },
  { id: 'calamba', name: 'Calamba' },
  { id: 'cambinocot', name: 'Cambinocot' },
  { id: 'capitol-site', name: 'Capitol Site' },
  { id: 'carreta', name: 'Carreta' },
  { id: 'cogon-pardo', name: 'Cogon Pardo' },
  { id: 'cogon-ramos', name: 'Cogon Ramos' },
  { id: 'day-as', name: 'Day-as', aliases: ['Dayas'] },
  { id: 'duljo-fatima', name: 'Duljo Fatima', aliases: ['Duljo'] },
  { id: 'ermita', name: 'Ermita' },
  { id: 'guadalupe', name: 'Guadalupe' },
  { id: 'guba', name: 'Guba' },
  { id: 'hipodromo', name: 'Hipodromo' },
  { id: 'inayawan', name: 'Inayawan' },
  { id: 'kalubihan', name: 'Kalubihan' },
  { id: 'kalunasan', name: 'Kalunasan' },
  { id: 'kamagayan', name: 'Kamagayan' },
  { id: 'kamputhaw', name: 'Kamputhaw', aliases: ['Camputhaw'] },
  { id: 'kasambagan', name: 'Kasambagan' },
  { id: 'kinasang-an', name: 'Kinasang-an Pardo', aliases: ['Kinasang-an', 'Kinasangan'] },
  { id: 'labangon', name: 'Labangon' },
  { id: 'lahug', name: 'Lahug' },
  { id: 'lorega-san-miguel', name: 'Lorega San Miguel', aliases: ['Lorega'] },
  { id: 'lusaran', name: 'Lusaran' },
  { id: 'luz', name: 'Luz' },
  { id: 'mabini', name: 'Mabini' },
  { id: 'mabolo', name: 'Mabolo' },
  { id: 'malubog', name: 'Malubog' },
  { id: 'mambaling', name: 'Mambaling' },
  { id: 'pahina-central', name: 'Pahina Central' },
  { id: 'pahina-san-nicolas', name: 'Pahina San Nicolas' },
  { id: 'pamutan', name: 'Pamutan' },
  { id: 'pardo', name: 'Pardo', aliases: ['Poblacion Pardo', 'Pardo (Pob.)'] },
  { id: 'pari-an', name: 'Pari-an', aliases: ['Parian'] },
  { id: 'paril', name: 'Paril' },
  { id: 'pasil', name: 'Pasil' },
  { id: 'pit-os', name: 'Pit-os', aliases: ['Pitos'] },
  { id: 'pulangbato', name: 'Pulangbato' },
  { id: 'pung-ol-sibugay', name: 'Pung-ol Sibugay' },
  { id: 'punta-princesa', name: 'Punta Princesa' },
  { id: 'quiot-pardo', name: 'Quiot Pardo', aliases: ['Quiot'] },
  { id: 'sambag-i', name: 'Sambag I' },
  { id: 'sambag-ii', name: 'Sambag II' },
  { id: 'san-antonio', name: 'San Antonio' },
  { id: 'san-jose', name: 'San Jose' },
  { id: 'san-nicolas-proper', name: 'San Nicolas Proper', aliases: ['San Nicolas'] },
  { id: 'san-roque', name: 'San Roque' },
  { id: 'santa-cruz', name: 'Santa Cruz' },
  { id: 'santo-nino', name: 'Santo Niño', aliases: ['Señor Santo Niño', 'Santo Nino', 'Sto. Niño'] },
  { id: 'sapangdaku', name: 'Sapangdaku' },
  { id: 'sawang-calero', name: 'Sawang Calero' },
  { id: 'sinsin', name: 'Sinsin', aliases: ['Sin-sin'] },
  { id: 'sirao', name: 'Sirao' },
  { id: 'suba', name: 'Suba' },
  { id: 'sudlon-i', name: 'Sudlon I' },
  { id: 'sudlon-ii', name: 'Sudlon II' },
  { id: 't-padilla', name: 'T. Padilla', aliases: ['T Padilla', 'Tomas Padilla'] },
  { id: 'tabunan', name: 'Tabunan' },
  { id: 'tagba-o', name: 'Tagba-o', aliases: ['Tagbao'] },
  { id: 'talamban', name: 'Talamban' },
  { id: 'taptap', name: 'Taptap' },
  { id: 'tejero', name: 'Tejero' },
  { id: 'tinago', name: 'Tinago' },
  { id: 'tisa', name: 'Tisa' },
  { id: 'to-ong', name: 'To-ong', aliases: ['Toong'] },
  { id: 'zapatera', name: 'Zapatera' },
];

// Barangays typed in by the Super Admin, saved in Firestore `barangays` (custom: true)
// and kept here by DataProvider so every picker and lookup includes them.
let registered: Barangay[] = [];

export const setRegisteredBarangays = (list: Barangay[]) => {
  registered = list
    .filter((b) => !BARANGAYS.some((c) => c.id === b.id))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** The fixed list first, then registered ones alphabetically. */
export const listBarangays = (): Barangay[] => [...BARANGAYS, ...registered];

export const barangayById = (id: string | undefined): Barangay | undefined =>
  listBarangays().find((b) => b.id === id);

/** Same rule as slugifyBarangay in the mobile app, so both sides get the same id. */
export const slugifyBarangay = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Tidies a typed name: trims, collapses spaces, drops a leading "Brgy." / "Barangay". */
export const cleanBarangayName = (typed: string): string =>
  typed.trim().replace(/\s+/g, ' ').replace(/^(brgy\.?|barangay)\s+/i, '');

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'’()-]*$/u;

export type BarangayResolution =
  | { ok: true; id: string; name: string; isNew: boolean }
  | { ok: false; error: string };

/**
 * Turns what was typed into a barangay. A name matching a known barangay (any letter case,
 * with or without "Brgy.") uses that one; anything else becomes a new barangay.
 */
export const resolveBarangay = (typed: string): BarangayResolution => {
  const name = cleanBarangayName(typed);
  if (!name) return { ok: false, error: 'Enter the barangay.' };
  if (name.length < 2 || name.length > 60) return { ok: false, error: 'A barangay name is 2 to 60 characters long.' };
  if (!NAME_RE.test(name)) return { ok: false, error: 'Use letters, numbers, spaces, hyphens or periods only.' };
  const id = slugifyBarangay(name);
  if (!id) return { ok: false, error: 'Use letters, numbers, spaces, hyphens or periods only.' };
  const known = listBarangays().find((b) => b.name.toLowerCase() === name.toLowerCase() || b.id === id
    || b.aliases?.some((a) => a.toLowerCase() === name.toLowerCase()));
  return known ? { ok: true, id: known.id, name: known.name, isNew: false } : { ok: true, id, name, isNew: true };
};
