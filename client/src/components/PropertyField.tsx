import { useEffect, useRef, useState } from 'react';
import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../../../src/data/constants';
import { computeSetRent } from '../../../src/engine/stateManager';
import { calculateEffectiveRent } from '../../../src/engine/modifierPipeline';
import { useEnteringIds } from '../hooks/useEnteringIds';
import { COLOR_LABELS } from '../labels';
import { playShieldBlock } from '../sound';
import type { Card, GameEvent, MacroEvent, PropertyColor } from '../types';
import { CardView } from './CardView';

interface PropertyFieldProps {
  field: Record<PropertyColor, Card[]>;
  onCardClick?: (card: Card, color: PropertyColor) => void;
  selectedCardId?: string;
  /** Active macro events, only needed to show when one is currently changing this group's rent —
   * omit (defaults to none) anywhere that context isn't available. */
  activeMacroEvents?: MacroEvent[];
  /** Whose field this is — needed to match a NAIL_HOUSE_DEFENDED event's targetPlayerId so the
   * shield flashes on the actual defender's board, not the attacker's or a third player's. */
  ownerPlayerId?: string;
  recentEvents?: GameEvent[];
}

export function PropertyField({
  field,
  onCardClick,
  selectedCardId,
  activeMacroEvents = [],
  ownerPlayerId,
  recentEvents = [],
}: PropertyFieldProps) {
  const nonEmptyColors = PROPERTY_COLORS.filter((color) => field[color].length > 0);
  const allIds = nonEmptyColors.flatMap((color) => field[color].map((card) => card.id));
  const entering = useEnteringIds(allIds);

  const [shieldColor, setShieldColor] = useState<{ color: PropertyColor; key: number } | null>(null);
  const prevEventsRef = useRef<GameEvent[]>([]);
  useEffect(() => {
    const prev = prevEventsRef.current;
    prevEventsRef.current = recentEvents;
    const newEvents = recentEvents.filter((e) => !prev.includes(e));
    const defended = newEvents.find(
      (e): e is Extract<GameEvent, { type: 'NAIL_HOUSE_DEFENDED' }> =>
        e.type === 'NAIL_HOUSE_DEFENDED' && e.targetPlayerId === ownerPlayerId,
    );
    if (!defended) return;
    playShieldBlock();
    setShieldColor({ color: defended.color, key: Date.now() });
    const timer = setTimeout(() => setShieldColor(null), 900);
    return () => clearTimeout(timer);
  }, [recentEvents, ownerPlayerId]);

  if (nonEmptyColors.length === 0) {
    return <p className="field-empty">未有物業</p>;
  }

  return (
    <div className="property-field">
      {nonEmptyColors.map((color) => {
        const cards = field[color];
        const complete = cards.length >= COMPLETE_SET_SIZE;
        const baseRent = computeSetRent(cards, activeMacroEvents);
        const effectiveRent = calculateEffectiveRent(baseRent, cards, activeMacroEvents);
        const isShielded = shieldColor?.color === color;
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
              {isShielded && (
                <div className="nail-house-shield" key={shieldColor?.key} aria-hidden="true">
                  <span className="nail-house-shield__icon">🛡️</span>
                </div>
              )}
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
