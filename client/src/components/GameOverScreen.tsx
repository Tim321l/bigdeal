interface GameOverScreenProps {
  winnerName: string;
  isMe: boolean;
  onLeave: () => void;
}

export function GameOverScreen({ winnerName, isMe, onLeave }: GameOverScreenProps) {
  return (
    <div className="overlay overlay--celebrate">
      <div className="modal modal--center">
        <h2>🎉 遊戲結束</h2>
        <p className="modal__winner">{isMe ? '你贏咗!' : `${winnerName} 贏咗!`}</p>
        <p>已經集齊 3 個完整物業套。</p>
        <button type="button" className="btn btn--primary" onClick={onLeave}>
          返大廳
        </button>
      </div>
    </div>
  );
}
