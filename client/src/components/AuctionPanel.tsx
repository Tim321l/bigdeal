import { useState } from 'react';
import type { SanitizedPendingAuction } from '../types';
import { CardView } from './CardView';

interface AuctionPanelProps {
  auction: SanitizedPendingAuction;
  myGamePlayerId: string;
  myBankTotal: number;
  totalPlayers: number;
  onSubmitBid: (amount: number) => void;
}

/** AUCTION_DRAFT's blind bidding round — every player sees the same 3 revealed cards and submits
 * one sealed bid in bank cash. Nobody's bid (including your own echoed back) is shown here; only
 * who has already submitted, so you can't infer anything from watching the count tick up. */
export function AuctionPanel({ auction, myGamePlayerId, myBankTotal, totalPlayers, onSubmitBid }: AuctionPanelProps) {
  const [amount, setAmount] = useState(0);
  const alreadyBid = auction.submittedPlayerIds.includes(myGamePlayerId);
  const remaining = totalPlayers - auction.submittedPlayerIds.length;

  return (
    <div className="overlay">
      <div className="modal modal--center">
        <h3>🔨 暗標拍賣</h3>
        <p className="card-info__meta">牌庫頂 3 張卡公開,大家用銀行現金暗標,出價最高者攞晒呢 3 張(要俾返自己嗰個標價)。</p>
        <div className="modal__list modal__list--cards">
          {auction.cards.map((card) => (
            <CardView key={card.id} card={card} />
          ))}
        </div>
        {alreadyBid ? (
          <p className="card-info__meta">
            已經落標,仲有 {remaining} 位未落標——等緊佢哋。
          </p>
        ) : (
          <>
            <p className="card-info__meta">你銀行有 ${myBankTotal}M 可以用嚟出價(唔可以用手牌)。</p>
            <input
              type="range"
              min={0}
              max={myBankTotal}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="auction-slider"
            />
            <p className="auction-bid-amount">出價 ${amount}M</p>
            <div className="modal__footer">
              <button type="button" className="btn btn--primary" onClick={() => onSubmitBid(amount)}>
                落標 ${amount}M
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
