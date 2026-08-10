import { useState } from 'react';
import type { Card } from '../types';
import { CardView } from './CardView';

interface PaymentPickerProps {
  amount: number;
  /** Who/why this payment is owed, e.g. "Alice 打出咗「屋苑租單」" — shown persistently so the
   * payer doesn't lose track of it after the modal-to-modal transition from ReactionPrompt. */
  context: string;
  bank: Card[];
  /** Field property cards eligible to cover the shortfall (釘子戶-protected colors already
   * excluded by the caller) — picking one transfers that property straight to whoever's owed,
   * same as real Monopoly Deal, not just its cash value. */
  fieldProperties: Card[];
  onConfirm: (cardIds: string[]) => void;
  onCancel: () => void;
}

/** Lets the payer pick which of their own bank cards — or, if the bank alone isn't enough, field
 * properties — to hand over. Hand cards are never spent this way. Confirm is disabled until the
 * selection covers the debt (or everything, if neither pool can cover it). */
export function PaymentPicker({ amount, context, bank, fieldProperties, onConfirm, onCancel }: PaymentPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const payable = [...bank, ...fieldProperties];
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
          <p>你冇銀行現金亦冇物業,唔使俾(手牌唔算數)。</p>
        ) : (
          <>
            <p className="card-info__meta">
              你有 ${totalAvailable}M 可以用(銀行現金 + 物業,手牌唔算數)。
              {totalAvailable < amount ? '唔夠數,要俾晒先可以確認。' : `最少要揀夠 $${requiredMinimum}M。`}
            </p>
            {bank.length > 0 && (
              <div className="modal__list modal__list--cards">
                {bank.map((card) => (
                  <CardView key={card.id} card={card} selected={selected.has(card.id)} onClick={() => toggle(card.id)} />
                ))}
              </div>
            )}
            {fieldProperties.length > 0 && (
              <>
                <p className="card-info__meta payment-picker__warning">
                  ⚠️ 落面呢啲係你已經起咗嘅物業——揀咗會即刻轉畀對方,唔係淨係計錢。
                </p>
                <div className="modal__list modal__list--cards">
                  {fieldProperties.map((card) => (
                    <CardView key={card.id} card={card} selected={selected.has(card.id)} onClick={() => toggle(card.id)} />
                  ))}
                </div>
              </>
            )}
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
