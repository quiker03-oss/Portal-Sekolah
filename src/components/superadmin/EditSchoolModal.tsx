import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { SchoolAccount } from '../../types';
import {
  X,
  Building2,
  User,
  Phone,
  Mail,
  FileText,
  AlertCircle,
  CheckCircle2,
  Power,
  MapPin,
} from 'lucide-react';

interface EditSchoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  school: SchoolAccount | null;
  onSuccess: () => void;
}

export const EditSchoolModal: React.FC<EditSchoolModalProps> = ({
  isOpen,
  onClose,
  school,
  onSuccess,
}) => {
  const [namaSekolah, setNamaSekolah] = useState('');
  const [npsn, setNpsn] = useState('');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<'aktif' | 'nonaktif'>('aktif');
  const [kontak, setKontak] = useState('');
  const [email, setEmail] = useState('');
  const [alamat, setAlamat] = useState('');
  const [keterangan, setKeterangan] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (school) {
      setNamaSekolah(school.namaSekolah || '');
      setNpsn(school.npsn || '');
      setUsername(school.username || '');
      setStatus(school.status || 'aktif');
      setKontak(school.kontak || '');
      setEmail(school.email || '');
      setKeterangan(school.keterangan || '');

      // Load school address from school profile if available
      try {
        const schKey = school.id === 'sch-1' ? 'sdn2_sekolah' : `school_${school.id}_sekolah`;
        const raw = localStorage.getItem(schKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          setAlamat(parsed.alamat || school.keterangan || '');
        } else {
          setAlamat(school.keterangan || '');
        }
      } catch {
        setAlamat(school.keterangan || '');
      }

      setError('');
      setSuccess('');
    }
  }, [school, isOpen]);

  if (!isOpen || !school) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!namaSekolah.trim()) {
      setError('Nama sekolah wajib diisi.');
      return;
    }
    if (!npsn.trim()) {
      setError('NPSN sekolah wajib diisi.');
      return;
    }
    if (!username.trim()) {
      setError('Username login sekolah wajib diisi.');
      return;
    }

    const result = db.updateSchoolAccount(school.id, {
      namaSekolah: namaSekolah.trim(),
      npsn: npsn.trim(),
      username: username.trim().toLowerCase(),
      status,
      kontak: kontak.trim(),
      email: email.trim(),
      alamat: alamat.trim(),
      keterangan: keterangan.trim() || alamat.trim(),
    });

    if (!result.success) {
      setError(result.message);
      return;
    }

    setSuccess(result.message);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Edit Akun & Identitas Sekolah
              </h2>
              <p className="text-xs text-indigo-200">
                Perbarui akun, NPSN, dan informasi dasar satuan pendidikan
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-slate-800">
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

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
            <span className="text-slate-500">ID Sekolah (School ID):</span>
            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
              {school.id}
            </span>
          </div>

          <form id="form-edit-school" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nama Satuan Pendidikan <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    id="input-edit-nama-sekolah"
                    type="text"
                    value={namaSekolah}
                    onChange={(e) => setNamaSekolah(e.target.value)}
                    placeholder="Contoh: SMP NEGERI 1 CIPARAY"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  NPSN Sekolah <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-edit-npsn"
                  type="text"
                  value={npsn}
                  onChange={(e) => setNpsn(e.target.value)}
                  placeholder="Contoh: 20204512"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Status Akun
                </label>
                <div className="relative">
                  <Power className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <select
                    id="select-edit-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'aktif' | 'nonaktif')}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  >
                    <option value="aktif">Aktif (Dapat Login)</option>
                    <option value="nonaktif">Nonaktif (Akses Ditangguhkan)</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Username Login Operator <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    id="input-edit-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    placeholder="Contoh: namasekolah"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Digunakan oleh operator/admin sekolah untuk masuk ke dashboard portal.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  No. Telepon / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    id="input-edit-kontak"
                    type="text"
                    value={kontak}
                    onChange={(e) => setKontak(e.target.value)}
                    placeholder="08123456789"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Resmi Sekolah
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    id="input-edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sekolah@disdik.id"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Alamat Lengkap Sekolah
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <textarea
                    id="input-edit-alamat"
                    rows={2}
                    value={alamat}
                    onChange={(e) => setAlamat(e.target.value)}
                    placeholder="Jl. Raya Desa No. 12, Kec. Ciparay, Kab. Bandung"
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Catatan / Keterangan Tambahan
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    id="input-edit-keterangan"
                    type="text"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    placeholder="Catatan administrasi (opsional)"
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Batal
              </button>
              <button
                id="btn-save-edit-school"
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
              >
                Simpan Perubahan Akun
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
