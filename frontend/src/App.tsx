import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

import { ThemeProvider } from './state/theme';
import { AuthProvider, useAuth } from './state/auth';
import Shell from './components/Shell';

import Landing from './pages/Landing.tsx';
import VoterPortal from './pages/VoterPortal.tsx';
import Admin from './pages/Admin.tsx';

function RedirectBySession() {
  const { voterToken } = useAuth();
  return <Navigate to={voterToken ? '/voter' : '/'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Shell>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/voter" element={<VoterPortal />} />
              <Route path="/verify" element={<Navigate to="/voter" replace />} />
              <Route path="/vote" element={<Navigate to="/voter" replace />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<RedirectBySession />} />
            </Routes>
          </AnimatePresence>
        </Shell>
      </AuthProvider>
    </ThemeProvider>
  );
}
