// Synthesized chimes via the Web Audio API — no external audio assets, so no licensing to worry
// about. Browsers block audio before any user gesture; since these only ever fire in reaction to
// a click somewhere upstream (creating/joining a room, readying up, playing a card), the context
// is already unlocked by the time a game event needs to play.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, gainValue = 0.15): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
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
