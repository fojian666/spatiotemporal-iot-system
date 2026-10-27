import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ScenarioConfig } from '../data/scenarios';

/** Observe committed state, so rejected requests and telemetry ticks never replay it. */
export function ScenarioFeedback({ scenario }: { scenario: ScenarioConfig }) {
  const previous = useRef(scenario);
  const serial = useRef(0);
  const [change, setChange] = useState<{ from: string; to: string; name: string; serial: number } | null>(null);
  useEffect(() => {
    if (previous.current.key === scenario.key) return;
    setChange({ from: previous.current.color, to: scenario.color, name: scenario.name, serial: ++serial.current });
    previous.current = scenario;
  }, [scenario]);
  useEffect(() => {
    if (!change) return;
    const timer = window.setTimeout(() => setChange(null), 1800);
    return () => window.clearTimeout(timer);
  }, [change]);
  return createPortal(
    <div className="scenario-feedback-region" role="status" aria-live="polite" aria-atomic="true">
      {change && <div key={change.serial} className="scenario-feedback" style={{ '--from-color': change.from, '--to-color': change.to } as CSSProperties}>
        <span className="scenario-feedback__track" aria-hidden="true"><i /><i /></span>
        <span>场景已切换 · <strong>{change.name}</strong></span>
      </div>}
    </div>, document.body,
  );
}
