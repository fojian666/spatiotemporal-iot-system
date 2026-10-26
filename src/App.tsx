import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { SimulationProvider } from './engine/simulation';

const OverviewPage = lazy(() => import('./pages/Overview').then((m) => ({ default: m.OverviewPage })));
const DroneOpsPage = lazy(() => import('./pages/DroneOps').then((m) => ({ default: m.DroneOpsPage })));
const SimulationPage = lazy(() => import('./pages/Simulation').then((m) => ({ default: m.SimulationPage })));
const GeoMapPage = lazy(() => import('./pages/GeoMap').then((m) => ({ default: m.GeoMapPage })));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraph').then((m) => ({ default: m.KnowledgeGraphPage })));
const CopilotPage = lazy(() => import('./pages/Copilot').then((m) => ({ default: m.CopilotPage })));
const PlatformPage = lazy(() => import('./pages/Platform').then((m) => ({ default: m.PlatformPage })));

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback__label">正在加载模块…</span>
      <div className="route-fallback__skeleton" aria-hidden="true">
        <div className="route-fallback__heading" />
        <div className="route-fallback__metrics"><i /><i /><i /></div>
        <div className="route-fallback__body" />
      </div>
    </div>
  );
}

// 首屏渲染后空闲时预取其余路由，让切换页保持即时（不阻塞首屏小包）。
function useRoutePrefetch() {
  useEffect(() => {
    const prefetch = () => {
      void import('./pages/Overview');
      void import('./pages/DroneOps');
      void import('./pages/Simulation');
      void import('./pages/GeoMap');
      void import('./pages/KnowledgeGraph');
      void import('./pages/Copilot');
      void import('./pages/Platform');
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 1500);
    return () => window.clearTimeout(id);
  }, []);
}

export default function App() {
  useRoutePrefetch();
  return (
    <HashRouter>
      <SimulationProvider>
        <Shell>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/drone" element={<DroneOpsPage />} />
              <Route path="/simulation" element={<SimulationPage />} />
              <Route path="/map" element={<GeoMapPage />} />
              <Route path="/graph" element={<KnowledgeGraphPage />} />
              <Route path="/copilot" element={<CopilotPage />} />
              <Route path="/platform" element={<PlatformPage />} />
              {/* #/welcome 由 AuthGate 渲染整屏欢迎页，这里只兜住 HashRouter 的 * 重定向 */}
              <Route path="/welcome" element={null} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      </SimulationProvider>
    </HashRouter>
  );
}
