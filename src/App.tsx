import React, { useState, useEffect } from 'react';
import { db } from './services/database';
import { User } from './types';
import { PortalLogin } from './components/PortalLogin';
import { AdminLayout } from './components/admin/AdminLayout';
import { SuperAdminLogin } from './components/superadmin/SuperAdminLogin';
import { SuperAdminDashboard } from './components/superadmin/SuperAdminDashboard';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

const isSuperAdminUrl = () => {
  if (typeof window === 'undefined') return false;
  const hash = (window.location.hash || '').toLowerCase();
  const path = (window.location.pathname || '').toLowerCase();
  const search = (window.location.search || '').toLowerCase();

  return (
    hash === '#superadmin' ||
    hash === '#super-admin' ||
    hash.startsWith('#superadmin') ||
    hash.startsWith('#super-admin') ||
    path === '/superadmin' ||
    path === '/super-admin' ||
    path.startsWith('/superadmin') ||
    path.startsWith('/super-admin') ||
    search.includes('superadmin=true') ||
    search.includes('role=superadmin')
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(db.getCurrentUser());

  // Super Admin view & auth state
  const [isSuperAdminRoute, setIsSuperAdminRoute] = useState<boolean>(() => isSuperAdminUrl());
  const [isSuperAdminAuth, setIsSuperAdminAuth] = useState<boolean>(() => db.isSuperAdminLoggedIn());
  const [isSuperAdminPreviewSchool, setIsSuperAdminPreviewSchool] = useState<boolean>(false);

  useEffect(() => {
    const handleAuthChange = () => {
      setCurrentUser(db.getCurrentUser());
    };
    window.addEventListener('auth_state_changed', handleAuthChange);
    return () => window.removeEventListener('auth_state_changed', handleAuthChange);
  }, []);

  useEffect(() => {
    const handleLocationOrAuthChange = () => {
      const isSA = isSuperAdminUrl();
      const hasSession = db.isSuperAdminLoggedIn();
      if (isSA) {
        setIsSuperAdminRoute(true);
      }
      setIsSuperAdminAuth(hasSession);
    };

    window.addEventListener('hashchange', handleLocationOrAuthChange);
    window.addEventListener('popstate', handleLocationOrAuthChange);
    window.addEventListener('superadmin_auth_changed', handleLocationOrAuthChange);

    return () => {
      window.removeEventListener('hashchange', handleLocationOrAuthChange);
      window.removeEventListener('popstate', handleLocationOrAuthChange);
      window.removeEventListener('superadmin_auth_changed', handleLocationOrAuthChange);
    };
  }, []);

  const handleLoginSuccess = (user: User) => {
    db.setCurrentUser(user);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    db.logout();
    setCurrentUser(null);
  };

  const handleSuperAdminLoginSuccess = () => {
    setIsSuperAdminAuth(true);
    setIsSuperAdminRoute(true);
    setIsSuperAdminPreviewSchool(false);
  };

  const handleSuperAdminLogout = () => {
    db.superAdminLogout();
    setIsSuperAdminAuth(false);
    setIsSuperAdminRoute(false);
    setIsSuperAdminPreviewSchool(false);
    if (window.location.hash.includes('superadmin') || window.location.hash.includes('super-admin')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleSuperAdminExit = () => {
    if (isSuperAdminAuth) {
      setIsSuperAdminPreviewSchool(true);
    } else {
      setIsSuperAdminPreviewSchool(false);
    }
    setIsSuperAdminRoute(false);
    if (window.location.hash.includes('superadmin') || window.location.hash.includes('super-admin')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleBackToSuperAdmin = () => {
    setIsSuperAdminPreviewSchool(false);
    setIsSuperAdminRoute(true);
    window.location.hash = '#superadmin';
  };

  // 1. Super Admin View
  if ((isSuperAdminAuth && !isSuperAdminPreviewSchool) || (isSuperAdminRoute && isSuperAdminAuth)) {
    return (
      <ErrorBoundary fallbackTitle="Kendala pada Dasbor Super Admin">
        <SuperAdminDashboard
          onLogout={handleSuperAdminLogout}
          onViewSchoolWebsite={handleSuperAdminExit}
        />
      </ErrorBoundary>
    );
  }

  // 2. Super Admin Login Page (Direct route when not logged in)
  if (isSuperAdminRoute && !isSuperAdminAuth) {
    return (
      <ErrorBoundary fallbackTitle="Kendala pada Halaman Login Super Admin">
        <SuperAdminLogin
          onLoginSuccess={handleSuperAdminLoginSuccess}
          onExit={handleSuperAdminExit}
        />
      </ErrorBoundary>
    );
  }

  // 3. School Operator / Admin Dashboard View (When Logged In)
  if (currentUser) {
    return (
      <ErrorBoundary fallbackTitle="Kendala pada Panel Sekolah">
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white relative">
          {isSuperAdminAuth && isSuperAdminPreviewSchool && (
            <div className="bg-indigo-900 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md sticky top-0 z-50">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 text-indigo-300" />
                <span>Mode Super Administrator Aktif &bull; Sedang Meninjau Dasbor Sekolah</span>
              </div>
              <button
                onClick={handleBackToSuperAdmin}
                className="bg-indigo-700 hover:bg-indigo-600 text-white font-semibold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Konsol Super Admin</span>
              </button>
            </div>
          )}
          <AdminLayout
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        </div>
      </ErrorBoundary>
    );
  }

  // 4. Portal Sekolah Login View (Main unauthenticated screen)
  return (
    <ErrorBoundary fallbackTitle="Kendala pada Portal Sekolah">
      <div className="relative">
        {isSuperAdminAuth && isSuperAdminPreviewSchool && (
          <div className="bg-indigo-900 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md sticky top-0 z-50">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-indigo-300" />
              <span>Sesi Super Admin Aktif</span>
            </div>
            <button
              onClick={handleBackToSuperAdmin}
              className="bg-indigo-700 hover:bg-indigo-600 text-white font-semibold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Buka Konsol Super Admin</span>
            </button>
          </div>
        )}
        <PortalLogin
          onLoginSuccess={handleLoginSuccess}
          onNavigateToSuperAdmin={() => {
            setIsSuperAdminRoute(true);
            setIsSuperAdminPreviewSchool(false);
            window.location.hash = '#superadmin';
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
