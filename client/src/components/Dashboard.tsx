import { useCallback, useEffect, useState } from 'react';
import type { AdminRoomSummary, GameMode } from '../types';

// Same dev/prod split as useGameConnection's socket URL — in dev, Vite serves the client on 5173
// while the actual server (and this dashboard's data) lives on 3001; in production both are the
// same origin, so a relative path is correct there.
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

const GAME_MODE_LABELS: Record<GameMode, string> = {
  CLASSIC: '經典模式',
  BATTLE_ROYALE: '大逃殺',
  SYNDICATE: '2v2 雙打',
  AUCTION_DRAFT: '暗標拍賣',
  BOSS_RAID: '金融風暴 PVE',
  REAL_BIG_DEAL: '真實大地產',
};

const STATUS_LABELS: Record<AdminRoomSummary['status'], string> = {
  LOBBY: '等待中',
  IN_PROGRESS: '遊戲中',
  FINISHED: '已完結',
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-HK', { hour12: false });
}

/** Server admin dashboard — lists every live room with each player's name/IP/connection status,
 * and lets the operator kick a player or force-close a room. No login: this only ever shows what
 * a trusted operator running the server already has access to (matches the rest of this
 * unauthenticated dev-only server) — don't put this behind a public URL without adding one. */
export function Dashboard() {
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/rooms`);
      if (!response.ok) throw new Error(`Failed to fetch rooms: ${response.statusText}`);
      const data: AdminRoomSummary[] = await response.json();
      setRooms(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchRooms();
    const interval = setInterval(() => void fetchRooms(), 5000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const kickPlayer = async (roomId: string, lobbyId: string, name: string): Promise<void> => {
    if (!window.confirm(`踢走「${name}」?`)) return;
    setBusyKey(`kick-${lobbyId}`);
    try {
      const response = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}/kick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lobbyId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to kick player: ${response.statusText}`);
      }
      await fetchRooms();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
    } finally {
      setBusyKey(null);
    }
  };

  const closeRoom = async (roomId: string): Promise<void> => {
    if (!window.confirm(`關閉房間「${roomId}」?入面所有人都會被踢走。`)) return;
    setBusyKey(`close-${roomId}`);
    try {
      const response = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to close room: ${response.statusText}`);
      }
      await fetchRooms();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
    } finally {
      setBusyKey(null);
    }
  };

  const totalPlayers = rooms.reduce((sum, r) => sum + r.players.length, 0);

  return (
    <div className="dashboard">
      <h1>伺服器儀表板</h1>
      <p>
        目前有 {rooms.length} 個活躍房間,{totalPlayers} 位玩家。
      </p>
      {error && <div className="banner banner--error">{error}</div>}
      {rooms.length === 0 ? (
        <p className="field-empty">而家冇任何房間。</p>
      ) : (
        <div className="dashboard__rooms">
          {rooms.map((room) => (
            <section key={room.id} className="dashboard-room">
              <div className="dashboard-room__header">
                <h2>
                  <a href={`/?room=${room.id}`} target="_blank" rel="noopener noreferrer">
                    {room.id}
                  </a>
                </h2>
                <span className={`badge dashboard-room__status--${room.status.toLowerCase()}`}>
                  {STATUS_LABELS[room.status]}
                </span>
                <span className="dashboard-room__meta">{GAME_MODE_LABELS[room.mode]}</span>
                <span className="dashboard-room__meta">建立於 {formatTime(room.createdAt)}</span>
                {room.spectatorCount > 0 && <span className="dashboard-room__meta">👁️ {room.spectatorCount} 人旁觀</span>}
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  disabled={busyKey === `close-${room.id}`}
                  onClick={() => void closeRoom(room.id)}
                >
                  關閉房間
                </button>
              </div>
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>玩家</th>
                    <th>IP</th>
                    <th>狀態</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {room.players.map((player) => (
                    <tr key={player.lobbyId}>
                      <td>
                        {player.bot ? '🤖 ' : ''}
                        {player.name}
                        {player.lobbyId === room.hostLobbyId ? ' 👑' : ''}
                      </td>
                      <td>{player.bot ? '—' : (player.ip ?? '—')}</td>
                      <td>
                        <span className={`status-dot${player.connected ? ' status-dot--online' : ' status-dot--offline'}`} />
                        {player.connected ? '已連線' : '斷咗線'}
                        {room.status === 'LOBBY' ? (player.ready ? ' · 已 Ready' : ' · 未 Ready') : ''}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={busyKey === `kick-${player.lobbyId}`}
                          onClick={() => void kickPlayer(room.id, player.lobbyId, player.name)}
                        >
                          踢走
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
