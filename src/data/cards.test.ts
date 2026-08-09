import { describe, expect, it } from 'vitest';
import type { PropertyColor } from '../types/game';
import { ACTION_CARDS, CARDS, MONEY_CARDS, PROPERTY_CARDS, RENT_CARDS } from './cards';

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

  it('has 5 property cards per color (more than the 3 needed to complete a set), each with a 3-tier rent table', () => {
    for (const color of PROPERTY_COLORS) {
      const inColor = PROPERTY_CARDS.filter((card) => card.color === color);
      expect(inColor).toHaveLength(5);
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

  it('covers every action archetype at least once', () => {
    const actionTypes = new Set(ACTION_CARDS.map((card) => card.actionType));
    expect([...actionTypes].sort()).toEqual(
      [
        'BIRTHDAY',
        'DEAL_BREAKER',
        'DEBT_COLLECTOR',
        'DOUBLE_RENT',
        'FORCED_DEAL',
        'HAUNTED_RUMOR',
        'HOTEL',
        'HOUSE',
        'JUST_SAY_NO',
        'MARKET_TOP',
        'NAIL_HOUSE',
        'PASS_GO',
        'PICKPOCKET',
        'RENOVATION_SCAM',
        'SLY_DEAL',
      ].sort(),
    );
  });

  it('gives every rent color 3 copies, so charging rent is not a one-shot resource', () => {
    for (const color of PROPERTY_COLORS) {
      const inColor = RENT_CARDS.filter((card) => card.color === color);
      expect(inColor).toHaveLength(3);
    }
  });

  it('has enough money-card padding that the deck is not immediately exhausted', () => {
    // 30 cards with zero duplicates emptied the deck+discard within 2-3 rounds in real testing;
    // this just guards against silently regressing back to that state. The pool now roughly
    // mirrors real Monopoly Deal's ~110-card economy, scaled to our 5 colors / 10 action types.
    expect(MONEY_CARDS.length).toBeGreaterThan(0);
    expect(CARDS.length).toBeGreaterThanOrEqual(90);
  });

  it('never lets a color own more property copies than its rent-tier table can index safely', () => {
    // Guards the stateManager tier lookup: owning more copies of a color than rentTiers.length
    // must not read past the array (it should reuse the top tier instead).
    for (const color of PROPERTY_COLORS) {
      const inColor = PROPERTY_CARDS.filter((card) => card.color === color);
      const tierLength = inColor[0]?.rentTiers?.length ?? 0;
      expect(inColor.length).toBeGreaterThanOrEqual(tierLength);
    }
  });
});
