// Keep in sync with CEBU_BARANGAYS in the mobile app (src/services/locationService.ts):
// a citizen's report and a barangay official's account both rely on this same `id`.
export interface Barangay { id: string; name: string }

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

export const barangayById = (id: string | undefined): Barangay | undefined =>
  BARANGAYS.find((b) => b.id === id);
