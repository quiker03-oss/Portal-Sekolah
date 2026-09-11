import React, { useState } from 'react';
import { db } from '../../services/database';
import { SuperAdminUser } from '../../types';
import { ShieldCheck, Lock, User as UserIcon, Eye, EyeOff, ArrowRight, ArrowLeft, KeyRound, AlertTriangle } from 'lucide-react';

interface SuperAdminLoginProps {
  onLoginSuccess: (user: SuperAdminUser) => void;
  onExit: () => void;
}

export const SuperAdminLogin: React.FC<SuperAdminLoginProps> = ({
  onLoginSuccess,
  onExit,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      const res = db.verifySuperAdminLogin(username, password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'Autentikasi Super Admin gagal. Periksa username dan kata sandi.');
        setIsLoading(false);
      }
    }, 200);
  };

  const handleFillDemo = () => {
    const sa = db.getSuperAdminUser();
    setUsername(sa.username);
    setPassword(sa.password);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-indigo-600 selection:text-white relative">
      {/* Top back button */}
      <div className="absolute top-5 left-5 z-10">
        <button
          id="btn-sa-exit-to-home"
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-all hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Halaman Depan</span>
        </button>
      </div>

      <div className="w-full max-w-md mx-auto">
        {/* Card Container */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 mb-4 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="inline-block px-3 py-1 mb-2 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
              Sistem Pengelola Pusat
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Login Super Admin
            </h1>
            <p className="mt-1.5 text-xs text-slate-400 max-w-xs mx-auto">
              Portal otorisasi khusus untuk mengelola akun sekolah, reset password, dan hak akses multi-sekolah.
            </p>
          </div>

          {/* Security Notice */}
          <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <div className="leading-relaxed">
              <span className="font-semibold text-amber-200">Akses Terbatas: </span>
              Hanya diperuntukkan bagi Administrator Pusat. Guru dan Operator sekolah silakan masuk melalui portal login sekolah.
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Username Super Admin
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  id="input-sa-username"
                  type="text"
                  required
                  placeholder="Masukkan username superadmin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9.5 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="input-sa-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9.5 pr-10 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="btn-sa-submit-login"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              {isLoading ? (
                <span>Memverifikasi Otoritas...</span>
              ) : (
                <>
                  <span>Masuk ke Konsol Super Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Fill */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <button
              id="btn-sa-quick-fill"
              type="button"
              onClick={handleFillDemo}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium py-1 px-2.5 rounded-lg hover:bg-indigo-950/50 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Gunakan Kredensial Default Super Admin</span>
            </button>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center text-xs text-slate-500">
          Super Admin Console &copy; 2026. Data dan otorisasi terisolasi dari operasional sekolah.
        </div>
      </div>
    </div>
  );
};
