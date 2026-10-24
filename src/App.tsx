import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { SimulationProvider } from './engine/simulation';
import { CopilotPage } from './pages/Copilot';
import { GeoMapPage } from './pages/GeoMap';
import { KnowledgeGraphPage } from './pages/KnowledgeGraph';
import { OverviewPage } from './pages/Overview';
import { DroneOpsPage } from './pages/DroneOps';
import { PlatformPage } from './pages/Platform';
import { SimulationPage } from './pages/Simulation';

export default function App() {
  return (
    <HashRouter>
      <SimulationProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/drone" element={<DroneOpsPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/map" element={<GeoMapPage />} />
            <Route path="/graph" element={<KnowledgeGraphPage />} />
            <Route path="/copilot" element={<CopilotPage />} />
            <Route path="/platform" element={<PlatformPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </SimulationProvider>
    </HashRouter>
  );
}
