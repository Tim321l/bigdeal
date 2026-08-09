import type { GameMode } from '../types';

interface GameOverScreenProps {
  winnerName: string;
  isMe: boolean;
  mode: GameMode;
  onLeave: () => void;
}

export function GameOverScreen({ winnerName, isMe, mode, onLeave }: GameOverScreenProps) {
  const isBattleRoyale = mode === 'BATTLE_ROYALE';
  const isSyndicate = mode === 'SYNDICATE';

  const title = isBattleRoyale ? '🔥 遊戲結束' : isSyndicate ? '🤝 遊戲結束' : '🎉 遊戲結束';
  const winnerLine = isBattleRoyale
    ? isMe
      ? '你生還到最後!'
      : `${winnerName} 生還到最後!`
    : isSyndicate
      ? isMe
        ? '你哋隊贏咗!'
        : `${winnerName} 嗰隊贏咗!`
      : isMe
        ? '你贏咗!'
        : `${winnerName} 贏咗!`;
  const description = isBattleRoyale
    ? '所有其他玩家都破產出局咗。'
    : isSyndicate
      ? '隊友合共集齊 4 個完整物業套。'
      : '已經集齊 3 個完整物業套。';

  return (
    <div className="overlay overlay--celebrate">
      <div className="modal modal--center">
        <h2>{title}</h2>
        <p className="modal__winner">{winnerLine}</p>
        <p>{description}</p>
        <button type="button" className="btn btn--primary" onClick={onLeave}>
          返大廳
        </button>
      </div>
    </div>
  );
}
