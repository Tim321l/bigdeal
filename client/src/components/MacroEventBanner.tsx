import type { MacroEvent } from '../types';

export function MacroEventBanner({ events }: { events: MacroEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="macro-events">
      {events.map((event) => (
        <div key={event.id} className="macro-event-chip" title={event.description}>
          <strong>{event.name}</strong>
          <span>剩 {event.durationTurns} 回合</span>
        </div>
      ))}
    </div>
  );
}
