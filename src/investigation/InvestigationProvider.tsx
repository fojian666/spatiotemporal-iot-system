import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useSimulation, type AlertItem } from '../engine/simulation';
import type { ScenarioKey } from '../data/scenarios';
import type { InvestigationChat } from './chat';
import { beginInvestigation, INVESTIGATION_KEY, isInvestigationTarget, restoreInvestigation, type Investigation, type InvestigationStep, type InvestigationWindow } from './state';

interface InvestigationContextValue {
  investigation: Investigation | null;
  begin: (alert: AlertItem, scenario: ScenarioKey, referenceAt: number, search?: string) => void;
  end: () => void;
  setWindow: (minutes: InvestigationWindow) => void;
  recordView: (step: InvestigationStep, deviceId: string, path: string, scenario: ScenarioKey) => void;
  readChat: () => InvestigationChat | null;
  saveChat: (caseId: string, chat: InvestigationChat) => void;
}
const Context = createContext<InvestigationContextValue | null>(null);

export function InvestigationProvider({ children }: { children: ReactNode }) {
  const { user, isRemote } = useAuth();
  const owner = isRemote ? `api:${user?.username ?? ''}` : 'local';
  const [investigation, setInvestigation] = useState<Investigation | null>(() => {
    try { return restoreInvestigation(sessionStorage.getItem(INVESTIGATION_KEY), owner); } catch { return null; }
  });
  const chatRef = useRef<{ caseId: string; chat: InvestigationChat } | null>(null);
  const activeRef = useRef(investigation);
  activeRef.current = investigation;
  useEffect(() => {
    try {
      if (investigation) sessionStorage.setItem(INVESTIGATION_KEY, JSON.stringify({ owner, investigation }));
      else sessionStorage.removeItem(INVESTIGATION_KEY);
    } catch { /* Storage may be disabled; the current navigation session still works. */ }
  }, [investigation, owner]);
  useEffect(() => () => {
    // Leaving the authenticated workspace clears tab metadata and in-memory chat.
    try { sessionStorage.removeItem(INVESTIGATION_KEY); } catch { /* storage blocked */ }
  }, []);
  const begin = useCallback((alert: AlertItem, scenario: ScenarioKey, referenceAt: number, search = '') => {
    setInvestigation(current => current?.alertId === alert.id && current.scenarioKey === scenario ? current : beginInvestigation(alert, scenario, referenceAt, search));
  }, []);
  const end = useCallback(() => { chatRef.current = null; setInvestigation(null); }, []);
  const setWindow = useCallback((minutes: InvestigationWindow) => {
    if (![30, 60, 120].includes(minutes)) return;
    setInvestigation(current => current && current.minutes !== minutes ? { ...current, minutes } : current);
  }, []);
  const recordView = useCallback((step: InvestigationStep, deviceId: string, path: string, scenario: ScenarioKey) => {
    if (!isInvestigationTarget(step, path)) return;
    setInvestigation(current => !current || current.scenarioKey !== scenario || current.deviceId !== deviceId || current.visited[step] === path
      ? current : { ...current, visited: { ...current.visited, [step]: path } });
  }, []);
  const readChat = useCallback(() => {
    return chatRef.current?.caseId === activeRef.current?.id ? chatRef.current?.chat ?? null : null;
  }, []);
  const saveChat = useCallback((caseId: string, chat: InvestigationChat) => {
    if (activeRef.current?.id !== caseId) return;
    chatRef.current = { caseId, chat: { ...chat, messages: chat.messages.slice(-40).map(message => ({ ...message, animate: false })) } };
  }, []);
  const value = useMemo(() => ({ investigation, begin, end, setWindow, recordView, readChat, saveChat }), [investigation, begin, end, setWindow, recordView, readChat, saveChat]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInvestigation() {
  const value = useContext(Context);
  if (!value) throw new Error('useInvestigation must be used inside InvestigationProvider');
  return value;
}

/** A step is recorded after the actual detail page mounts for the investigated device. */
export function useInvestigationView(step: 'map' | 'telemetry', deviceId: string) {
  const { investigation, recordView } = useInvestigation();
  const location = useLocation();
  const { scenarioKey } = useSimulation();
  useEffect(() => {
    recordView(step, deviceId, `${location.pathname}${location.search}`, scenarioKey);
  }, [recordView, step, deviceId, location.pathname, location.search, investigation?.id, scenarioKey]);
}
