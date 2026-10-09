import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { ActiveSessionsProvider } from './contexts/ActiveSessionsContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import NotificationsPage from './pages/NotificationsPage';
import ToolsPage from './pages/ToolsPage';
import StudentsPage from './pages/StudentsPage';
import LogsPage from './pages/LogsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAdminAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { token } = useAdminAuth();
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/dashboard/notifications" replace /> : <LoginPage initialTab="signin" />} />
      <Route path="/register" element={token ? <Navigate to="/dashboard/notifications" replace /> : <LoginPage initialTab="signup" />} />
      <Route path="/signup" element={token ? <Navigate to="/dashboard/notifications" replace /> : <LoginPage initialTab="signup" />} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="notifications" replace />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="tools" element={<ToolsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={token ? '/dashboard/notifications' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <ActiveSessionsProvider>
        <AppRoutes />
      </ActiveSessionsProvider>
    </AdminAuthProvider>
  );
}

