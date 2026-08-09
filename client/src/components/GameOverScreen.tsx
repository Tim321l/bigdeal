import type { GameMode, MatchResult } from '../types';

interface GameOverScreenProps {
  winnerName: string;
  isMe: boolean;
  mode: GameMode;
  /** BOSS_RAID only — everyone lost together, there's no winner at all. */
  raidFailed: boolean;
  /** This room's past results (usually just the game that just ended — there's no rematch flow
   * yet, so a room only ever plays one game today, but the list shape is ready for when it does). */
  history: MatchResult[];
  onLeave: () => void;
}

function HistoryList({ history }: { history: MatchResult[] }) {
  if (history.length === 0) return null;
  return (
    <div className="match-history match-history--gameover">
      <h3>本房戰績</h3>
      <ul className="match-history__list">
        {[...history].reverse().map((result, index) => (
          <li key={index} className="match-history__item">
            <span className="match-history__winner">🏆 {result.winnerName}</span>
            <span className="match-history__players">{result.playerNames.join('、')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GameOverScreen({ winnerName, isMe, mode, raidFailed, history, onLeave }: GameOverScreenProps) {
  const isBattleRoyale = mode === 'BATTLE_ROYALE';
  const isSyndicate = mode === 'SYNDICATE';
  const isBossRaid = mode === 'BOSS_RAID';
  const isRealBigDeal = mode === 'REAL_BIG_DEAL';

  if (isBossRaid && raidFailed) {
    return (
      <div className="overlay overlay--celebrate">
        <div className="modal modal--center">
          <h2>👹 遊戲結束</h2>
          <p className="modal__winner">全枱一齊輸咗……</p>
          <p>15 個回合內都未達到 $30M 銀行結餘或者 4 個集齊套,金融風暴獲勝。</p>
          <HistoryList history={history} />
          <button type="button" className="btn btn--primary" onClick={onLeave}>
            返大廳
          </button>
        </div>
      </div>
    );
  }

  const title = isBattleRoyale
    ? '🔥 遊戲結束'
    : isSyndicate
      ? '🤝 遊戲結束'
      : isBossRaid
        ? '👹 遊戲結束'
        : isRealBigDeal
          ? '🏙️ 遊戲結束'
          : '🎉 遊戲結束';
  const winnerLine = isBattleRoyale
    ? isMe
      ? '你生還到最後!'
      : `${winnerName} 生還到最後!`
    : isSyndicate
      ? isMe
        ? '你哋隊贏咗!'
        : `${winnerName} 嗰隊贏咗!`
      : isBossRaid
        ? '全枱合力擊退咗金融風暴!'
        : isMe
          ? '你贏咗!'
          : `${winnerName} 贏咗!`;
  const description = isBattleRoyale
    ? '所有其他玩家都破產出局咗。'
    : isSyndicate
      ? '隊友合共集齊 4 個完整物業套。'
      : isBossRaid
        ? '全枱合共銀行結餘達 $30M,或者合共集齊 4 個完整物業套。'
        : isRealBigDeal
          ? '已經集齊 3 個完整物業套,或者已經令其他所有對手破產出局。'
          : '已經集齊 3 個完整物業套。';

  return (
    <div className="overlay overlay--celebrate">
      <div className="modal modal--center">
        <h2>{title}</h2>
        <p className="modal__winner">{winnerLine}</p>
        <p>{description}</p>
        <HistoryList history={history} />
        <button type="button" className="btn btn--primary" onClick={onLeave}>
          返大廳
        </button>
      </div>
    </div>
  );
}
