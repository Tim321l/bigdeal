import { useEffect, useRef, useState } from 'react';
import { playEventChime, playWinFanfare } from '../sound';
import type { GameEvent } from '../types';

interface ToastItem {
  key: string;
  icon: string;
  title: string;
  body: string;
}

function toToastItem(event: GameEvent, nameOf: (id: string) => string): ToastItem | null {
  if (event.type === 'MACRO_EVENT_TRIGGERED') {
    return { key: `macro-${event.event.id}-${Math.random()}`, icon: '📰', title: event.event.name, body: event.event.description };
  }
  if (event.type === 'GAME_WON') {
    return { key: `win-${Math.random()}`, icon: '🏆', title: '遊戲結束', body: `${nameOf(event.playerId)} 贏咗遊戲!` };
  }
  return null;
}

/**
 * Auto-popup announcement (+ sound) for moments easy to miss in a fast-scrolling event log —
 * a macro event triggering, or someone winning. Doesn't require clicking anything to notice.
 */
export function EventToast({ events, nameOf }: { events: GameEvent[]; nameOf: (id: string) => string }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const prevEventsRef = useRef<GameEvent[]>([]);
  const isFirstRun = useRef(true);

  useEffect(() => {
    const previous = prevEventsRef.current;
    prevEventsRef.current = events;

    // Skip the initial mount/reconnect batch — those already happened, no need to re-announce.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const newEvents = events.filter((event) => !previous.includes(event));
    const items = newEvents.map((event) => toToastItem(event, nameOf)).filter((item): item is ToastItem => item !== null);
    if (items.length === 0) return;

    if (items.some((item) => item.icon === '🏆')) playWinFanfare();
    else playEventChime();
    setQueue((prev) => [...prev, ...items]);
  }, [events, nameOf]);

  useEffect(() => {
    if (queue.length === 0) return;
    const timer = setTimeout(() => setQueue((prev) => prev.slice(1)), 4500);
    return () => clearTimeout(timer);
  }, [queue]);

  const current = queue[0];
  if (!current) return null;

  return (
    <div className="event-toast" key={current.key}>
      <span className="event-toast__icon" aria-hidden="true">
        {current.icon}
      </span>
      <div>
        <strong>{current.title}</strong>
        <p>{current.body}</p>
      </div>
    </div>
  );
}
