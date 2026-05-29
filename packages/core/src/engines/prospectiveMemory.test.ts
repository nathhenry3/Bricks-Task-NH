import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../infrastructure/random';
import { generateProspectiveMemoryPositions, resolveProspectiveMemoryCueMatch } from './prospectiveMemory';

describe('prospectiveMemory helpers', () => {
  it('generates PM positions that satisfy spacing and eligibility constraints', () => {
    const rng = new SeededRandom(42);
    const eligible = new Set<number>([3, 5, 8, 10, 14, 17]);
    const positions = generateProspectiveMemoryPositions(
      rng,
      20,
      { count: 3, minSeparation: 3, maxSeparation: 7 },
      eligible,
    );

    expect(positions).toHaveLength(3);
    expect(positions.every((p) => eligible.has(p))).toBe(true);
    for (let i = 1; i < positions.length; i += 1) {
      const gap = positions[i] - positions[i - 1];
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(7);
    }
  });

  it('throws when spacing and eligibility make PM placement impossible', () => {
    const rng = new SeededRandom(7);
    const eligible = new Set<number>([5, 6]);
    expect(() =>
      generateProspectiveMemoryPositions(
        rng,
        10,
        { count: 3, minSeparation: 3, maxSeparation: 4 },
        eligible,
      ),
    ).toThrow(/Cannot place PM trials/);
  });

  it('matches cue rules in order and returns matching response key', () => {
    const match = resolveProspectiveMemoryCueMatch(
      { category: 'animals', stimulusText: 'cat', stimulusColor: 'red', flags: { special: true } },
      [
        { type: 'text_starts_with', prefixes: ['do'], responseKey: 'k', id: 'prefix' },
        { type: 'category_in', categories: ['animals'], responseKey: 'space', id: 'category' },
      ],
    );

    expect(match).toEqual({ matched: true, responseKey: 'space', ruleId: 'category' });
  });
});
