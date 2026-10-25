import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { markWelcomeSeen, navigateReplacingHash } from './auth/welcome';
import { SimulationProvider } from './engine/simulation';

const OverviewPage = lazy(() => import('./pages/Overview').then((m) => ({ default: m.OverviewPage })));
const DroneOpsPage = lazy(() => import('./pages/DroneOps').then((m) => ({ default: m.DroneOpsPage })));
const SimulationPage = lazy(() => import('./pages/Simulation').then((m) => ({ default: m.SimulationPage })));
const GeoMapPage = lazy(() => import('./pages/GeoMap').then((m) => ({ default: m.GeoMapPage })));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraph').then((m) => ({ default: m.KnowledgeGraphPage })));
const CopilotPage = lazy(() => import('./pages/Copilot').then((m) => ({ default: m.CopilotPage })));
const PlatformPage = lazy(() => import('./pages/Platform').then((m) => ({ default: m.PlatformPage })));
const WelcomePage = lazy(() => import('./pages/Welcome').then((m) => ({ default: m.WelcomePage })));

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="overline">LOADING MODULE</span>
      <i />
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
              <Route
                path="/welcome"
                element={
                  <WelcomePage
                    onEnter={(path) => {
                      markWelcomeSeen();
                      navigateReplacingHash(path);
                    }}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      </SimulationProvider>
    </HashRouter>
  );
}
