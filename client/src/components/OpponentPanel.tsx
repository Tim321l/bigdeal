import type { MacroEvent, SanitizedPlayer } from '../types';
import { HiddenCard } from './CardView';
import { PropertyField } from './PropertyField';

interface OpponentPanelProps {
  player: SanitizedPlayer;
  isActive: boolean;
  isConnected: boolean;
  botLevel?: 1 | 2 | 3 | undefined;
  isTeammate?: boolean;
  activeMacroEvents?: MacroEvent[];
}

export function OpponentPanel({ player, isActive, isConnected, botLevel, isTeammate, activeMacroEvents }: OpponentPanelProps) {
  const bankTotal = player.bank.reduce((sum, card) => sum + card.value, 0);

  return (
    <div
      className={`opponent-panel${isActive ? ' opponent-panel--active' : ''}${player.eliminated ? ' opponent-panel--eliminated' : ''}${isTeammate ? ' opponent-panel--teammate' : ''}`}
    >
      <div className="opponent-panel__header">
        <span className={`status-dot${isConnected ? ' status-dot--online' : ' status-dot--offline'}`} />
        <span className="opponent-panel__name">
          {botLevel ? '🤖 ' : ''}
          {player.name}
        </span>
        {botLevel && <span className="badge badge--bot">Lv.{botLevel}</span>}
        {isTeammate && <span className="badge badge--turn">🤝 隊友</span>}
        {player.eliminated && <span className="badge badge--eliminated">💥 已出局</span>}
        {isActive && !player.eliminated && <span className="badge badge--turn">行動中</span>}
      </div>
      <div className="opponent-panel__hand">
        {Array.from({ length: player.handCount }, (_, i) => (
          <HiddenCard key={i} />
        ))}
      </div>
      <div className="opponent-panel__stat">
        銀行 ${bankTotal}M · {player.bank.length} 張
      </div>
      <PropertyField field={player.field} {...(activeMacroEvents ? { activeMacroEvents } : {})} />
    </div>
  );
}
