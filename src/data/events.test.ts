import { describe, expect, it } from 'vitest';
import { MACRO_EVENTS } from './events';

describe('macro event data', () => {
  it('has unique ids', () => {
    const ids = MACRO_EVENTS.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the original 6 events plus the 8 added for more content variety', () => {
    expect(MACRO_EVENTS).toHaveLength(14);
  });

  it('gives every event at least one modifier or special effect', () => {
    for (const event of MACRO_EVENTS) {
      const hasModifiers = event.modifiers.length > 0;
      const hasSpecialEffects = (event.specialEffects?.length ?? 0) > 0;
      expect(hasModifiers || hasSpecialEffects).toBe(true);
    }
  });
});
