import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../../../src/data/constants';
import { COLOR_LABELS } from '../labels';
import type { Card, PropertyColor } from '../types';
import { CardView } from './CardView';

interface PropertyFieldProps {
  field: Record<PropertyColor, Card[]>;
  onCardClick?: (card: Card, color: PropertyColor) => void;
  selectedCardId?: string;
}

export function PropertyField({ field, onCardClick, selectedCardId }: PropertyFieldProps) {
  const nonEmptyColors = PROPERTY_COLORS.filter((color) => field[color].length > 0);

  if (nonEmptyColors.length === 0) {
    return <p className="field-empty">未有物業</p>;
  }

  return (
    <div className="property-field">
      {nonEmptyColors.map((color) => {
        const cards = field[color];
        const complete = cards.length >= COMPLETE_SET_SIZE;
        return (
          <div key={color} className={`property-group${complete ? ' property-group--complete' : ''}`}>
            <div className="property-group__label">
              {COLOR_LABELS[color]} {cards.length}/{COMPLETE_SET_SIZE}
              {complete ? ' ✓' : ''}
            </div>
            <div className="property-group__cards">
              {cards.map((card) => (
                <CardView
                  key={card.id}
                  card={card}
                  selected={selectedCardId === card.id}
                  onClick={onCardClick ? () => onCardClick(card, color) : undefined}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
