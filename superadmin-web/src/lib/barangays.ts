// Keep in sync with CEBU_BARANGAYS in the mobile app (src/services/locationService.ts):
// a citizen's report and a barangay official's account both rely on this same `id`.
export interface Barangay { id: string; name: string; custom?: boolean }

export const BARANGAYS: Barangay[] = [
  { id: 'punta-princesa', name: 'Punta Princesa' },
  { id: 'guadalupe', name: 'Guadalupe' },
  { id: 'labangon', name: 'Labangon' },
  { id: 'mambaling', name: 'Mambaling' },
  { id: 'kinasang-an', name: 'Kinasang-an' },
  { id: 'kamputhaw', name: 'Kamputhaw' },
  { id: 'kamagayan', name: 'Kamagayan' },
  { id: 'tinago', name: 'Tinago' },
  { id: 'basak-san-nicolas', name: 'Basak San Nicolas' },
  { id: 'tejero', name: 'Tejero' },
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
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
  const known = listBarangays().find((b) => b.name.toLowerCase() === name.toLowerCase() || b.id === id);
  return known ? { ok: true, id: known.id, name: known.name, isNew: false } : { ok: true, id, name, isNew: true };
};
