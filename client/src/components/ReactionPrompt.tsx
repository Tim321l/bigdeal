import type { Card, PendingReaction } from '../types';

interface ReactionPromptProps {
  pending: PendingReaction;
  sourceName: string;
  myHand: Card[];
  onRespond: (response: 'ACCEPT' | 'JUST_SAY_NO') => void;
}

export function ReactionPrompt({ pending, sourceName, myHand, onRespond }: ReactionPromptProps) {
  const hasJustSayNo = myHand.some((card) => card.actionType === 'JUST_SAY_NO');

  return (
    <div className="overlay">
      <div className="modal">
        <h3>要點回應?</h3>
        <p>
          <strong>{sourceName}</strong> 打出咗 <strong>{pending.card.name}</strong>。
        </p>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={() => onRespond('ACCEPT')}>
            接受
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!hasJustSayNo}
            onClick={() => onRespond('JUST_SAY_NO')}
          >
            封區!{!hasJustSayNo ? '(冇封區卡)' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
