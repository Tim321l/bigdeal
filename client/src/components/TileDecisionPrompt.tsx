import { BOARD_TILES } from '../../../src/data/board';
import { tileCard } from '../../../src/engine/board';
import type { PendingTileDecision, SanitizedGameState } from '../types';

interface TileDecisionPromptProps {
  pending: PendingTileDecision;
  game: SanitizedGameState;
  myGamePlayerId: string;
  onBuy: () => void;
  onDecline: () => void;
  onTeleport: (toPosition: number) => void;
  onCollectRent: () => void;
  onSkip: () => void;
}

/** REAL_BIG_DEAL: shown to the landing player whenever they're waiting on a buy/decline or
 * transit teleport/collect-rent decision — mirrors ReactionPrompt/TargetPicker's overlay/modal
 * structure. */
export function TileDecisionPrompt({
  pending,
  game,
  myGamePlayerId,
  onBuy,
  onDecline,
  onTeleport,
  onCollectRent,
  onSkip,
}: TileDecisionPromptProps) {
  const me = game.players.find((p) => p.id === myGamePlayerId);
  const card = tileCard(pending.tileIndex);

  if (pending.kind === 'BUY_PROPERTY') {
    return (
      <div className="overlay">
        <div className="modal modal--center">
          <h3>踩中「{card?.name ?? '?'}」</h3>
          <p>未有人買起呢個地皮——要唔要用 ${pending.price ?? 0}M 現金即刻直購?</p>
          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onDecline}>
              唔買
            </button>
            <button type="button" className="btn btn--primary" onClick={onBuy}>
              買起(${pending.price ?? 0}M)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ownsTransit = (me?.field.TRANSPORT ?? []).some((c) => c.type === 'PROPERTY');
  const otherTransitTiles = BOARD_TILES.filter(
    (t) => t.position !== me?.position && tileCard(t.position)?.color === 'TRANSPORT',
  );

  return (
    <div className="overlay">
      <div className="modal modal--center">
        <h3>🚇 {card?.name ?? '交通基建'}</h3>
        <p>你可以搭去另一個交通基建站,同/或者收一次交通租(要自己有交通基建先收得到租)。</p>
        {otherTransitTiles.length > 0 && (
          <div className="modal__list">
            {otherTransitTiles.map((t) => {
              const destinationCard = tileCard(t.position);
              return (
                <button
                  key={t.position}
                  type="button"
                  className="btn btn--block"
                  onClick={() => onTeleport(t.position)}
                >
                  🚆 搭去「{destinationCard?.name ?? '?'}」
                </button>
              );
            })}
          </div>
        )}
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            唔使,行埋佢
          </button>
          <button type="button" className="btn btn--secondary" disabled={!ownsTransit} onClick={onCollectRent}>
            💰 收交通租{!ownsTransit ? '(未擁有交通基建)' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
