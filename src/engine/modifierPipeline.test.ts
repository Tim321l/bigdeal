import { describe, expect, it } from 'vitest';
import type { Card, MacroEvent } from '../types/game';
import { calculateEffectiveRent, getEffectiveActionLimit, getEffectiveDrawCount } from './modifierPipeline';

const property = (id: string): Card => ({ id, name: id, type: 'PROPERTY', value: 1, color: 'ESTATE' });

const rateHike: MacroEvent = {
  id: 'rate-hike',
  name: '突發加息',
  description: '',
  durationTurns: 3,
  modifiers: [{ target: 'RENT', operator: 'MULTIPLY', value: 0.5 }],
};

const stampDutyRemoval: MacroEvent = {
  id: 'stamp-duty-removal',
  name: '全面撤辣',
  description: '',
  durationTurns: 3,
  modifiers: [{ target: 'ACTION_LIMIT', operator: 'ADD', value: 2 }],
};

const disableIncompleteRent: MacroEvent = {
  id: 'land-auction-failed',
  name: '賣地流標',
  description: '',
  durationTurns: 4,
  modifiers: [],
  specialEffects: [{ effect: 'DISABLE_INCOMPLETE_SET_RENT' }],
};

describe('calculateEffectiveRent', () => {
  it('returns 0 when the player owns none of the color', () => {
    expect(calculateEffectiveRent(5, [], [])).toBe(0);
  });

  it('returns the base rent unchanged with no active events', () => {
    expect(calculateEffectiveRent(5, [property('a')], [])).toBe(5);
  });

  it('applies MULTIPLY modifiers and floors the result', () => {
    expect(calculateEffectiveRent(5, [property('a')], [rateHike])).toBe(2);
  });

  it('applies OVERRIDE modifiers', () => {
    const override: MacroEvent = { ...rateHike, modifiers: [{ target: 'RENT', operator: 'OVERRIDE', value: 9 }] };
    expect(calculateEffectiveRent(5, [property('a')], [override])).toBe(9);
  });

  it('never returns a negative rent', () => {
    const drop: MacroEvent = { ...rateHike, modifiers: [{ target: 'RENT', operator: 'ADD', value: -100 }] };
    expect(calculateEffectiveRent(5, [property('a')], [drop])).toBe(0);
  });

  it('zeroes rent for incomplete sets when 賣地流標 is active', () => {
    const twoCards = [property('a'), property('b')];
    const threeCards = [property('a'), property('b'), property('c')];
    expect(calculateEffectiveRent(4, twoCards, [disableIncompleteRent])).toBe(0);
    expect(calculateEffectiveRent(4, threeCards, [disableIncompleteRent])).toBe(4);
  });
});

describe('getEffectiveActionLimit', () => {
  it('returns the base limit with no active events', () => {
    expect(getEffectiveActionLimit(3, [])).toBe(3);
  });

  it('applies ACTION_LIMIT modifiers from 全面撤辣', () => {
    expect(getEffectiveActionLimit(3, [stampDutyRemoval])).toBe(5);
  });
});

describe('getEffectiveDrawCount', () => {
  it('returns the base draw count with no active events', () => {
    expect(getEffectiveDrawCount(2, [])).toBe(2);
  });

  it('ignores modifiers that do not target DRAW_COUNT', () => {
    expect(getEffectiveDrawCount(2, [rateHike, stampDutyRemoval])).toBe(2);
  });
});
