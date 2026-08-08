import { describe, expect, it } from 'vitest';
import { MACRO_EVENTS } from './events';

describe('macro event data', () => {
  it('has unique ids', () => {
    const ids = MACRO_EVENTS.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the 5 originally requested events plus 黑色暴雨警告', () => {
    expect(MACRO_EVENTS).toHaveLength(6);
  });

  it('gives every event at least one modifier or special effect', () => {
    for (const event of MACRO_EVENTS) {
      const hasModifiers = event.modifiers.length > 0;
      const hasSpecialEffects = (event.specialEffects?.length ?? 0) > 0;
      expect(hasModifiers || hasSpecialEffects).toBe(true);
    }
  });
});
