import { describe, expect, it } from 'vitest';
import { detectHazardText } from '../hazardDetection';

describe('local product names on labels mark hazardous waste', () => {
  it.each([
    ['ZONROX ORIGINAL 1L', 'corrosive'],
    ['Baygon Multi-Insect Killer', 'pesticide'],
    ['katol mosquito coil', 'pesticide'],
    ['PETRON SPRINT 4T MOTOR OIL', 'chemical'],
    ['BOYSEN QUICK DRYING ENAMEL', 'chemical'],
    ['SOLANE LPG 11 KG', 'flammable'],
    ['MOTOLITE GOLD', 'battery'],
    ['Eveready Heavy Duty AA', 'battery'],
    ['NAKAMAMATAY KAPAG NALUNOK', 'toxic'],
  ])('%s', (label, kind) => {
    expect(detectHazardText(label)?.kinds).toContain(kind);
  });

  it("doesn't flag ordinary products", () => {
    expect(detectHazardText('COCA-COLA 1.5L')).toBeNull();
    expect(detectHazardText('NESTLE PURE WATER')).toBeNull();
    expect(detectHazardText('RAIDER BICYCLE SHOP')).toBeNull(); // "RAID" only as a whole word
  });
});
