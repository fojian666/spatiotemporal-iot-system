import { prefersReducedMotion } from '../motion';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

export function AtomVisual({ caption, className = '' }: { caption?: string; className?: string }) {
  const atomRef = useRef<HTMLDivElement | null>(null);

  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (prefersReducedMotion()) return;
    const node = atomRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty('--atom-tilt-x', `${(-y * 7).toFixed(2)}deg`);
    node.style.setProperty('--atom-tilt-y', `${(x * 9).toFixed(2)}deg`);
  };

  const reset = () => {
    const node = atomRef.current;
    if (!node) return;
    node.style.setProperty('--atom-tilt-x', '0deg');
    node.style.setProperty('--atom-tilt-y', '0deg');
  };

  const handleOut = (event: ReactPointerEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    reset();
  };

  return (
    <div
      className={`auth-atom ${className}`.trim()}
      ref={atomRef}
      onPointerMove={handleMove}
      onPointerOut={handleOut}
      onPointerLeave={reset}
      onPointerCancel={reset}
      aria-hidden="true"
    >
      <div className="auth-atom__stage">
        <div className="auth-atom__cage">
          <span className="auth-atom__orbit auth-atom__orbit--a">
            <i className="auth-atom__ring" />
            <span className="auth-atom__shell">
              <i className="auth-atom__trail" />
              <i className="auth-atom__electron" />
            </span>
          </span>
          <span className="auth-atom__orbit auth-atom__orbit--b">
            <i className="auth-atom__ring" />
            <span className="auth-atom__shell">
              <i className="auth-atom__trail" />
              <i className="auth-atom__electron" />
            </span>
            <span className="auth-atom__shell auth-atom__shell--lag">
              <i className="auth-atom__trail" />
              <i className="auth-atom__electron" />
            </span>
          </span>
          <span className="auth-atom__orbit auth-atom__orbit--c">
            <i className="auth-atom__ring" />
            <span className="auth-atom__shell">
              <i className="auth-atom__trail" />
              <i className="auth-atom__electron" />
            </span>
          </span>
          <span className="auth-atom__core">
            <i className="auth-atom__nucleon" />
            <i className="auth-atom__nucleon" />
            <i className="auth-atom__nucleon" />
            <i className="auth-atom__nucleon" />
            <i className="auth-atom__nucleon" />
            <i className="auth-atom__nucleon" />
          </span>
        </div>
      </div>
      {caption && <em>{caption}</em>}
    </div>
  );
}
