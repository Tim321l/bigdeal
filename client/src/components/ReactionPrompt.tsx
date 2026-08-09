import { useState } from 'react';
import type { Card, PendingReaction } from '../types';
import { PaymentPicker } from './PaymentPicker';

interface ReactionPromptProps {
  pending: PendingReaction;
  sourceName: string;
  myHand: Card[];
  myBank: Card[];
  onRespond: (response: 'ACCEPT' | 'JUST_SAY_NO' | 'COUNTER', paymentCardIds?: string[]) => void;
}

/** Rent, Birthday, and Debt Collector all demand money — accepting those opens a PaymentPicker
 * so the responder chooses what to give up; other reactions (steals) resolve immediately. */
function isDebtReaction(pending: PendingReaction): boolean {
  return pending.card.type === 'RENT' || pending.card.actionType === 'BIRTHDAY' || pending.card.actionType === 'DEBT_COLLECTOR';
}

export function ReactionPrompt({ pending, sourceName, myHand, myBank, onRespond }: ReactionPromptProps) {
  const [showPayment, setShowPayment] = useState(false);
  const hasJustSayNo = myHand.some((card) => card.actionType === 'JUST_SAY_NO');
  const hasMarketTop = myHand.some((card) => card.actionType === 'MARKET_TOP');
  const owesDebt = isDebtReaction(pending);
  const amount = pending.amount ?? pending.card.value;

  if (showPayment) {
    return (
      <PaymentPicker
        amount={amount}
        context={`${sourceName} 打出咗「${pending.card.name}」`}
        bank={myBank}
        hand={myHand}
        onConfirm={(cardIds) => onRespond('ACCEPT', cardIds)}
        onCancel={() => setShowPayment(false)}
      />
    );
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h3>要點回應?</h3>
        <p>
          <strong>{sourceName}</strong> 打出咗 <strong>{pending.card.name}</strong>
          {owesDebt ? `,要你俾 $${amount}M` : ''}。
        </p>
        <div className="modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => (owesDebt ? setShowPayment(true) : onRespond('ACCEPT'))}
          >
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
          {owesDebt && (
            <button
              type="button"
              className="btn btn--danger"
              disabled={!hasMarketTop}
              onClick={() => onRespond('COUNTER')}
            >
              炒家摸頂!(反收 ${amount}M){!hasMarketTop ? '(冇呢張卡)' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
