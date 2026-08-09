import { useEffect, useRef, useState } from 'react';
import { playCounterDrain } from '../sound';
import type { GameEvent } from '../types';

/** A brief full-screen green vortex + "cha-ching" whenever anyone plays 炒家摸頂 (MARKET_TOP) to
 * reverse a money demand back onto its source — same event-diffing pattern as StormOverlay. */
export function CounterVortex({ events }: { events: GameEvent[] }) {
  const [active, setActive] = useState(false);
  const prevRef = useRef<GameEvent[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = events;
    const newEvents = events.filter((e) => !prev.includes(e));
    const countered = newEvents.some((e) => e.type === 'REACTION_RESOLVED' && e.response === 'COUNTER');
    if (!countered) return;

    playCounterDrain();
    setActive(true);
    const timer = setTimeout(() => setActive(false), 900);
    return () => clearTimeout(timer);
  }, [events]);

  if (!active) return null;

  return (
    <div className="counter-vortex" aria-hidden="true">
      <div className="counter-vortex__spiral" />
    </div>
  );
}
