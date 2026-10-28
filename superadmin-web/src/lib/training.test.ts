import { describe, expect, it } from 'vitest';
import { toReport } from './operations';
import { aiAgreement, buildManifest, classCounts, trainingItems } from './training';

const r = (over: Record<string, unknown>) => toReport(Math.random().toString(36).slice(2), {
  reportNumber: 'RPT-1', photoURL: 'https://res.cloudinary.com/x/photo.jpg', status: 'verified',
  createdAt: '2026-10-01T00:00:00Z', aiAnalysis: { wasteTypes: [{ type: 'plastic_bag', label: 'Plastic Bag' }] }, ...over,
});

describe('trainingItems', () => {
  it("prefers the official's label, then the reporter's", () => {
    const items = trainingItems([
      r({ groundTruthWasteType: 'plastic_bottle', citizenWasteType: 'plastic_bag' }),
      r({ citizenWasteType: 'food_waste' }),
    ]);
    expect(items.map((i) => [i.label, i.labelSource])).toEqual([['plastic_bottle', 'official'], ['food_waste', 'reporter']]);
  });
  it('can be limited to official labels', () => {
    expect(trainingItems([r({ citizenWasteType: 'food_waste' })], true)).toEqual([]);
  });
  it('skips unlabelled, rejected, local-only photos and unknown classes', () => {
    expect(trainingItems([
      r({}),
      r({ citizenWasteType: 'food_waste', status: 'rejected' }),
      r({ citizenWasteType: 'food_waste', photoURL: 'file:///data/user/0/photo.jpg' }),
      r({ citizenWasteType: 'unicorn' }),
    ])).toEqual([]);
  });
  it('counts classes, measures AI agreement and builds the manifest', () => {
    const items = trainingItems([
      r({ groundTruthWasteType: 'plastic_bag' }), // AI said plastic_bag: agrees
      r({ groundTruthWasteType: 'metal_can' }),   // AI said plastic_bag: disagrees
    ]);
    expect(classCounts(items)).toMatchObject({ plastic_bag: 1, metal_can: 1, trash_pile: 0 });
    expect(aiAgreement(items)).toBe(50);
    const m = buildManifest(items, new Date('2026-10-28T00:00:00Z'));
    expect(m).toMatchObject({ format: 'cleanstream-training-manifest', version: 1, exportedAt: '2026-10-28T00:00:00.000Z' });
    expect(m.classes).toHaveLength(13);
    expect(m.items).toHaveLength(2);
  });
});
