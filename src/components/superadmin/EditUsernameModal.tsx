import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { SchoolAccount } from '../../types';
import { X, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

interface EditUsernameModalProps {
  isOpen: boolean;
  onClose: () => void;
  school: SchoolAccount | null;
  onSuccess: () => void;
}

export const EditUsernameModal: React.FC<EditUsernameModalProps> = ({
  isOpen,
  onClose,
  school,
  onSuccess,
}) => {
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (school) {
      setNewUsername(school.username);
      setError('');
      setSuccess('');
    }
  }, [school, isOpen]);

  if (!isOpen || !school) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const res = db.updateSchoolUsername(school.id, newUsername);
    if (!res.success) {
      setError(res.message);
      return;
    }

    setSuccess(res.message);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Edit Username Sekolah
              </h2>
              <p className="text-xs text-indigo-200">
                {school.namaSekolah}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 text-slate-800">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
            <div className="text-slate-500">Username Saat Ini:</div>
            <div className="font-mono font-bold text-slate-800 text-sm">{school.username}</div>
          </div>

          <form id="form-edit-username" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Username Baru
              </label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                placeholder="Masukkan username baru..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Gunakan huruf kecil, angka, titik, atau garis hubung tanpa spasi.
              </p>
            </div>
          </form>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="form-edit-username"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            Simpan Username Baru
          </button>
        </div>
      </div>
    </div>
  );
};
