import { describe, expect, it } from 'vitest';
import { PRNG } from './prng';

describe('PRNG', () => {
  it('is deterministic for a given seed', () => {
    const a = new PRNG(42);
    const b = new PRNG(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new PRNG(1);
    const b = new PRNG(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() stays within [0, 1)', () => {
    const rng = new PRNG(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt() stays within the inclusive range', () => {
    const rng = new PRNG(99);
    for (let i = 0; i < 1000; i++) {
      const value = rng.nextInt(3, 8);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(8);
    }
  });

  it('shuffle() returns a permutation of the input without mutating it', () => {
    const rng = new PRNG(123);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const original = [...input];
    const shuffled = rng.shuffle(input);
    expect(input).toEqual(original);
    expect(shuffled).toHaveLength(input.length);
    expect([...shuffled].sort()).toEqual([...input].sort());
  });

  it('shuffle() is deterministic for a given seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffledA = new PRNG(55).shuffle(input);
    const shuffledB = new PRNG(55).shuffle(input);
    expect(shuffledA).toEqual(shuffledB);
  });
});
