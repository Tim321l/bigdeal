import { useEffect, useRef, useState } from 'react';
import { playCashSound } from '../sound';
import type { GameEvent } from '../types';

interface CascadeItem {
  key: string;
  amount: number;
  fromPlayerId: string;
  index: number;
}

/** When 2+ rent charges land in the same event batch (a rent card hitting several opponents at
 * once, or two rent plays resolving together), flash a quick stacked sequence of banners instead
 * of just the one plain cash sound — "chasing rent" across several targets in a row. */
export function RentCascade({ events, nameOf }: { events: GameEvent[]; nameOf: (id: string) => string }) {
  const [items, setItems] = useState<CascadeItem[]>([]);
  const prevRef = useRef<GameEvent[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = events;
    const newEvents = events.filter((e) => !prev.includes(e));
    const charges = newEvents.filter(
      (e): e is Extract<GameEvent, { type: 'RENT_CHARGED' }> => e.type === 'RENT_CHARGED' && e.amount > 0,
    );
    if (charges.length < 2) return;

    const batchKey = Date.now();
    const nextItems = charges.map((charge, index) => ({
      key: `${batchKey}-${index}`,
      amount: charge.amount,
      fromPlayerId: charge.fromPlayerId,
      index,
    }));
    setItems(nextItems);
    charges.forEach((_, i) => setTimeout(() => playCashSound(), i * 140));
    const timer = setTimeout(() => setItems([]), charges.length * 140 + 900);
    return () => clearTimeout(timer);
  }, [events, nameOf]);

  if (items.length === 0) return null;

  return (
    <div className="rent-cascade" aria-hidden="true">
      {items.map((item) => (
        <div key={item.key} className="rent-cascade__item" style={{ animationDelay: `${item.index * 0.14}s` }}>
          <span className="rent-cascade__shockwave" />
          <span className="rent-cascade__shockwave rent-cascade__shockwave--delayed" />
          <span className="rent-cascade__label">💰 {nameOf(item.fromPlayerId)} 俾咗 ${item.amount}M</span>
        </div>
      ))}
    </div>
  );
}
