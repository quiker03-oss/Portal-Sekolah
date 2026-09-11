import React, { useState } from 'react';
import { db } from '../../services/database';
import { Settings } from '../../types';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle,
  Upload,
  Download,
  RotateCcw,
  AlertTriangle,
  Image as ImageIcon,
  Database,
  FileJson,
} from 'lucide-react';

export const PengaturanView: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(db.getSettings());
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl);
  const [namaSekolah, setNamaSekolah] = useState(settings.namaSekolah);
  const [tahunAjaran, setTahunAjaran] = useState(settings.tahunAjaranAktif);
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(settings.semesterAktif);

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setLogoUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updated: Settings = {
      ...settings,
      logoUrl,
      namaSekolah,
      tahunAjaranAktif: tahunAjaran,
      semesterAktif: semester,
    };

    db.saveSettings(updated);
    setSettings(updated);
    setSuccessMsg('Pengaturan berhasil disimpan! Logo dan nama sekolah langsung terpasang di seluruh sistem.');

    setTimeout(() => {
      setSuccessMsg('');
    }, 3500);
  };

  const handleBackupDatabase = () => {
    const backupJson = db.exportFullDatabase();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BACKUP_DATABASE_Sekolah_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRestoreDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        'Peringatan: Me-restore database akan menimpa seluruh data saat ini dengan data cadangan. Lanjutkan?'
      )
    ) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const jsonContent = evt.target?.result as string;
      const success = db.restoreDatabase(jsonContent);
      if (success) {
        alert('Database berhasil dipulihkan!');
        window.location.reload();
      } else {
        alert('Gagal memulihkan database. Format berkas JSON tidak valid.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = () => {
    if (
      window.confirm(
        'PERINGATAN: Anda yakin ingin mereset seluruh data ke data awal pabrik (Default)? Semua data presensi dan siswa baru akan dikembalikan ke data percontohan.'
      )
    ) {
      db.resetToFactory();
      alert('Sistem berhasil direset ke pengaturan default.');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Pengaturan Sistem & Database
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Konfigurasi logo dinamis, tahun akademik, pencadangan data lokal, dan pemulihan database
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* LOGO DINAMIS SEKOLAH */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ImageIcon className="w-4 h-4 text-blue-700" />
            <span>Logo Dinamis Sekolah (Propagasi Otomatis)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
            <div className="sm:col-span-4 flex flex-col items-center justify-center p-5 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-3">
              <div className="w-28 h-28 p-2 bg-white rounded-2xl border border-slate-300 shadow-xs flex items-center justify-center">
                <img src={logoUrl} alt="Logo Sekolah" className="w-full h-full object-contain" />
              </div>
              <span className="text-[11px] font-semibold text-slate-600">Pratinjau Logo Aktif</span>
            </div>

            <div className="sm:col-span-8 space-y-4">
              <div>
                <span className="block text-xs font-bold text-slate-900 mb-1">
                  Pilih Logo Baru dari Komputer
                </span>
                <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                  Logo ini bersifat <strong>dinamis</strong> dan akan langsung menggantikan logo di:{' '}
                  <strong>Navbar atas</strong>, <strong>Landing Page</strong>,{' '}
                  <strong>Cetak e-Rapor</strong>, dan <strong>Kartu QR Absensi</strong>.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    id="input-logo-sekolah"
                    accept="image/*"
                    onChange={handleUploadLogo}
                    className="hidden"
                  />
                  <label
                    htmlFor="input-logo-sekolah"
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Unggah Berkas Logo (PNG/JPG)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setLogoUrl('/logo.svg')}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold"
                  >
                    Gunakan Logo Resmi Satuan Pendidikan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TAHUN AJARAN & NAMA SEKOLAH */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <SettingsIcon className="w-4 h-4 text-blue-700" />
            <span>Tahun Akademik & Penamaan</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Resmi Sekolah
              </label>
              <input
                type="text"
                required
                value={namaSekolah}
                onChange={(e) => setNamaSekolah(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Ajaran Aktif
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 2024/2025"
                value={tahunAjaran}
                onChange={(e) => setTahunAjaran(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Semester Berjalan
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-semibold"
              >
                <option value="Ganjil">Semester Ganjil</option>
                <option value="Genap">Semester Genap</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Pengaturan</span>
          </button>
        </div>
      </form>

      {/* BACKUP & RESTORE DATABASE */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Database className="w-4 h-4 text-blue-700" />
          <span>Pemeliharaan Basis Data (Backup & Restore)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Backup */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Download className="w-4 h-4 text-blue-700" />
                Cadangkan Data (Backup)
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Unduh seluruh data siswa, guru, rekap presensi, dan nilai rapor dalam satu berkas JSON terenkripsi ke laptop/HP Anda.
              </p>
            </div>
            <button
              onClick={handleBackupDatabase}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileJson className="w-4 h-4" />
              <span>Unduh Berkas Backup</span>
            </button>
          </div>

          {/* Restore */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-700" />
                Pulihkan Data (Restore)
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Muat kembali basis data dari berkas cadangan JSON yang pernah Anda simpan sebelumnya.
              </p>
            </div>
            <div>
              <input
                type="file"
                id="input-restore-database"
                accept=".json"
                onChange={handleRestoreDatabase}
                className="hidden"
              />
              <label
                htmlFor="input-restore-database"
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Pilih Berkas Backup (.json)</span>
              </label>
            </div>
          </div>

          {/* Reset */}
          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="font-bold text-rose-900 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Reset ke Setelan Awal
              </span>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                Menghapus semua data perubahan dan mengembalikan sistem ke data awal pabrik Satuan Pendidikan.
              </p>
            </div>
            <button
              onClick={handleResetDatabase}
              className="w-full py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Database</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
