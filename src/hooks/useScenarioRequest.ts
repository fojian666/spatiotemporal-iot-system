import { useRef, useState } from 'react';
import { useSimulation } from '../engine/simulation';
import type { ScenarioKey } from '../data/scenarios';

export function useScenarioRequest() {
  const { setScenario } = useSimulation();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = async (key: ScenarioKey) => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      if (!await setScenario(key)) setError('场景切换失败，请重试。');
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  return { request, pending, error };
}
