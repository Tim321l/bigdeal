import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameEvent } from '../types';

const STORM_EVENT_IDS = new Set(['black-rainstorm', 'typhoon-signal-8']);

/** A brief full-screen rain overlay when a weather-flavored macro event triggers — purely
 * atmospheric, auto-dismisses on its own (see the storm-overlay-fade CSS animation duration). */
export function StormOverlay({ events }: { events: GameEvent[] }) {
  const [active, setActive] = useState(false);
  const prevRef = useRef<GameEvent[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = events;
    const newEvents = events.filter((e) => !prev.includes(e));
    const stormy = newEvents.some((e) => e.type === 'MACRO_EVENT_TRIGGERED' && STORM_EVENT_IDS.has(e.event.id));
    if (!stormy) return;

    setActive(true);
    const timer = setTimeout(() => setActive(false), 2600);
    return () => clearTimeout(timer);
  }, [events]);

  const drops = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1,
        duration: 0.6 + Math.random() * 0.5,
      })),
    [],
  );

  if (!active) return null;

  return (
    <div className="storm-overlay" aria-hidden="true">
      {drops.map((d) => (
        <span
          key={d.id}
          className="storm-overlay__drop"
          style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s` }}
        />
      ))}
    </div>
  );
}
