import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api } from './lib/api';
import AuthPage from './pages/AuthPage';
import DashboardLayout from './layouts/DashboardLayout';
import SetupPage from './pages/SetupPage';
import HomePage from './pages/HomePage';
import DownloadPage from './pages/DownloadPage';
import UsagePage from './pages/UsagePage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Redirect to setup if the student has no active device
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get('/student/devices').then(res => {
      const devices: any[] = res.data;
      const hasActive = devices.some(d => d.status === 'ACTIVE');
      setSetupRequired(!hasActive);
    }).catch(() => setSetupRequired(false));
  }, [token]);

  // Allow the setup page itself to always render
  if (location.pathname === '/dashboard/setup') return <>{children}</>;

  if (setupRequired === null) return null; // Still loading — show nothing (brief flash)
  if (setupRequired) return <Navigate to="/dashboard/setup" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <DashboardLayout />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="download" element={<DownloadPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
