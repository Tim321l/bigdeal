import type { GameMode } from '../types';

interface GameOverScreenProps {
  winnerName: string;
  isMe: boolean;
  mode: GameMode;
  onLeave: () => void;
}

export function GameOverScreen({ winnerName, isMe, mode, onLeave }: GameOverScreenProps) {
  const isBattleRoyale = mode === 'BATTLE_ROYALE';
  return (
    <div className="overlay overlay--celebrate">
      <div className="modal modal--center">
        <h2>{isBattleRoyale ? '🔥 遊戲結束' : '🎉 遊戲結束'}</h2>
        <p className="modal__winner">
          {isBattleRoyale
            ? isMe
              ? '你生還到最後!'
              : `${winnerName} 生還到最後!`
            : isMe
              ? '你贏咗!'
              : `${winnerName} 贏咗!`}
        </p>
        <p>{isBattleRoyale ? '所有其他玩家都破產出局咗。' : '已經集齊 3 個完整物業套。'}</p>
        <button type="button" className="btn btn--primary" onClick={onLeave}>
          返大廳
        </button>
      </div>
    </div>
  );
}
