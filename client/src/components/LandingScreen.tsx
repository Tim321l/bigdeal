import { useState } from 'react';

interface LandingScreenProps {
  onCreate: (name: string) => void;
  onJoin: (roomId: string, name: string) => void;
  error: string | null;
  onDismissError: () => void;
}

export function LandingScreen({ onCreate, onJoin, error, onDismissError }: LandingScreenProps) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

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
      </div>
    </div>
  );
}
