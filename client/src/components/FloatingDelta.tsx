import { useEffect, useRef, useState } from 'react';

interface FloatingDeltaProps {
  value: number;
  children: React.ReactNode;
}

/** Wraps a numeric stat (e.g. a bank total) and briefly pops up a rising "+$XM"/"-$XM" label
 * whenever the value changes — a lightweight visual echo of money moving, without needing to
 * know *why* it changed (banking, rent, a tile purchase — all just show up as a delta here). */
export function FloatingDelta({ value, children }: FloatingDeltaProps) {
  const prevRef = useRef<number | null>(null);
  const [popups, setPopups] = useState<{ key: number; delta: number }[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === null || prev === value) return;

    const delta = value - prev;
    const key = Date.now();
    setPopups((p) => [...p, { key, delta }]);
    const timer = setTimeout(() => setPopups((p) => p.filter((x) => x.key !== key)), 1100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <span className="floating-delta">
      {children}
      {popups.map(({ key, delta }) => (
        <span
          key={key}
          className={`floating-delta__label floating-delta__label--${delta > 0 ? 'positive' : 'negative'}`}
        >
          {delta > 0 ? '+' : ''}${delta}M
        </span>
      ))}
    </span>
  );
}
