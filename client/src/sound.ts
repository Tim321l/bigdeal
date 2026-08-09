// Synthesized chimes via the Web Audio API — no external audio assets, so no licensing to worry
// about. Browsers block audio before any user gesture; since these only ever fire in reaction to
// a click somewhere upstream (creating/joining a room, readying up, playing a card), the context
// is already unlocked by the time a game event needs to play.
let audioContext: AudioContext | null = null;

const MUTE_STORAGE_KEY = 'bigdeal:muted';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = loadMuted();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Private-browsing/storage-denied — muting still works for this tab, just doesn't persist.
  }
}

function getAudioContext(): AudioContext | null {
  if (muted) return null;
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  gainValue = 0.15,
  type: OscillatorType = 'sine',
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/** A short two-note chime for a newly-triggered macro event. */
export function playEventChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 587.33, now, 0.18); // D5
  playTone(ctx, 880, now + 0.12, 0.25); // A5
}

/** A short ascending fanfare for winning the game. */
export function playWinFanfare(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => playTone(ctx, freq, now + i * 0.12, 0.3, 0.18));
}

/** A short click for playing a card from hand. */
export function playCardSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 660, ctx.currentTime, 0.08, 0.12);
}

/** A quick four-beat tumble for rolling the die (REAL_BIG_DEAL). */
export function playDiceSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const beats = [220, 330, 262, 392];
  beats.forEach((freq, i) => playTone(ctx, freq, now + i * 0.06, 0.05, 0.1, 'triangle'));
}

/** A bright ascending chime for banking a card, collecting rent, or buying a tile. */
export function playCashSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 784, now, 0.1, 0.14);
  playTone(ctx, 1046.5, now + 0.07, 0.16, 0.14);
}

/** A low buzz for a rejected/invalid action. */
export function playErrorBuzz(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 110, ctx.currentTime, 0.25, 0.1, 'sawtooth');
}

/** A gentle two-note ding for "you need to respond now". */
export function playTurnNotify(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 698.46, now, 0.15); // F5
  playTone(ctx, 932.33, now + 0.1, 0.2); // Bb5
}
