import { useEffect, useRef, useState } from 'react';
import { playCashSound, playEventChime, playTurnNotify, playWinFanfare } from '../sound';
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

/** True for events that move real cash — used to pick the "cha-ching" sound. TILE_PURCHASED has
 * no `.amount` field (it's `.price`), so it's checked separately from CARD_BANKED/RENT_CHARGED. */
function isCashEvent(event: GameEvent): boolean {
  if (event.type === 'TILE_PURCHASED') return true;
  if (event.type === 'CARD_BANKED' || event.type === 'RENT_CHARGED') return event.amount > 0;
  return false;
}

/**
 * Auto-popup announcement (+ sound) for moments easy to miss in a fast-scrolling event log —
 * a macro event triggering, or someone winning. Doesn't require clicking anything to notice.
 * Also plays a (toast-less) sound cue for cash moving and for a reaction landing on the viewer
 * specifically, since those are common enough that a popup for every one would be spammy.
 */
export function EventToast({
  events,
  nameOf,
  myGamePlayerId,
}: {
  events: GameEvent[];
  nameOf: (id: string) => string;
  myGamePlayerId?: string;
}) {
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
    if (newEvents.length === 0) return;

    const items = newEvents.map((event) => toToastItem(event, nameOf)).filter((item): item is ToastItem => item !== null);

    // Priority order when several things land in the same batch: winning is the loudest signal,
    // then "you specifically need to respond now", then a general macro event, then plain cash
    // movement (the quietest, most frequent cue).
    if (items.some((item) => item.icon === '🏆')) {
      playWinFanfare();
    } else if (newEvents.some((e) => e.type === 'REACTION_REQUESTED' && e.playerId === myGamePlayerId)) {
      playTurnNotify();
    } else if (items.length > 0) {
      playEventChime();
    } else if (newEvents.some(isCashEvent)) {
      playCashSound();
    }

    if (items.length > 0) setQueue((prev) => [...prev, ...items]);
  }, [events, nameOf, myGamePlayerId]);

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
