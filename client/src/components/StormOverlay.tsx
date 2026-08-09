import { useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../types';

const STORM_EVENT_IDS = new Set(['black-rainstorm', 'typhoon-signal-8']);
const ACTIVE_DURATION_MS = 4500;
const PARTICLE_COUNT = 140;

interface RainParticle {
  x: number;
  y: number;
  length: number;
  speed: number;
  drift: number;
  opacity: number;
}

/** A brief full-screen weather overlay when 黑色暴雨/八號風球 triggers — a canvas rain-particle
 * system plus a couple of randomized lightning flashes, purely atmospheric. Auto-dismisses on its
 * own (see ACTIVE_DURATION_MS / the storm-overlay-fade CSS animation, kept in sync). */
export function StormOverlay({ events }: { events: GameEvent[] }) {
  const [active, setActive] = useState(false);
  const [lightningKey, setLightningKey] = useState<number | null>(null);
  const prevRef = useRef<GameEvent[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = events;
    const newEvents = events.filter((e) => !prev.includes(e));
    const stormy = newEvents.some((e) => e.type === 'MACRO_EVENT_TRIGGERED' && STORM_EVENT_IDS.has(e.event.id));
    if (!stormy) return;

    setActive(true);
    const timer = setTimeout(() => setActive(false), ACTIVE_DURATION_MS);
    // 1-2 randomized lightning flashes somewhere in the middle of the active window.
    const flashCount = 1 + Math.round(Math.random());
    const flashTimers = Array.from({ length: flashCount }, () =>
      setTimeout(() => setLightningKey(Date.now()), 500 + Math.random() * (ACTIVE_DURATION_MS - 1200)),
    );
    return () => {
      clearTimeout(timer);
      flashTimers.forEach(clearTimeout);
      setLightningKey(null);
    };
  }, [events]);

  useEffect(() => {
    if (!active) return;
    // The canvas rain loop is driven by requestAnimationFrame, not CSS — prefers-reduced-motion
    // can't stop it the way it stops the other effects, so skip spawning it entirely here instead.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const resize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: RainParticle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      length: 12 + Math.random() * 18,
      speed: 6 + Math.random() * 8,
      drift: -1.5 + Math.random(), // slight wind-blown lean, storm flavor rather than straight-down rain
      opacity: 0.15 + Math.random() * 0.35,
    }));

    let frame: number;
    const draw = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(186, 206, 232, 1)';
      ctx.lineWidth = 1.4;
      for (const p of particles) {
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.drift * 4, p.y + p.length);
        ctx.stroke();
        p.x += p.drift;
        p.y += p.speed;
        if (p.y > canvas.height) {
          p.y = -p.length;
          p.x = Math.random() * canvas.width;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="storm-overlay" aria-hidden="true">
      <canvas ref={canvasRef} className="storm-overlay__canvas" />
      {lightningKey !== null && <div key={lightningKey} className="storm-overlay__lightning" />}
    </div>
  );
}
