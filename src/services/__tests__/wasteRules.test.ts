import { describe, expect, it } from 'vitest';
import { buildAnalysisResult, resolveBottleWasteType } from '../wasteAnalysis';

const g = (pairs: Array<[string, number]>) => pairs.map(([className, probability]) => ({ className, probability }));

describe('what a detected bottle is made of', () => {
  it('a strong "water bottle" guess means plastic, even with glassware guesses around', () => {
    expect(resolveBottleWasteType(g([['water bottle', 0.89], ['pop bottle', 0.75], ['beaker', 0.26]]))).toBe('plastic_bottle');
  });
  it('glassware without a water-bottle guess means glass', () => {
    expect(resolveBottleWasteType(g([['beaker', 0.6], ['pop bottle', 0.51]]))).toBe('glass_bottle');
    expect(resolveBottleWasteType(g([['water jug', 0.46], ['beaker', 0.32], ['pitcher', 0.13]]))).toBe('glass_bottle');
  });
  it('a can guess stronger than the water-bottle guess means metal', () => {
    expect(resolveBottleWasteType(g([['milk can', 0.48], ['water bottle', 0.37]]))).toBe('metal_can');
  });
  it('defaults to plastic when nothing says otherwise', () => {
    expect(resolveBottleWasteType(g([['pop bottle', 0.4]]))).toBe('plastic_bottle');
  });
});

describe('whole-photo guesses', () => {
  const primary = (pairs: Array<[string, number]>, objects: Array<[string, number]> = []) =>
    buildAnalysisResult(objects.map(([c, s]) => ({ class: c, score: s, bbox: [0, 0, 100, 100] })), g(pairs), 640, 480).wasteTypes[0]?.type;

  it('a carton next to an envelope is a cardboard box', () => {
    expect(primary([['envelope', 0.76], ['carton', 0.7]])).toBe('cardboard');
  });
  it('tangled wire and appliances count as e-waste', () => {
    expect(primary([['knot', 0.66], ['coil, spiral, volute, whorl, helix', 0.54]])).toBe('e_waste');
    expect(primary([['electric fan, blower', 0.17]])).toBe('e_waste');
    expect(primary([['iron, smoothing iron', 0.53]])).toBe('e_waste');
  });
  it("a weak 'iron' guess or a bowl doesn't decide the type", () => {
    expect(primary([['iron, smoothing iron', 0.26]], [['bowl', 0.48]])).toBe('mixed_waste');
  });
});
