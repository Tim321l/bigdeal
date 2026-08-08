import { describe, expect, it } from 'vitest';
import type { PropertyColor } from '../types/game';
import { ACTION_CARDS, CARDS, PROPERTY_CARDS } from './cards';

const PROPERTY_COLORS: PropertyColor[] = [
  'PUBLIC_HOUSING',
  'OLD_TONG_LAU',
  'ESTATE',
  'COMMERCIAL_LUXURY',
  'TRANSPORT',
];

describe('card data', () => {
  it('has unique ids across the whole pool', () => {
    const ids = CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly 3 property cards per color, each with a 3-tier rent table', () => {
    for (const color of PROPERTY_COLORS) {
      const inColor = PROPERTY_CARDS.filter((card) => card.color === color);
      expect(inColor).toHaveLength(3);
      for (const card of inColor) {
        expect(card.rentTiers).toHaveLength(3);
      }
    }
  });

  it('gives every action card an actionType', () => {
    for (const card of ACTION_CARDS) {
      expect(card.actionType).toBeDefined();
    }
  });

  it('covers every action archetype exactly once', () => {
    const actionTypes = ACTION_CARDS.map((card) => card.actionType).sort();
    expect(actionTypes).toEqual(
      [
        'BIRTHDAY',
        'DEAL_BREAKER',
        'DEBT_COLLECTOR',
        'DOUBLE_RENT',
        'FORCED_DEAL',
        'HOTEL',
        'HOUSE',
        'JUST_SAY_NO',
        'PASS_GO',
        'SLY_DEAL',
      ].sort(),
    );
  });
});
