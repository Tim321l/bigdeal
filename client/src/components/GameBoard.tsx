import { useState } from 'react';
import { getEffectiveActionLimit } from '../../../src/engine/modifierPipeline';
import { BASE_ACTION_LIMIT } from '../../../src/engine/stateManager';
import { countPooledCompleteSets } from '../../../src/engine/winCondition';
import { PHASE_LABELS } from '../labels';
import type { ActionPayload, Card, GameEvent, PlayCardTarget, RoomSummary, SanitizedGameState } from '../types';
import { AuctionPanel } from './AuctionPanel';
import { EventLog } from './EventLog';
import { EventToast } from './EventToast';
import { GameOverScreen } from './GameOverScreen';
import { MacroEventBanner } from './MacroEventBanner';
import { OpponentPanel } from './OpponentPanel';
import { PlayerHand } from './PlayerHand';
import { PropertyField } from './PropertyField';
import { ReactionPrompt } from './ReactionPrompt';
import { TargetPicker } from './TargetPicker';

interface GameBoardProps {
  game: SanitizedGameState;
  room: RoomSummary | null;
  myGamePlayerId: string;
  recentEvents: GameEvent[];
  onIntent: (action: ActionPayload) => void;
  onLeave: () => void;
}

export function GameBoard({ game, room, myGamePlayerId, recentEvents, onIntent, onLeave }: GameBoardProps) {
  const [targetingCard, setTargetingCard] = useState<Card | null>(null);

  const me = game.players.find((p) => p.id === myGamePlayerId);
  const opponents = game.players.filter((p) => p.id !== myGamePlayerId);
  const activePlayer = game.players[game.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myGamePlayerId;

  const nameOf = (id: string): string => game.players.find((p) => p.id === id)?.name ?? id;
  const connectedOf = (id: string): boolean => room?.players.find((p) => p.gamePlayerId === id)?.connected ?? true;
  const botLevelOf = (id: string): 1 | 2 | 3 | undefined => room?.players.find((p) => p.gamePlayerId === id)?.bot?.level;

  if (!me) {
    return <p className="loading">正在載入遊戲狀態…</p>;
  }

  const teammate =
    game.mode === 'SYNDICATE' && me.teamId !== undefined
      ? game.players.find((p) => p.id !== myGamePlayerId && p.teamId === me.teamId)
      : undefined;

  const isReacting = game.pendingReaction?.currentResponderId === myGamePlayerId;
  const canDraw = isMyTurn && game.phase === 'TURN_START' && !game.pendingReaction;
  const canAct = isMyTurn && game.phase === 'ACTION' && !game.pendingReaction;
  const actionLimit = getEffectiveActionLimit(BASE_ACTION_LIMIT, game.activeMacroEvents);

  const play = (card: Card, asBank: boolean): void => {
    onIntent({ type: 'PLAY_CARD', playerId: myGamePlayerId, cardId: card.id, asBank });
  };

  const gift = (card: Card): void => {
    if (!teammate) return;
    onIntent({ type: 'GIFT_CARD', playerId: myGamePlayerId, cardId: card.id, toPlayerId: teammate.id });
  };

  const confirmTarget = (target: PlayCardTarget): void => {
    if (!targetingCard) return;
    onIntent({ type: 'PLAY_CARD', playerId: myGamePlayerId, cardId: targetingCard.id, target });
    setTargetingCard(null);
  };

  const respond = (response: 'ACCEPT' | 'JUST_SAY_NO' | 'COUNTER', paymentCardIds?: string[]): void => {
    onIntent({ type: 'RESPOND', playerId: myGamePlayerId, response, paymentCardIds });
  };

  const submitBid = (amount: number): void => {
    onIntent({ type: 'SUBMIT_BID', playerId: myGamePlayerId, amount });
  };

  const winner = game.phase === 'GAME_OVER' ? game.winnerId : undefined;
  const bankTotal = me.bank.reduce((sum, card) => sum + card.value, 0);
  const raidBankTotal = game.players.reduce((sum, p) => sum + p.bank.reduce((s, c) => s + c.value, 0), 0);
  const raidSets = countPooledCompleteSets(game.players);

  const winnerPlayer = winner ? game.players.find((p) => p.id === winner) : undefined;
  const isMyWin =
    game.mode === 'SYNDICATE' && winnerPlayer?.teamId !== undefined
      ? winnerPlayer.teamId === me.teamId
      : winner === myGamePlayerId;
  const winnerDisplayName =
    game.mode === 'SYNDICATE' && winnerPlayer?.teamId !== undefined
      ? game.players
          .filter((p) => p.teamId === winnerPlayer.teamId)
          .map((p) => p.name)
          .join(' & ')
      : winner
        ? nameOf(winner)
        : '';

  return (
    <div className="game-board">
      <EventToast events={recentEvents} nameOf={nameOf} />
      <header className="game-header">
        <div className="game-header__status">
          {game.mode === 'BATTLE_ROYALE' && <span className="badge badge--eliminated">🔥 大逃殺閃擊戰</span>}
          {game.mode === 'SYNDICATE' && <span className="badge badge--bot">🤝 2v2 雙打{teammate ? ` · 隊友:${teammate.name}` : ''}</span>}
          {game.mode === 'AUCTION_DRAFT' && <span className="badge badge--bot">🔨 暗標拍賣</span>}
          {game.mode === 'BOSS_RAID' && (
            <span className="badge badge--eliminated">
              👹 金融風暴 PVE · 回合 {game.turn}/{game.turnLimit ?? '?'} · 全枱夾埋 ${raidBankTotal}M/30M · {raidSets}/4 套
            </span>
          )}
          <span className="badge">{PHASE_LABELS[game.phase]}</span>
          <span>{isMyTurn ? '輪到你' : `輪到 ${activePlayer?.name ?? '?'}`}</span>
          <span>行動 {game.actionsPlayedThisTurn}/{actionLimit}</span>
          <span>牌組剩 {game.deckCount} 張</span>
          <span>棄牌 {game.discardPile.length} 張</span>
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={onLeave}>
          離開
        </button>
      </header>

      {me.eliminated && (
        <div className="banner banner--error">💥 你已經破產出局,而家淨係可以旁觀睇埋呢鋪。</div>
      )}

      <MacroEventBanner events={game.activeMacroEvents} />

      <div className="game-body">
        <section className="opponents-row">
          {opponents.map((p) => (
            <OpponentPanel
              key={p.id}
              player={p}
              isActive={p.id === activePlayer?.id}
              isConnected={connectedOf(p.id)}
              botLevel={botLevelOf(p.id)}
              isTeammate={teammate?.id === p.id}
            />
          ))}
        </section>

        <section className="my-area">
          <div className="my-area__header">
            <h3>{me.name}(你)</h3>
            <span>
              銀行 ${bankTotal}M · {me.bank.length} 張
            </span>
          </div>
          <PropertyField field={me.field} />
          <PlayerHand
            hand={me.hand ?? []}
            canAct={canAct}
            onPlay={play}
            onPlayTargeted={setTargetingCard}
            {...(teammate ? { onGift: gift } : {})}
          />
        </section>

        <aside className="sidebar">
          <EventLog events={recentEvents} nameOf={nameOf} />
        </aside>
      </div>

      <footer className="action-bar">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canDraw}
          onClick={() => onIntent({ type: 'DRAW', playerId: myGamePlayerId })}
        >
          抽牌
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!canAct}
          onClick={() => onIntent({ type: 'END_TURN', playerId: myGamePlayerId })}
        >
          完成回合
        </button>
      </footer>

      {game.phase === 'AUCTION' && game.pendingAuction && (
        <AuctionPanel
          auction={game.pendingAuction}
          myGamePlayerId={myGamePlayerId}
          myBankTotal={bankTotal}
          totalPlayers={game.players.length}
          onSubmitBid={submitBid}
        />
      )}

      {isReacting && game.pendingReaction && (
        <ReactionPrompt
          pending={game.pendingReaction}
          sourceName={nameOf(game.pendingReaction.sourcePlayerId)}
          myHand={me.hand ?? []}
          myBank={me.bank}
          onRespond={respond}
        />
      )}

      {targetingCard && (
        <TargetPicker
          card={targetingCard}
          game={game}
          myGamePlayerId={myGamePlayerId}
          onConfirm={confirmTarget}
          onCancel={() => setTargetingCard(null)}
        />
      )}

      {(winner || game.raidFailed) && (
        <GameOverScreen
          winnerName={winnerDisplayName}
          isMe={isMyWin}
          mode={game.mode}
          raidFailed={game.raidFailed ?? false}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
