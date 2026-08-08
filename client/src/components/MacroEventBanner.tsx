import { useState } from 'react';
import type { MacroEvent } from '../types';

export function MacroEventBanner({ events }: { events: MacroEvent[] }) {
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  if (events.length === 0) return null;

  const openEvent = events.find((e) => e.id === openEventId) ?? null;

  return (
    <div className="macro-events">
      {events.map((event) => (
        <button
          key={event.id}
          type="button"
          className="macro-event-chip"
          onClick={() => setOpenEventId(event.id)}
        >
          <strong>{event.name}</strong>
          <span>剩 {event.durationTurns} 回合</span>
        </button>
      ))}

      {openEvent && (
        <div className="overlay" onClick={() => setOpenEventId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>📰 {openEvent.name}</h3>
            <p>{openEvent.description}</p>
            <p className="card-info__meta">仲剩 {openEvent.durationTurns} 個回合</p>
            <div className="modal__footer">
              <button type="button" className="btn btn--ghost" onClick={() => setOpenEventId(null)}>
                知道喇
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
