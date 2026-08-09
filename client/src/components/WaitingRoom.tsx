import { useState } from 'react';
import type { GameMode, RoomSummary } from '../types';

// Mirrors src/server/roomManager.ts's MAX_PLAYERS — duplicated rather than imported because that
// module pulls in Node built-ins (node:crypto) that don't belong in a browser bundle.
const MAX_PLAYERS = 5;
const BOT_LEVELS = [1, 2, 3] as const;
const BOT_LEVEL_LABELS: Record<(typeof BOT_LEVELS)[number], string> = {
  1: '易(Lv.1)',
  2: '中(Lv.2)',
  3: '難(Lv.3)',
};
const GAME_MODES: GameMode[] = ['CLASSIC', 'BATTLE_ROYALE'];
const GAME_MODE_LABELS: Record<GameMode, string> = {
  CLASSIC: '經典模式(儲齊 3 套)',
  BATTLE_ROYALE: '🔥 大逃殺閃擊戰(收租雙倍,破產淘汰)',
};

interface WaitingRoomProps {
  room: RoomSummary;
  myLobbyId: string;
  onToggleReady: (ready: boolean) => void;
  onSetMode: (mode: GameMode) => void;
  onAddBot: (level: 1 | 2 | 3) => void;
  onRemoveBot: (botLobbyId: string) => void;
  onLeave: () => void;
}

export function WaitingRoom({ room, myLobbyId, onToggleReady, onSetMode, onAddBot, onRemoveBot, onLeave }: WaitingRoomProps) {
  const [botLevel, setBotLevel] = useState<1 | 2 | 3>(2);
  const me = room.players.find((p) => p.lobbyId === myLobbyId);
  const isHost = room.hostLobbyId === myLobbyId;
  const canStart = room.players.length >= 2;
  const roomFull = room.players.length >= MAX_PLAYERS;

  return (
    <div className="waiting-room">
      <h2>等候大廳</h2>
      <div className="room-code">
        房間號碼:<span className="room-code__value">{room.id}</span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => void navigator.clipboard?.writeText(room.id)}
        >
          複製
        </button>
      </div>

      <div className="mode-controls">
        <span className="mode-controls__label">玩法:</span>
        {isHost ? (
          <div className="mode-controls__tabs">
            {GAME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`tab${room.mode === mode ? ' tab--active' : ''}`}
                onClick={() => onSetMode(mode)}
              >
                {GAME_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        ) : (
          <span className="mode-controls__readonly">{GAME_MODE_LABELS[room.mode]}</span>
        )}
      </div>

      <p className="waiting-room__hint">{canStart ? '所有人 Ready 就會自動開始。' : '要至少 2 位玩家(或機械人)先可以開始。'}</p>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.lobbyId} className={`player-list__item${p.ready ? ' player-list__item--ready' : ''}`}>
            <span className={`status-dot${p.connected ? ' status-dot--online' : ' status-dot--offline'}`} />
            <span className="player-list__name">
              {p.bot ? '🤖 ' : ''}
              {p.name}
              {p.lobbyId === room.hostLobbyId ? ' 👑' : ''}
            </span>
            <span className="player-list__ready-tag">{p.ready ? '已 Ready' : '未 Ready'}</span>
            {isHost && p.bot && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => onRemoveBot(p.lobbyId)}>
                移除
              </button>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="bot-controls">
          <span className="bot-controls__label">加入機械人:</span>
          <div className="bot-controls__levels">
            {BOT_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={`tab${botLevel === level ? ' tab--active' : ''}`}
                onClick={() => setBotLevel(level)}
              >
                {BOT_LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--secondary btn--block" disabled={roomFull} onClick={() => onAddBot(botLevel)}>
            {roomFull ? '房間已滿' : `加入 ${BOT_LEVEL_LABELS[botLevel]} 機械人`}
          </button>
        </div>
      )}

      {me && (
        <button
          type="button"
          className={`btn btn--block ${me.ready ? 'btn--secondary' : 'btn--primary'}`}
          onClick={() => onToggleReady(!me.ready)}
        >
          {me.ready ? '取消 Ready' : '我 Ready 喇'}
        </button>
      )}
      <button type="button" className="btn btn--ghost btn--block" onClick={onLeave}>
        離開房間
      </button>
    </div>
  );
}
