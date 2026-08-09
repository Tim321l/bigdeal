import { useEffect, useState } from 'react';
import { getEffectiveActionLimit } from '../../../src/engine/modifierPipeline';
import { BASE_ACTION_LIMIT } from '../../../src/engine/stateManager';
import { countPooledCompleteSets } from '../../../src/engine/winCondition';
import { PHASE_LABELS } from '../labels';
import { isMuted, playCardSound, playCashSound, playDiceSound, setMuted } from '../sound';
import type { ActionPayload, Card, GameEvent, MatchResult, PlayCardTarget, RoomSummary, SanitizedGameState } from '../types';
import { AuctionPanel } from './AuctionPanel';
import { BoardMap } from './BoardMap';
import { EventLog } from './EventLog';
import { EventToast } from './EventToast';
import { FloatingDelta } from './FloatingDelta';
import { GameOverScreen } from './GameOverScreen';
import { MacroEventBanner } from './MacroEventBanner';
import { OpponentPanel } from './OpponentPanel';
import { PlayerHand } from './PlayerHand';
import { PropertyField } from './PropertyField';
import { ReactionPrompt } from './ReactionPrompt';
import { StormOverlay } from './StormOverlay';
import { TargetPicker } from './TargetPicker';
import { TileDecisionPrompt } from './TileDecisionPrompt';

interface GameBoardProps {
  game: SanitizedGameState;
  room: RoomSummary | null;
  myGamePlayerId: string;
  recentEvents: GameEvent[];
  onIntent: (action: ActionPayload) => void;
  onFetchHistory: (roomId: string) => Promise<MatchResult[]>;
  onLeave: () => void;
}

export function GameBoard({ game, room, myGamePlayerId, recentEvents, onIntent, onFetchHistory, onLeave }: GameBoardProps) {
  const [targetingCard, setTargetingCard] = useState<Card | null>(null);
  const [history, setHistory] = useState<MatchResult[]>([]);
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const isGameOver = game.phase === 'GAME_OVER';
  useEffect(() => {
    if (!isGameOver || !room) return;
    void onFetchHistory(room.id).then(setHistory);
  }, [isGameOver, room, onFetchHistory]);

  const me = game.players.find((p) => p.id === myGamePlayerId);
  const opponents = game.players.filter((p) => p.id !== myGamePlayerId);
  const activePlayer = game.players[game.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myGamePlayerId;

  const nameOf = (id: string): string => game.players.find((p) => p.id === id)?.name ?? id;
  const connectedOf = (id: string): boolean => room?.players.find((p) => p.gamePlayerId === id)?.connected ?? true;
  const botLevelOf = (id: string): 1 | 2 | 3 | undefined => room?.players.find((p) => p.gamePlayerId === id)?.bot?.level;

  if (!me) {
    // No seat matches myGamePlayerId — either state genuinely hasn't arrived yet, or this
    // connection is spectating (room:spectate never claims a player seat). Since spectators are
    // real, expected traffic (not just a loading blip), render a read-only view instead of
    // getting stuck on a spinner forever: `opponents` above already resolves to every player
    // (nothing matches myGamePlayerId to exclude), and activePlayer/isMyTurn/nameOf/connectedOf/
    // botLevelOf are all already computed above without depending on `me`.
    const spectatorWinner = game.phase === 'GAME_OVER' ? game.winnerId : undefined;
    const spectatorWinnerName = spectatorWinner ? nameOf(spectatorWinner) : '';
    return (
      <div className="game-board">
        <EventToast events={recentEvents} nameOf={nameOf} myGamePlayerId={myGamePlayerId} />
        <header className="game-header">
          <div className="game-header__status">
            <span className="badge badge--bot">👁️ 旁觀中</span>
            <span className="badge">{PHASE_LABELS[game.phase]}</span>
            <span>輪到 {activePlayer?.name ?? '?'}</span>
            <span>牌組剩 {game.deckCount} 張</span>
            <span>棄牌 {game.discardPile.length} 張</span>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={toggleMute} aria-label={muted ? '開聲' : '靜音'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onLeave}>
            離開
          </button>
        </header>

        <MacroEventBanner events={game.activeMacroEvents} />
        <StormOverlay events={recentEvents} />

        <div className="game-body">
          {game.mode === 'REAL_BIG_DEAL' ? (
            <section className="board-section">
              <BoardMap game={game} myGamePlayerId={myGamePlayerId} recentEvents={recentEvents} />
            </section>
          ) : (
            <section className="opponents-row">
              {opponents.map((p) => (
                <OpponentPanel
                  key={p.id}
                  player={p}
                  isActive={p.id === activePlayer?.id}
                  isConnected={connectedOf(p.id)}
                  botLevel={botLevelOf(p.id)}
                  activeMacroEvents={game.activeMacroEvents}
                />
              ))}
            </section>
          )}

          <aside className="sidebar">
            <EventLog events={recentEvents} nameOf={nameOf} />
          </aside>
        </div>

        {(spectatorWinner || game.raidFailed) && (
          <GameOverScreen
            winnerName={spectatorWinnerName}
            isMe={false}
            mode={game.mode}
            raidFailed={game.raidFailed ?? false}
            history={history}
            onLeave={onLeave}
          />
        )}
      </div>
    );
  }

  const teammate =
    game.mode === 'SYNDICATE' && me.teamId !== undefined
      ? game.players.find((p) => p.id !== myGamePlayerId && p.teamId === me.teamId)
      : undefined;

  const isReacting = game.pendingReaction?.currentResponderId === myGamePlayerId;
  const canDraw = isMyTurn && game.phase === 'TURN_START' && !game.pendingReaction;
  const canAct = isMyTurn && game.phase === 'ACTION' && !game.pendingReaction;
  const canRoll = isMyTurn && game.phase === 'ROLL';
  const actionLimit = getEffectiveActionLimit(BASE_ACTION_LIMIT, game.activeMacroEvents);
  const isMyTileDecision = game.phase === 'TILE_DECISION' && game.pendingTileDecision?.playerId === myGamePlayerId;

  const play = (card: Card, asBank: boolean): void => {
    if (asBank) playCashSound();
    else playCardSound();
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

  const rollDice = (): void => {
    playDiceSound();
    onIntent({ type: 'ROLL_DICE', playerId: myGamePlayerId });
  };

  const buyTile = (): void => {
    onIntent({ type: 'BUY_TILE', playerId: myGamePlayerId });
  };

  const declineTile = (): void => {
    onIntent({ type: 'DECLINE_TILE', playerId: myGamePlayerId });
  };

  const teleportTransit = (toPosition: number): void => {
    onIntent({ type: 'TELEPORT_TRANSIT', playerId: myGamePlayerId, toPosition });
  };

  const collectTransitRent = (): void => {
    onIntent({ type: 'COLLECT_TRANSIT_RENT', playerId: myGamePlayerId });
  };

  const skipTileDecision = (): void => {
    onIntent({ type: 'SKIP_TILE_DECISION', playerId: myGamePlayerId });
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
      <EventToast events={recentEvents} nameOf={nameOf} myGamePlayerId={myGamePlayerId} />
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
          {game.mode === 'REAL_BIG_DEAL' && (
            <span className="badge badge--bot">🏙️ 真實大地產 · 位置 {me.position ?? 0}</span>
          )}
          <span className="badge">{PHASE_LABELS[game.phase]}</span>
          <span>{isMyTurn ? '輪到你' : `輪到 ${activePlayer?.name ?? '?'}`}</span>
          <span>行動 {game.actionsPlayedThisTurn}/{actionLimit}</span>
          <span>牌組剩 {game.deckCount} 張</span>
          <span>棄牌 {game.discardPile.length} 張</span>
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={toggleMute} aria-label={muted ? '開聲' : '靜音'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onLeave}>
          離開
        </button>
      </header>

      {me.eliminated && (
        <div className="banner banner--error">💥 你已經破產出局,而家淨係可以旁觀睇埋呢鋪。</div>
      )}

      <MacroEventBanner events={game.activeMacroEvents} />
      <StormOverlay events={recentEvents} />

      <div className="game-body">
        {game.mode === 'REAL_BIG_DEAL' ? (
          <section className="board-section">
            <BoardMap game={game} myGamePlayerId={myGamePlayerId} recentEvents={recentEvents} />
          </section>
        ) : (
          <section className="opponents-row">
            {opponents.map((p) => (
              <OpponentPanel
                key={p.id}
                player={p}
                isActive={p.id === activePlayer?.id}
                isConnected={connectedOf(p.id)}
                botLevel={botLevelOf(p.id)}
                isTeammate={teammate?.id === p.id}
                activeMacroEvents={game.activeMacroEvents}
              />
            ))}
          </section>
        )}

        <section className="my-area">
          <div className="my-area__header">
            <h3>{me.name}(你)</h3>
            <FloatingDelta value={bankTotal}>
              <span>
                銀行 ${bankTotal}M · {me.bank.length} 張
              </span>
            </FloatingDelta>
          </div>
          <PropertyField field={me.field} activeMacroEvents={game.activeMacroEvents} />
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
        {game.mode === 'REAL_BIG_DEAL' && (
          <button type="button" className="btn btn--primary" disabled={!canRoll} onClick={rollDice}>
            🎲 擲骰
          </button>
        )}
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

      {isMyTileDecision && game.pendingTileDecision && (
        <TileDecisionPrompt
          pending={game.pendingTileDecision}
          game={game}
          myGamePlayerId={myGamePlayerId}
          onBuy={buyTile}
          onDecline={declineTile}
          onTeleport={teleportTransit}
          onCollectRent={collectTransitRent}
          onSkip={skipTileDecision}
        />
      )}

      {(winner || game.raidFailed) && (
        <GameOverScreen
          winnerName={winnerDisplayName}
          isMe={isMyWin}
          mode={game.mode}
          raidFailed={game.raidFailed ?? false}
          history={history}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
