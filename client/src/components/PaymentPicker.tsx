import { useState } from 'react';
import type { Card } from '../types';
import { CardView } from './CardView';

interface PaymentPickerProps {
  amount: number;
  /** Who/why this payment is owed, e.g. "Alice 打出咗「屋苑租單」" — shown persistently so the
   * payer doesn't lose track of it after the modal-to-modal transition from ReactionPrompt. */
  context: string;
  bank: Card[];
  onConfirm: (cardIds: string[]) => void;
  onCancel: () => void;
}

/** Lets the payer pick which of their own bank cards to hand over — only bank cash counts toward
 * rent/debt charges, hand cards are never spent this way. Confirm is disabled until the selection
 * covers the debt (or everything, if the bank can't cover it). */
export function PaymentPicker({ amount, context, bank, onConfirm, onCancel }: PaymentPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const payable = bank;
  const totalAvailable = payable.reduce((sum, card) => sum + card.value, 0);
  const requiredMinimum = Math.min(amount, totalAvailable);
  const selectedTotal = payable.filter((card) => selected.has(card.id)).reduce((sum, card) => sum + card.value, 0);
  const canConfirm = selectedTotal >= requiredMinimum;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overlay">
      <div className="modal">
        <h3>要俾 ${amount}M——揀邊啲卡找數</h3>
        <p className="card-info__meta">{context}</p>
        {payable.length === 0 ? (
          <p>你銀行冇錢,唔使俾(手牌唔算數)。</p>
        ) : (
          <>
            <p className="card-info__meta">
              你銀行有 ${totalAvailable}M 可以用(手牌唔算數)。
              {totalAvailable < amount ? '唔夠數,要俾晒先可以確認。' : `最少要揀夠 $${requiredMinimum}M。`}
            </p>
            <div className="modal__list modal__list--cards">
              {payable.map((card) => (
                <CardView key={card.id} card={card} selected={selected.has(card.id)} onClick={() => toggle(card.id)} />
              ))}
            </div>
            <p className="card-info__meta">
              已揀:${selectedTotal}M{selectedTotal > amount ? '(多過要俾嘅金額,因為冇散紙找)' : ''}
            </p>
          </>
        )}
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            返回
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={payable.length > 0 && !canConfirm}
            onClick={() => onConfirm([...selected])}
          >
            確認找數
          </button>
        </div>
      </div>
    </div>
  );
}
