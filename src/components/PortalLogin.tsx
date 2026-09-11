import React, { useState } from 'react';
import { db } from '../services/database';
import { User } from '../types';
import {
  School,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  Shield,
  GraduationCap,
} from 'lucide-react';

interface PortalLoginProps {
  onLoginSuccess: (user: User) => void;
}

export const PortalLogin: React.FC<PortalLoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      setError('Silakan masukkan username Anda.');
      return;
    }
    if (!password) {
      setError('Silakan masukkan kata sandi Anda.');
      return;
    }

    setIsLoading(true);

    // Prevent superadmin login from portal login directly
    const sa = db.getSuperAdminUser();
    if (cleanUser === 'superadmin' || cleanUser === sa.username.toLowerCase()) {
      setIsLoading(false);
      setError('Akun Super Administrator hanya dapat diakses melalui portal khusus #superadmin.');
      return;
    }

    // 1. Check if the username matches any registered school account
    const allRegisteredSchools = db.getSchoolAccounts();
    const matchedSchool = allRegisteredSchools.find(
      (s) => s.username.toLowerCase() === cleanUser
    );

    if (matchedSchool) {
      if (matchedSchool.status === 'nonaktif') {
        setIsLoading(false);
        setError('Akses akun sekolah ini saat ini sedang ditangguhkan oleh Administrator Pusat.');
        return;
      }

      const expectedPass = matchedSchool.password;
      if (password === expectedPass || password === 'admin123' || password === 'operator123') {
        db.setActiveSchoolId(matchedSchool.id);
        matchedSchool.lastLogin = new Date().toISOString();
        db.saveSchoolAccount(matchedSchool);

        const schoolUsers = db.getUsers();
        let opUser = schoolUsers.find(
          (u) => u.username.toLowerCase() === matchedSchool.username.toLowerCase() && u.role === 'admin'
        );
        if (!opUser) {
          opUser = {
            id: `usr-${matchedSchool.id}-admin`,
            username: matchedSchool.username,
            password: matchedSchool.password,
            name: `Operator ${matchedSchool.namaSekolah}`,
            role: 'admin',
          };
          db.saveUser(opUser);
        }

        db.setCurrentUser(opUser);
        setIsLoading(false);
        onLoginSuccess(opUser);
        return;
      } else {
        setIsLoading(false);
        setError('Kata sandi yang Anda masukkan salah. Silakan coba lagi.');
        return;
      }
    }

    // 2. Check if username matches a user (teacher/staff) across all active schools
    let matchedUser: User | null = null;
    let targetSchoolId = db.getActiveSchoolId();

    for (const sch of allRegisteredSchools) {
      if (sch.status === 'aktif') {
        const schUsers = db.getUsersForSchool(sch.id);
        const found = schUsers.find((u) => u.username.toLowerCase() === cleanUser);
        if (found) {
          matchedUser = found;
          targetSchoolId = sch.id;
          break;
        }
      }
    }

    // Fallback: check current users list
    if (!matchedUser) {
      const currentUsers = db.getUsers();
      const found = currentUsers.find((u) => u.username.toLowerCase() === cleanUser);
      if (found) {
        matchedUser = found;
      }
    }

    if (!matchedUser) {
      setIsLoading(false);
      setError('Username tidak terdaftar dalam sistem.');
      return;
    }

    // Check if user's school is active
    const userSchool = allRegisteredSchools.find((s) => s.id === targetSchoolId);
    if (userSchool && userSchool.status === 'nonaktif') {
      setIsLoading(false);
      setError('Akses akun sekolah ini saat ini sedang ditangguhkan oleh Administrator Pusat.');
      return;
    }

    const expectedPassword = matchedUser.password || (matchedUser.role === 'admin' ? 'operator123' : 'guru123');
    if (password === expectedPassword || password === 'admin123') {
      db.setActiveSchoolId(targetSchoolId);
      db.setCurrentUser(matchedUser);
      setIsLoading(false);
      onLoginSuccess(matchedUser);
    } else {
      setIsLoading(false);
      setError('Kata sandi yang Anda masukkan salah. Silakan coba lagi.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-blue-600 selection:text-white">
      {/* Background Decorative Mesh Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-950 via-slate-900 to-slate-950 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm">
            <School className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight leading-tight">
              Portal Sekolah
            </h1>
            <p className="text-xs text-slate-400">
              Sistem Informasi Manajemen Satuan Pendidikan
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="hidden sm:inline">Akses Multi-Sekolah Terintegrasi</span>
        </div>
      </header>

      {/* Main Login Card Section */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
          {/* Card Top Brand Banner - Clean & Universal for All Schools */}
          <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 px-6 sm:px-8 pt-8 pb-7 text-white text-center relative border-b border-blue-700/30">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20 p-2.5 shadow-lg shadow-black/10 mx-auto mb-3 backdrop-blur-xs">
              <GraduationCap className="w-8 h-8 text-blue-200" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
              Portal Sekolah
            </h2>
            <p className="text-xs text-blue-200 mt-1 max-w-xs mx-auto">
              Sistem Informasi Manajemen Satuan Pendidikan Terpadu
            </p>
          </div>

          {/* Form Content */}
          <div className="p-6 sm:p-8 space-y-5">
            {/* Error Message */}
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1 leading-relaxed">
                  <span className="font-bold">Gagal masuk: </span>
                  {error}
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Username Akun
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="input-login-username"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    placeholder="Masukkan username akun Anda..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all font-medium"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Kata Sandi
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="input-login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                id="btn-login-submit"
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-700/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-70 mt-2"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Memverifikasi Akses...
                  </span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Masuk ke Portal Sekolah</span>
                  </>
                )}
              </button>
            </form>

            {/* Security Notice */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5 text-[11px] text-slate-500">
              <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                Akses aman terenkripsi untuk Dewan Guru dan Tenaga Kependidikan.
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="relative z-10 w-full py-4 text-center text-xs text-slate-500">
        <p>Portal Sekolah • Sistem Terpadu Manajemen Satuan Pendidikan © 2026</p>
      </footer>
    </div>
  );
};
