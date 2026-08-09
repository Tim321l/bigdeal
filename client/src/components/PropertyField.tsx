import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../../../src/data/constants';
import { computeSetRent } from '../../../src/engine/stateManager';
import { calculateEffectiveRent } from '../../../src/engine/modifierPipeline';
import { useEnteringIds } from '../hooks/useEnteringIds';
import { COLOR_LABELS } from '../labels';
import type { Card, MacroEvent, PropertyColor } from '../types';
import { CardView } from './CardView';

interface PropertyFieldProps {
  field: Record<PropertyColor, Card[]>;
  onCardClick?: (card: Card, color: PropertyColor) => void;
  selectedCardId?: string;
  /** Active macro events, only needed to show when one is currently changing this group's rent —
   * omit (defaults to none) anywhere that context isn't available. */
  activeMacroEvents?: MacroEvent[];
}

export function PropertyField({ field, onCardClick, selectedCardId, activeMacroEvents = [] }: PropertyFieldProps) {
  const nonEmptyColors = PROPERTY_COLORS.filter((color) => field[color].length > 0);
  const allIds = nonEmptyColors.flatMap((color) => field[color].map((card) => card.id));
  const entering = useEnteringIds(allIds);

  if (nonEmptyColors.length === 0) {
    return <p className="field-empty">未有物業</p>;
  }

  return (
    <div className="property-field">
      {nonEmptyColors.map((color) => {
        const cards = field[color];
        const complete = cards.length >= COMPLETE_SET_SIZE;
        const baseRent = computeSetRent(cards);
        const effectiveRent = calculateEffectiveRent(baseRent, cards, activeMacroEvents);
        return (
          <div key={color} className={`property-group${complete ? ' property-group--complete' : ''}`}>
            <div className="property-group__label">
              {COLOR_LABELS[color]} {cards.length}/{COMPLETE_SET_SIZE}
              {complete ? ' ✓' : ''}
              {effectiveRent > 0 && (
                <span className="property-group__rent">
                  {' '}
                  · 收租 ${effectiveRent}M{effectiveRent !== baseRent ? `（原 $${baseRent}M）` : ''}
                </span>
              )}
            </div>
            <div className="property-group__cards">
              {cards.map((card) => {
                const isImprovement = card.actionType === 'HOUSE' || card.actionType === 'HOTEL';
                const entranceClass = entering.has(card.id) ? (isImprovement ? 'card-entering--slam' : 'card-entering') : '';
                return (
                  <div key={card.id} className={entranceClass || undefined}>
                    <CardView
                      card={card}
                      selected={selectedCardId === card.id}
                      onClick={onCardClick ? () => onCardClick(card, color) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
