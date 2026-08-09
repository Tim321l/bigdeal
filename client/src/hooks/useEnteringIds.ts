import { useEffect, useMemo, useRef } from 'react';

/**
 * Returns the subset of `ids` that are new since the previous render — lets a component briefly
 * apply an entrance-animation class to freshly-added cards (a play, a draw, a steal landing in a
 * new owner's field) without extra state or a re-render loop. Empty on the very first render (a
 * hand/field that already has cards when it first mounts shouldn't animate all of them at once).
 */
export function useEnteringIds(ids: string[]): Set<string> {
  const prevRef = useRef<Set<string> | null>(null);

  const entering = useMemo(() => {
    const prev = prevRef.current;
    if (prev === null) return new Set<string>();
    return new Set(ids.filter((id) => !prev.has(id)));
  }, [ids]);

  useEffect(() => {
    prevRef.current = new Set(ids);
  });

  return entering;
}
