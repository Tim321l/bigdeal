import type { Card } from '../types';
import { CardView } from './CardView';

interface PlayerHandProps {
  hand: Card[];
  canAct: boolean;
  onPlay: (card: Card, asBank: boolean) => void;
  onPlayTargeted: (card: Card) => void;
}

const TARGETED_ACTIONS = new Set(['DEAL_BREAKER', 'SLY_DEAL', 'FORCED_DEAL', 'DEBT_COLLECTOR', 'HOUSE', 'HOTEL']);

function primaryLabel(card: Card): string | null {
  if (card.type === 'PROPERTY') return '起樓';
  if (card.type === 'RENT') return '收租';
  if (card.type === 'MONEY') return null; // its only use is banking, covered by the secondary button
  if (card.type === 'ACTION') {
    switch (card.actionType) {
      case 'DOUBLE_RENT':
        return '雙倍租金';
      case 'JUST_SAY_NO':
        return null; // only usable when responding to someone else's action
      case 'PASS_GO':
        return '過龍!';
      case 'DEAL_BREAKER':
      case 'SLY_DEAL':
      case 'FORCED_DEAL':
      case 'DEBT_COLLECTOR':
      case 'HOUSE':
      case 'HOTEL':
        return '使用(揀目標)';
      default:
        return '使用';
    }
  }
  return null;
}

export function PlayerHand({ hand, canAct, onPlay, onPlayTargeted }: PlayerHandProps) {
  if (hand.length === 0) {
    return <p className="hand-empty">手牌係空嘅</p>;
  }

  return (
    <div className="hand">
      {hand.map((card) => {
        const label = primaryLabel(card);
        const isTargeted = card.type === 'ACTION' && !!card.actionType && TARGETED_ACTIONS.has(card.actionType);
        return (
          <div key={card.id} className="hand-card">
            <CardView card={card} />
            <div className="hand-card__actions">
              {label && (
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={!canAct}
                  onClick={() => (isTargeted ? onPlayTargeted(card) : onPlay(card, false))}
                >
                  {label}
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={!canAct}
                onClick={() => onPlay(card, true)}
              >
                入銀行 ${card.value}M
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
