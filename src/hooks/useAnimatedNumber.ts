import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useAnimatedNumber(value: number, duration = 320): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(value)) {
      displayRef.current = value;
      setDisplay(value);
      return undefined;
    }
    const from = displayRef.current;
    if (from === value) return undefined;
    if (duration <= 0 || prefersReducedMotion()) {
      displayRef.current = value;
      setDisplay(value);
      return undefined;
    }

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        displayRef.current = value;
        setDisplay(value);
        frameRef.current = null;
      }
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value, duration]);

  return display;
}
