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
    createRoom,
    joinRoom,
    setReady,
    sendIntent,
    addBot,
    removeBot,
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
        onLeave={leaveSession}
      />
    ) : room && myLobbyId ? (
      <WaitingRoom
        room={room}
        myLobbyId={myLobbyId}
        onToggleReady={setReady}
        onAddBot={addBot}
        onRemoveBot={removeBot}
        onLeave={leaveSession}
      />
    ) : (
      <LandingScreen onCreate={createRoom} onJoin={joinRoom} error={error} onDismissError={clearError} />
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
