import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { playErrorBuzz } from '../sound';
import type {
  ActionPayload,
  ClientToServerEvents,
  GameEvent,
  GameMode,
  MatchResult,
  RoomSummary,
  SanitizedGameState,
  ServerToClientEvents,
} from '../types';

// In dev, the client (Vite, :5173) and server (:3001) are different origins. In production the
// server also serves the built client (see src/server/staticClient.ts), so the socket should
// just connect to whatever origin served the page — undefined tells socket.io-client to do that.
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : undefined;
const STORAGE_KEY = 'bigdeal:session';
const MAX_RECENT_EVENTS = 50;

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface StoredSession {
  roomId: string;
  lobbyId: string;
  reconnectToken: string;
  name: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function useGameConnection() {
  const socketRef = useRef<ClientSocket | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [game, setGame] = useState<SanitizedGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<GameEvent[]>([]);
  const [myName, setMyName] = useState<string>(loadSession()?.name ?? '');
  const [myLobbyId, setMyLobbyId] = useState<string | null>(loadSession()?.lobbyId ?? null);
  const [isSpectating, setIsSpectating] = useState(false);

  useEffect(() => {
    const socket: ClientSocket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      const saved = loadSession();
      if (saved) {
        socket.emit('room:reconnect', saved, (result) => {
          if (!result.ok) {
            clearStoredSession();
            setMyLobbyId(null);
            setError(`重新連線失敗:${result.error}`);
          }
        });
      }
    });

    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('room:state', (summary) => setRoom(summary));
    socket.on('game:state', (state) => setGame(state));
    socket.on('game:events', (events) => {
      setRecentEvents((prev) => [...prev, ...events].slice(-MAX_RECENT_EVENTS));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:create', { playerName: name }, (result) => {
        if (!result.ok) {
          setError(result.error);
          resolve();
          return;
        }
        saveSession({ ...result.data, name });
        setMyName(name);
        setMyLobbyId(result.data.lobbyId);
        setError(null);
        resolve();
      });
    });
  }, []);

  const joinRoom = useCallback((roomId: string, name: string) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:join', { roomId, playerName: name }, (result) => {
        if (!result.ok) {
          setError(result.error);
          resolve();
          return;
        }
        saveSession({ ...result.data, name });
        setMyName(name);
        setMyLobbyId(result.data.lobbyId);
        setError(null);
        resolve();
      });
    });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:ready', { ready }, (result) => {
        if (!result.ok) setError(result.error);
        resolve();
      });
    });
  }, []);

  const sendIntent = useCallback((action: ActionPayload) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('game:intent', { action }, (result) => {
        if (!result.ok) {
          setError(result.error);
          playErrorBuzz();
        }
        resolve();
      });
    });
  }, []);

  const setMode = useCallback((mode: GameMode) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:setMode', { mode }, (result) => {
        if (!result.ok) setError(result.error);
        resolve();
      });
    });
  }, []);

  const addBot = useCallback((level: 1 | 2 | 3) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:addBot', { level }, (result) => {
        if (!result.ok) setError(result.error);
        resolve();
      });
    });
  }, []);

  const spectateRoom = useCallback((roomId: string) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:spectate', { roomId }, (result) => {
        if (!result.ok) {
          setError(result.error);
          resolve();
          return;
        }
        setIsSpectating(true);
        setError(null);
        resolve();
      });
    });
  }, []);

  const getHistory = useCallback((roomId: string) => {
    return new Promise<MatchResult[]>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve([]);
        return;
      }
      socket.emit('room:history', { roomId }, (result) => {
        resolve(result.ok ? result.data.history : []);
      });
    });
  }, []);

  const removeBot = useCallback((botLobbyId: string) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve();
        return;
      }
      socket.emit('room:removeBot', { botLobbyId }, (result) => {
        if (!result.ok) setError(result.error);
        resolve();
      });
    });
  }, []);

  const leaveSession = useCallback(() => {
    clearStoredSession();
    setRoom(null);
    setGame(null);
    setRecentEvents([]);
    setMyName('');
    setMyLobbyId(null);
    setIsSpectating(false);
    socketRef.current?.disconnect();
    socketRef.current?.connect();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    room,
    game,
    error,
    recentEvents,
    myName,
    myLobbyId,
    isSpectating,
    // The server stamps every sanitized state with the viewer it was built for — the single
    // source of truth for "which seat am I" once the game has started.
    myGamePlayerId: game?.viewerPlayerId ?? null,
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
  };
}
