import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../services/database';
import { User } from '../types';
import {
  X,
  UserPlus,
  Building2,
  Lock,
  User as UserIcon,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface RegisterOperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
  onRegisterSuccess: (user: User) => void;
}

export const RegisterOperatorModal: React.FC<RegisterOperatorModalProps> = ({
  isOpen,
  onClose,
  onSwitchToLogin,
  onRegisterSuccess,
}) => {
  const [name, setName] = useState('');
  const [namaSekolah, setNamaSekolah] = useState('');
  const [npsn, setNpsn] = useState('');
  const [noWa, setNoWa] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successUser, setSuccessUser] = useState<User | null>(null);

  if (!isOpen) return null;

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!name.trim()) {
      setError('Nama lengkap operator wajib diisi.');
      return;
    }
    if (!namaSekolah.trim()) {
      setError('Nama sekolah / satuan pendidikan wajib diisi.');
      return;
    }
    if (!username.trim()) {
      setError('Username akun wajib diisi.');
      return;
    }
    if (password.length < 5) {
      setError('Kata sandi minimal 5 karakter demi keamanan.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok. Mohon periksa kembali.');
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    const existingUsers = db.getUsers();

    if (existingUsers.some((u) => u.username.toLowerCase() === cleanUser)) {
      setError(`Username "${cleanUser}" sudah digunakan sekolah/operator lain. Silakan pilih username unik.`);
      return;
    }

    const newOperator: User = {
      id: `operator_${Date.now()}`,
      username: cleanUser,
      password: password,
      name: name.trim(),
      role: 'admin',
      nip: npsn.trim() ? `NPSN: ${npsn.trim()}` : undefined,
    };

    // Save operator user
    db.saveUser(newOperator);

    // Trigger celebration
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    setSuccessUser(newOperator);
  };

  const handleEnterDashboardDirectly = () => {
    if (!successUser) return;
    db.setCurrentUser(successUser);
    onRegisterSuccess(successUser);
    onClose();
  };

  const resetForm = () => {
    setName('');
    setNamaSekolah('');
    setNpsn('');
    setNoWa('');
    setEmail('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccessUser(null);
  };

  const handleCloseModal = () => {
    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 px-6 py-5 text-white relative flex-shrink-0">
          <button
            onClick={handleCloseModal}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 shadow-inner">
              <UserPlus className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                Multi-Sekolah & Akses Satuan Pendidikan
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Pendaftaran Akun Operator Sekolah
              </h2>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {successUser ? (
            /* Success State */
            <div className="text-center py-6 space-y-4 animate-in fade-in">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Pendaftaran Berhasil!
                </h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto mt-1">
                  Akun operator untuk <strong className="text-blue-700">{namaSekolah}</strong> telah berhasil dibuat dan aktif di sistem.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left max-w-sm mx-auto space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Operator:</span>
                  <span className="font-bold text-slate-900">{successUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Username:</span>
                  <span className="font-mono font-bold text-blue-700">{successUser.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hak Akses:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    Admin / Operator Sekolah
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
                <button
                  id="btn-direct-dashboard"
                  onClick={handleEnterDashboardDirectly}
                  className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all"
                >
                  <span>Langsung Masuk Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    handleCloseModal();
                    onSwitchToLogin();
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Buka Form Login
                </button>
              </div>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-900">
                <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p>
                  Setiap sekolah dapat mendaftarkan operator untuk mengelola data siswa, guru, jadwal absensi QR, dan penerbitan e-Rapor secara mandiri.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Data Satuan Pendidikan (Sekolah)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Sekolah / Satuan Pendidikan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-reg-school-name"
                      type="text"
                      required
                      placeholder="Contoh: SD Negeri 1 Cisalak"
                      value={namaSekolah}
                      onChange={(e) => setNamaSekolah(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      NPSN Sekolah (Opsional)
                    </label>
                    <input
                      id="input-reg-npsn"
                      type="text"
                      placeholder="Contoh: 20214567"
                      value={npsn}
                      onChange={(e) => setNpsn(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      No. WhatsApp Operator
                    </label>
                    <input
                      id="input-reg-phone"
                      type="tel"
                      placeholder="Contoh: 08123456789"
                      value={noWa}
                      onChange={(e) => setNoWa(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Akun Masuk Operator</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap Operator <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-reg-name"
                      type="text"
                      required
                      placeholder="Contoh: Budi Santoso, S.Kom"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Username Login yang Diinginkan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-reg-username"
                      type="text"
                      required
                      placeholder="Contoh: operator_sdn1 (tanpa spasi)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kata Sandi (Password) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-reg-password"
                      type="password"
                      required
                      placeholder="Minimal 5 karakter"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Konfirmasi Kata Sandi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-reg-confirm-password"
                      type="password"
                      required
                      placeholder="Ulangi kata sandi"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <button
                  id="btn-submit-register-operator"
                  type="submit"
                  className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all hover:shadow"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Daftarkan Akun Operator Sekarang</span>
                </button>
              </div>

              <div className="text-center pt-2">
                <p className="text-xs text-slate-500">
                  Sudah memiliki akun operator sekolah?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseModal();
                      onSwitchToLogin();
                    }}
                    className="text-blue-700 font-bold hover:underline"
                  >
                    Masuk di sini
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
