import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/base.css';
import './styles/map.css';
import './styles/pages.css';
import './styles/copilot.css';
import './styles/auth.css';
import './styles/drone.css';
import './styles/theme.css';
import './styles/responsive.css';
import App from './App';
import { AuthGate, AuthProvider } from './components/AuthProvider';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <AuthGate>
      <App />
    </AuthGate>
  </AuthProvider>,
);
