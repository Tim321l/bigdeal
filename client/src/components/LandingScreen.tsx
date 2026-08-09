import { useState } from 'react';

interface LandingScreenProps {
  onCreate: (name: string) => void;
  onJoin: (roomId: string, name: string) => void;
  onSpectate: (roomId: string) => void;
  error: string | null;
  onDismissError: () => void;
}

/** A shared room link (?room=CODE) lands here straight into the join form with the code
 * prefilled — the visitor still has to type their own name, but doesn't have to hunt for or
 * retype the room code. */
function roomCodeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
}

export function LandingScreen({ onCreate, onJoin, onSpectate, error, onDismissError }: LandingScreenProps) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(roomCodeFromUrl);
  const [mode, setMode] = useState<'create' | 'join'>(() => (roomCodeFromUrl() ? 'join' : 'create'));

  const canSubmit = name.trim().length > 0 && (mode === 'create' || roomCode.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    if (mode === 'create') onCreate(name.trim());
    else onJoin(roomCode.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="landing">
      <h1>大富翁地產大亨</h1>
      <p className="landing__subtitle">香港主題 Monopoly Deal · 動態隨機事件</p>

      {error && (
        <div className="banner banner--error">
          {error}
          <button type="button" className="banner__close" onClick={onDismissError}>
            ×
          </button>
        </div>
      )}

      <div className="landing__tabs">
        <button
          type="button"
          className={mode === 'create' ? 'tab tab--active' : 'tab'}
          onClick={() => setMode('create')}
        >
          開新房
        </button>
        <button type="button" className={mode === 'join' ? 'tab tab--active' : 'tab'} onClick={() => setMode('join')}>
          加入房間
        </button>
      </div>

      <div className="landing__form">
        <label>
          你嘅名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="輸入名稱"
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        {mode === 'join' && (
          <label>
            房間號碼
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="例如 A3F9K2"
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
        )}
        <button type="button" className="btn btn--primary btn--block" disabled={!canSubmit} onClick={submit}>
          {mode === 'create' ? '開新房間' : '加入房間'}
        </button>
        {mode === 'join' && (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            disabled={roomCode.trim().length === 0}
            onClick={() => onSpectate(roomCode.trim().toUpperCase())}
          >
            👁️ 淨係旁觀(唔使打名)
          </button>
        )}
      </div>
    </div>
  );
}
