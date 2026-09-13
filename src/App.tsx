import React, { useState, useEffect } from 'react';
import { db } from './services/database';
import { User } from './types';
import { PortalLogin } from './components/PortalLogin';
import { AdminLayout } from './components/admin/AdminLayout';
import { SuperAdminLogin } from './components/superadmin/SuperAdminLogin';
import { SuperAdminDashboard } from './components/superadmin/SuperAdminDashboard';
import { ErrorBoundary } from './components/common/ErrorBoundary';

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
      setIsSuperAdminRoute(isSA);
      setIsSuperAdminAuth(db.isSuperAdminLoggedIn());
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
  };

  const handleSuperAdminLogout = () => {
    db.superAdminLogout();
    setIsSuperAdminAuth(false);
    setIsSuperAdminRoute(false);
    if (window.location.hash.includes('superadmin') || window.location.hash.includes('super-admin')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleSuperAdminExit = () => {
    setIsSuperAdminRoute(false);
    if (window.location.hash.includes('superadmin') || window.location.hash.includes('super-admin')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  // 1. Super Admin View (Isolated URL Access)
  if (isSuperAdminRoute) {
    if (isSuperAdminAuth) {
      return (
        <ErrorBoundary fallbackTitle="Kendala pada Dasbor Super Admin">
          <SuperAdminDashboard
            onLogout={handleSuperAdminLogout}
            onViewSchoolWebsite={handleSuperAdminExit}
          />
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary fallbackTitle="Kendala pada Halaman Login Super Admin">
        <SuperAdminLogin
          onLoginSuccess={handleSuperAdminLoginSuccess}
          onExit={handleSuperAdminExit}
        />
      </ErrorBoundary>
    );
  }

  // 2. School Operator / Admin Dashboard View (When Logged In)
  if (currentUser) {
    return (
      <ErrorBoundary fallbackTitle="Kendala pada Panel Sekolah">
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
          <AdminLayout
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        </div>
      </ErrorBoundary>
    );
  }

  // 3. Portal Sekolah Login View (Main unauthenticated screen)
  return (
    <ErrorBoundary fallbackTitle="Kendala pada Portal Sekolah">
      <PortalLogin onLoginSuccess={handleLoginSuccess} />
    </ErrorBoundary>
  );
}
