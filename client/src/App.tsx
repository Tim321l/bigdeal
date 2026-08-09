import { GameBoard } from './components/GameBoard';
import { LandingScreen } from './components/LandingScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { useGameConnection } from './hooks/useGameConnection';

export default function App() {
  const {
    status,
    room,
    game,
    error,
    recentEvents,
    myLobbyId,
    myGamePlayerId,
    isSpectating,
    createRoom,
    joinRoom,
    setReady,
    setMode,
    sendIntent,
    addBot,
    removeBot,
    spectateRoom,
    getHistory,
    leaveSession,
    clearError,
  } = useGameConnection();

  const content =
    game && myGamePlayerId ? (
      <GameBoard
        game={game}
        room={room}
        myGamePlayerId={myGamePlayerId}
        recentEvents={recentEvents}
        onIntent={sendIntent}
        onFetchHistory={getHistory}
        onLeave={leaveSession}
      />
    ) : room && myLobbyId ? (
      <WaitingRoom
        room={room}
        myLobbyId={myLobbyId}
        onToggleReady={setReady}
        onSetMode={setMode}
        onAddBot={addBot}
        onRemoveBot={removeBot}
        onLeave={leaveSession}
      />
    ) : isSpectating ? (
      <p className="loading">👁️ 已加入旁觀,等緊遊戲開始…</p>
    ) : (
      <LandingScreen onCreate={createRoom} onJoin={joinRoom} onSpectate={spectateRoom} error={error} onDismissError={clearError} />
    );

  return (
    <>
      {status !== 'connected' && (
        <div className="connection-banner">
          {status === 'connecting' ? '連緊線…' : '同伺服器斷咗線,嘗試重新連接…'}
        </div>
      )}
      {content}
    </>
  );
}
