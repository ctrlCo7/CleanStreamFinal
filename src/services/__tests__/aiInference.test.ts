import { describe, expect, it } from 'vitest';
import { cropBoxes, mergeClassifications } from '../aiInference';

describe('zoomed-in parts of the photo', () => {
  it('classifies each sizeable detected object, then the centre and four quarters', () => {
    const boxes = cropBoxes(640, 480, [
      { class: 'bottle', score: 0.6, bbox: [100, 100, 120, 200] },
      { class: 'cup', score: 0.1, bbox: [0, 0, 300, 300] }, // too unsure
      { class: 'remote', score: 0.9, bbox: [10, 10, 8, 8] }, // too small
    ], 4);
    expect(boxes).toHaveLength(1 + 1 + 4);
    // The object, padded by 10% and kept inside the photo.
    expect(boxes[0]).toEqual([88, 80, 144, 240]);
    for (const [x, y, w, h] of boxes) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(640);
      expect(y + h).toBeLessThanOrEqual(480);
    }
  });

  it('keeps each label once, with its strongest weighted evidence, best first', () => {
    const merged = mergeClassifications([
      { items: [{ className: 'lakeside', probability: 0.7 }, { className: 'cellular telephone', probability: 0.1 }], weight: 1 },
      { items: [{ className: 'cellular telephone', probability: 0.8 }], weight: 0.9 },
    ], 10);
    expect(merged.map((m) => m.className)).toEqual(['cellular telephone', 'lakeside']);
    expect(merged[0].probability).toBeCloseTo(0.72);
  });
});
