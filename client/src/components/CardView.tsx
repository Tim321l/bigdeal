import { useState } from 'react';
import { ACTION_LABELS, COLOR_LABELS, describeCard } from '../labels';
import type { Card } from '../types';
import { ActionIcon, MoneyIcon, PropertyColorIcon } from './CardIcons';

interface CardViewProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
}

function metaText(card: Card): string {
  if (card.type === 'PROPERTY' && card.color) return COLOR_LABELS[card.color];
  if (card.type === 'RENT' && card.color) return `${COLOR_LABELS[card.color]}租單`;
  if (card.type === 'ACTION' && card.actionType) return ACTION_LABELS[card.actionType];
  if (card.type === 'MONEY') return '現金';
  return '';
}

function CardIcon({ card }: { card: Card }) {
  if ((card.type === 'PROPERTY' || card.type === 'RENT') && card.color) return <PropertyColorIcon color={card.color} />;
  if (card.type === 'ACTION') return <ActionIcon />;
  if (card.type === 'MONEY') return <MoneyIcon />;
  return null;
}

export function CardView({ card, selected, disabled, onClick }: CardViewProps) {
  const [showInfo, setShowInfo] = useState(false);
  const colorSlug = card.color ? card.color.toLowerCase().replace(/_/g, '-') : 'none';
  const classes = [
    'card',
    `card--type-${card.type.toLowerCase()}`,
    `card--color-${colorSlug}`,
    selected ? 'card--selected' : '',
    disabled ? 'card--disabled' : '',
    onClick ? 'card--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const interactiveProps = onClick && !disabled
    ? { role: 'button' as const, tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      } }
    : {};

  return (
    <div className={classes} {...interactiveProps}>
      <button
        type="button"
        className="card__info-btn"
        aria-label={`「${card.name}」係咩意思`}
        onClick={(e) => {
          e.stopPropagation();
          setShowInfo(true);
        }}
      >
        ?
      </button>
      <span className="card__value">${card.value}M</span>
      <span className="card__icon" aria-hidden="true">
        <CardIcon card={card} />
      </span>
      <span className="card__name">{card.name}</span>
      <span className="card__meta">{metaText(card)}</span>

      {showInfo && (
        <div
          className="overlay"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo(false);
          }}
        >
          <div className="modal modal--card-info" onClick={(e) => e.stopPropagation()}>
            <h3>{card.name}</h3>
            <p className="card-info__meta">
              {metaText(card)} · ${card.value}M
            </p>
            <p>{describeCard(card)}</p>
            <div className="modal__footer">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInfo(false);
                }}
              >
                知道喇
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HiddenCard() {
  return (
    <div className="card card--hidden">
      <span className="card__back">大富翁</span>
    </div>
  );
}
