// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Suspense, lazy } from 'react';
import { useAuthStore } from './store/authStore';
import { AppLayout } from './components/shared/Layout';
import './styles/globals.css';

import { LoginPage, RegisterPage } from './pages/AuthPage';
import CitizenDashboard from './pages/citizen/CitizenDashboard';
import SubmitProposal from './pages/citizen/SubmitProposal';
import CommunityFeed from './pages/citizen/CommunityFeed';
import AdminDashboard from './pages/admin/AdminDashboard';

const MyProposals = lazy(() => import('./pages/citizen/MyProposals'));
const WalletPage = lazy(() => import('./pages/citizen/WalletPage'));
const NotificationsPage = lazy(() => import('./pages/citizen/NotificationsPage'));
const ProfilePage = lazy(() => import('./pages/citizen/ProfilePage'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-navy/20 border-t-gold rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ roles }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to={['admin','superadmin'].includes(user?.role) ? '/admin' : '/citizen'} replace />;
  }
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

function PublicRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to={['admin','superadmin'].includes(user?.role) ? '/admin' : '/citizen'} replace />;
  }
  return children;
}

function NotFound() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🏛️</div>
      <h1 className="font-display text-3xl font-bold text-navy mb-2">Page Not Found</h1>
      <p className="text-gray-500 mb-6">The page you're looking for doesn't exist.</p>
      <a href="/citizen" className="btn-primary inline-flex">Return to Dashboard</a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { fontFamily: 'Inter, sans-serif', fontSize: '13px', borderRadius: '12px' },
          success: { iconTheme: { primary: '#10B981', secondary: 'white' } },
          error: { iconTheme: { primary: '#EF4444', secondary: 'white' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Navigate to="/citizen" replace />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Citizen */}
        <Route element={<ProtectedRoute roles={['citizen']} />}>
          <Route path="/citizen" element={<CitizenDashboard />} />
          <Route path="/citizen/submit" element={<SubmitProposal />} />
          <Route path="/citizen/feed" element={<CommunityFeed />} />
          <Route path="/citizen/my-proposals" element={<Suspense fallback={<PageLoader />}><MyProposals /></Suspense>} />
          <Route path="/citizen/wallet" element={<Suspense fallback={<PageLoader />}><WalletPage /></Suspense>} />
          <Route path="/citizen/notifications" element={<Suspense fallback={<PageLoader />}><NotificationsPage /></Suspense>} />
          <Route path="/citizen/profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        </Route>

        {/* Admin */}
        <Route element={<ProtectedRoute roles={['admin','superadmin','auditor']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/proposals" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<Suspense fallback={<PageLoader />}><AdminUsers /></Suspense>} />
          <Route path="/admin/analytics" element={<Suspense fallback={<PageLoader />}><AdminAnalytics /></Suspense>} />
          <Route path="/admin/audit" element={<Suspense fallback={<PageLoader />}><AdminAudit /></Suspense>} />
          <Route path="/admin/settings" element={<Suspense fallback={<PageLoader />}><AdminSettings /></Suspense>} />
        </Route>

        <Route path="*" element={<ProtectedRoute roles={['citizen','admin','superadmin','auditor']}><NotFound /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
