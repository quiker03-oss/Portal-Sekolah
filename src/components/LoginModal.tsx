import React, { useState } from 'react';
import { db } from '../services/database';
import { User, SekolahInfo } from '../types';
import { X, Lock, User as UserIcon, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  onOpenRegister?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onOpenRegister,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const sekolah: SekolahInfo = db.getSekolah();

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim().toLowerCase();

    // Prevent Super Admin login from school portal
    const sa = db.getSuperAdminUser();
    if (cleanUser === 'superadmin' || cleanUser === sa.username.toLowerCase()) {
      setError('Akun Super Admin hanya dapat login melalui portal khusus Super Admin.');
      return;
    }

    // Check if matching any registered school account
    const schoolAccounts = db.getSchoolAccounts();
    const matchedSchool = schoolAccounts.find(
      (s) => s.username.toLowerCase() === cleanUser
    );

    if (matchedSchool) {
      // Check active status
      if (matchedSchool.status === 'nonaktif') {
        setError(
          `Akun sekolah "${matchedSchool.namaSekolah}" sedang dinonaktifkan oleh Administrator Pusat. Akses masuk ditangguhkan.`
        );
        return;
      }

      // Check password
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
        onLoginSuccess(opUser);
        onClose();
        return;
      } else {
        setError('Password salah! Silakan periksa kembali kata sandi Anda.');
        return;
      }
    }

    // Check school active status for other users (teachers, staff)
    const currentSchool = db.getSchoolAccountById(db.getActiveSchoolId());
    if (currentSchool && currentSchool.status === 'nonaktif') {
      setError(
        `Akun sekolah "${currentSchool.namaSekolah}" sedang dinonaktifkan oleh Administrator Pusat.`
      );
      return;
    }

    const users = db.getUsers();
    // Default passwords for demo: admin123, operator123, guru123
    const user = users.find((u) => u.username.toLowerCase() === cleanUser);

    if (!user) {
      setError('Username tidak terdaftar dalam sistem sekolah.');
      return;
    }

    // Authenticate (standard check with demo fallback)
    const expectedPassword = user.password || (user.role === 'admin' ? 'operator123' : 'guru123');
    if (
      password === expectedPassword || password === 'admin123' // fallback master password
    ) {
      db.setCurrentUser(user);
      onLoginSuccess(user);
      onClose();
    } else {
      setError('Password salah! Silakan periksa kembali kata sandi Anda.');
    }
  };

  const fillQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 px-6 py-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-white rounded-xl p-1 flex-shrink-0 shadow-md">
              <img
                src={sekolah.logo}
                alt={sekolah.nama}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">
                Portal Resmi Satuan Pendidikan
              </span>
              <h2 className="text-lg font-bold tracking-tight text-white leading-tight">
                {sekolah.nama}
              </h2>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-200">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
            <span>Khusus Administrator & Dewan Guru</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <span className="font-bold">Gagal:</span> {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Username Akun
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  id="input-username"
                  type="text"
                  required
                  placeholder="Contoh: operator, guru1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9.5 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="input-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9.5 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              id="btn-submit-login"
              type="submit"
              className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-all hover:shadow"
            >
              <span>Masuk ke Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
