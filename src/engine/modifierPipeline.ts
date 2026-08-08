import { COMPLETE_SET_SIZE } from '../data/constants';
import type { Card, MacroEvent, Modifier, ModifierTarget } from '../types/game';

function getModifiersForTarget(activeEvents: MacroEvent[], target: ModifierTarget): Modifier[] {
  return activeEvents.flatMap((event) => event.modifiers).filter((modifier) => modifier.target === target);
}

function applyNumericModifiers(base: number, modifiers: Modifier[]): number {
  return modifiers.reduce((value, modifier) => {
    switch (modifier.operator) {
      case 'ADD':
        return value + modifier.value;
      case 'MULTIPLY':
        return value * modifier.value;
      case 'OVERRIDE':
        return modifier.value;
    }
  }, base);
}

/**
 * propertySet is the charging player's own cards of the rent's color. It is used to enforce
 * 賣地流標 (DISABLE_INCOMPLETE_SET_RENT): rent drops to 0 for any color that isn't a full set
 * while that event is active, regardless of other RENT modifiers.
 */
export function calculateEffectiveRent(baseRent: number, propertySet: Card[], activeEvents: MacroEvent[]): number {
  if (propertySet.length === 0) return 0;

  const disablesIncompleteSetRent = activeEvents.some((event) =>
    event.specialEffects?.some((effect) => effect.effect === 'DISABLE_INCOMPLETE_SET_RENT'),
  );
  if (disablesIncompleteSetRent && propertySet.length < COMPLETE_SET_SIZE) return 0;

  const modifiers = getModifiersForTarget(activeEvents, 'RENT');
  const effective = applyNumericModifiers(baseRent, modifiers);
  return Math.max(0, Math.floor(effective));
}

export function getEffectiveActionLimit(baseLimit: number, activeEvents: MacroEvent[]): number {
  const modifiers = getModifiersForTarget(activeEvents, 'ACTION_LIMIT');
  return Math.max(0, Math.floor(applyNumericModifiers(baseLimit, modifiers)));
}

export function getEffectiveDrawCount(baseCount: number, activeEvents: MacroEvent[]): number {
  const modifiers = getModifiersForTarget(activeEvents, 'DRAW_COUNT');
  return Math.max(0, Math.floor(applyNumericModifiers(baseCount, modifiers)));
}
