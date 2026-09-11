import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { SchoolAccount, SuperAdminUser, SuperAdminLog } from '../../types';
import {
  Building2,
  Users,
  ShieldCheck,
  Search,
  Plus,
  Edit2,
  KeyRound,
  Power,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  LogOut,
  History,
  Lock,
  User as UserIcon,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ShieldAlert,
  Sliders,
  Settings,
} from 'lucide-react';
import { AddSchoolModal } from './AddSchoolModal';
import { EditSchoolModal } from './EditSchoolModal';
import { EditUsernameModal } from './EditUsernameModal';
import { ResetPasswordModal } from './ResetPasswordModal';

interface SuperAdminDashboardProps {
  onLogout: () => void;
  onViewSchoolWebsite: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onLogout,
  onViewSchoolWebsite,
}) => {
  const [activeTab, setActiveTab] = useState<'schools' | 'profile' | 'logs'>('schools');
  const [schools, setSchools] = useState<SchoolAccount[]>([]);
  const [logs, setLogs] = useState<SuperAdminLog[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<SuperAdminUser>(db.getSuperAdminUser());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'aktif' | 'nonaktif'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingFullSchool, setEditingFullSchool] = useState<SchoolAccount | null>(null);
  const [editingSchool, setEditingSchool] = useState<SchoolAccount | null>(null);
  const [resettingSchool, setResettingSchool] = useState<SchoolAccount | null>(null);

  // Status confirm modal
  const [confirmToggleSchool, setConfirmToggleSchool] = useState<SchoolAccount | null>(null);
  const [confirmDeleteSchool, setConfirmDeleteSchool] = useState<SchoolAccount | null>(null);

  // Notification feedback
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Self credential form
  const [saCurrentPassword, setSaCurrentPassword] = useState('');
  const [saNewUsername, setSaNewUsername] = useState('');
  const [saNewPassword, setSaNewPassword] = useState('');
  const [saConfirmPassword, setSaConfirmPassword] = useState('');
  const [saFormLoading, setSaFormLoading] = useState(false);

  // Copied username tracker
  const [copiedUsernameId, setCopiedUsernameId] = useState<string | null>(null);

  const loadData = () => {
    setSchools(db.getSchoolAccounts());
    setLogs(db.getSuperAdminLogs());
    setCurrentAdmin(db.getSuperAdminUser());
  };

  useEffect(() => {
    loadData();

    const handleSchoolsChange = () => loadData();
    window.addEventListener('school_accounts_changed', handleSchoolsChange);
    return () => window.removeEventListener('school_accounts_changed', handleSchoolsChange);
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCopyUsername = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUsernameId(id);
    setTimeout(() => setCopiedUsernameId(null), 2000);
  };

  const handleToggleStatus = (school: SchoolAccount) => {
    const res = db.toggleSchoolStatus(school.id);
    if (res.success) {
      showToast('success', res.message);
      loadData();
    } else {
      showToast('error', res.message);
    }
    setConfirmToggleSchool(null);
  };

  const handleDeleteSchool = (school: SchoolAccount) => {
    const res = db.deleteSchoolAccount(school.id);
    if (res.success) {
      showToast('success', res.message);
      loadData();
    } else {
      showToast('error', res.message);
    }
    setConfirmDeleteSchool(null);
  };

  const handleUpdateSelfCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saCurrentPassword) {
      showToast('error', 'Masukkan kata sandi Super Admin saat ini untuk konfirmasi.');
      return;
    }

    if (saNewPassword && saNewPassword !== saConfirmPassword) {
      showToast('error', 'Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setSaFormLoading(true);
    const res = db.updateSuperAdminCredentials(
      saCurrentPassword,
      saNewUsername.trim() || undefined,
      saNewPassword.trim() || undefined
    );

    setSaFormLoading(false);
    if (res.success) {
      showToast('success', res.message);
      setSaCurrentPassword('');
      setSaNewUsername('');
      setSaNewPassword('');
      setSaConfirmPassword('');
      loadData();
    } else {
      showToast('error', res.message);
    }
  };

  // Filtered schools
  const filteredSchools = schools.filter((s) => {
    const matchesSearch =
      s.namaSekolah.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.npsn.includes(searchQuery) ||
      s.username.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSchools = schools.length;
  const activeSchools = schools.filter((s) => s.status === 'aktif').length;
  const inactiveSchools = schools.filter((s) => s.status === 'nonaktif').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white tracking-tight">
                  Super Admin Console
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                  Otoritas Pusat
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Manajemen Akun Sekolah, Hak Akses & Kredensial Multi-Tenancy
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5">
            <button
              id="btn-sa-view-website"
              onClick={onViewSchoolWebsite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
              title="Buka Portal Sekolah"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Buka Portal Sekolah</span>
            </button>

            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            {/* Profile pill */}
            <div className="flex items-center gap-2 pl-2 text-xs font-medium text-slate-300 bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5">
              <div className="w-6 h-6 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold">
                SA
              </div>
              <span className="hidden sm:inline font-semibold text-white">{currentAdmin.username}</span>
            </div>

            <button
              id="btn-sa-logout"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Toast Notification */}
        {notification && (
          <div
            className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border shadow-lg animate-in fade-in slide-in-from-top-2 ${
              notification.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
                : 'bg-red-950/70 border-red-800/80 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Sekolah
              </span>
              <Building2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {totalSchools}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Terdaftar di server</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Sekolah Aktif
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {activeSchools}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Izin login diizinkan</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Dinonaktifkan
              </span>
              <XCircle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {inactiveSchools}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Akses ditangguhkan</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                Aktivitas Audit
              </span>
              <History className="w-4 h-4 text-indigo-300" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {logs.length}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Catatan log tersimpan</p>
          </div>
        </div>

        {/* Security Isolation Notice */}
        <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-900/50 text-indigo-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              <strong className="text-white">Isolasi Keamanan Aktif: </strong>
              Super Admin hanya berhak mengelola akun dan lisensi sekolah. Akses ke data siswa, guru, absensi, dan rapor sekolah dibatasi sepenuhnya.
            </span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 space-x-1 sm:space-x-2">
          <button
            id="tab-manage-schools"
            onClick={() => setActiveTab('schools')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'schools'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900/90'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Kelola Akun Sekolah</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {schools.length}
            </span>
          </button>

          <button
            id="tab-sa-profile"
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900/90'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Kredensial Super Admin</span>
          </button>

          <button
            id="tab-sa-logs"
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900/90'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Riwayat Aktivitas ({logs.length})</span>
          </button>
        </div>

        {/* Tab 1: Manage School Accounts */}
        {activeTab === 'schools' && (
          <div className="space-y-4">
            {/* Filter and Action Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              {/* Search & Filter */}
              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500 pointer-events-none" />
                  <input
                    id="input-search-schools"
                    type="text"
                    placeholder="Cari nama sekolah, NPSN, atau username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:bg-slate-850 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'aktif' | 'nonaktif')}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                >
                  <option value="all">Semua Status</option>
                  <option value="aktif">Hanya Aktif</option>
                  <option value="nonaktif">Hanya Nonaktif</option>
                </select>
              </div>

              {/* Add School Button */}
              <button
                id="btn-open-add-school"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-md transition-all hover:shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Akun Sekolah Baru</span>
              </button>
            </div>

            {/* School Table / Cards */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {filteredSchools.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-300">Tidak ada akun sekolah ditemukan</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchQuery
                      ? `Tidak ada hasil untuk pencarian "${searchQuery}".`
                      : 'Belum ada akun sekolah yang terdaftar selain akun default.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Nama Sekolah & NPSN</th>
                        <th className="py-3.5 px-4">Username Login</th>
                        <th className="py-3.5 px-4">Status Akun</th>
                        <th className="py-3.5 px-4 hidden md:table-cell">Waktu Login Terakhir</th>
                        <th className="py-3.5 px-4 text-right">Kelola & Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {filteredSchools.map((sch) => (
                        <tr
                          key={sch.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Nama & NPSN */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center text-indigo-400 font-bold text-xs flex-shrink-0">
                                {sch.namaSekolah.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-white group-hover:text-indigo-300 transition-colors">
                                  {sch.namaSekolah}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  NPSN: {sch.npsn}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Username */}
                          <td className="py-3.5 px-4">
                            <div className="inline-flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-mono text-indigo-300 text-xs">
                              <span>{sch.username}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyUsername(sch.id, sch.username)}
                                className="text-slate-500 hover:text-white transition-colors"
                                title="Salin username"
                              >
                                {copiedUsernameId === sch.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {sch.status === 'aktif' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Aktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Nonaktif
                              </span>
                            )}
                          </td>

                          {/* Last Login */}
                          <td className="py-3.5 px-4 hidden md:table-cell text-xs text-slate-400">
                            {sch.lastLogin ? (
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                <span>
                                  {new Date(sch.lastLogin).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600 italic">Belum pernah login</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit School Account & Info */}
                              <button
                                onClick={() => setEditingFullSchool(sch)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-sky-950/60 border border-transparent hover:border-sky-800/60 transition-all"
                                title="Edit Akun & Identitas Sekolah"
                              >
                                <Settings className="w-4 h-4" />
                              </button>

                              {/* Edit Username */}
                              <button
                                onClick={() => setEditingSchool(sch)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/60 border border-transparent hover:border-indigo-800/60 transition-all"
                                title="Edit Username Sekolah"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Reset Password */}
                              <button
                                onClick={() => setResettingSchool(sch)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-950/60 border border-transparent hover:border-amber-800/60 transition-all"
                                title="Reset / Ganti Password Sekolah"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>

                              {/* Toggle Status */}
                              <button
                                onClick={() => setConfirmToggleSchool(sch)}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  sch.status === 'aktif'
                                    ? 'text-amber-400 hover:text-amber-200 hover:bg-amber-950/60 border-transparent hover:border-amber-800/60'
                                    : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/60 border-transparent hover:border-emerald-800/60'
                                }`}
                                title={sch.status === 'aktif' ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                              >
                                <Power className="w-4 h-4" />
                              </button>

                              {/* Delete School */}
                              {schools.length > 1 && (
                                <button
                                  onClick={() => setConfirmDeleteSchool(sch)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/60 border border-transparent hover:border-red-900/60 transition-all"
                                  title="Hapus Akun Sekolah"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Super Admin Self Credential Settings */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <span>Pengaturan Kredensial Super Admin</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Ubah username dan kata sandi akun Super Administrator Anda secara permanen.
              </p>
            </div>

            <form onSubmit={handleUpdateSelfCredentials} className="space-y-5">
              {/* Current Username info */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Username Super Admin Saat Ini:</span>
                <span className="font-mono font-bold text-indigo-300 text-sm">{currentAdmin.username}</span>
              </div>

              {/* Change Username Section */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  1. Ganti Username Super Admin (Opsional)
                </h3>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Username Baru
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-3 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Biarkan kosong jika tidak ingin mengubah username"
                      value={saNewUsername}
                      onChange={(e) => setSaNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm font-mono text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Change Password Section */}
              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  2. Ganti Kata Sandi Super Admin (Opsional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Kata Sandi Baru (Min. 6 Karakter)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500 pointer-events-none" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={saNewPassword}
                        onChange={(e) => setSaNewPassword(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Konfirmasi Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500 pointer-events-none" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={saConfirmPassword}
                        onChange={(e) => setSaConfirmPassword(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Password Confirmation (Required) */}
              <div className="pt-4 border-t border-slate-800/80 space-y-1.5">
                <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider">
                  Masukkan Kata Sandi Super Admin Saat Ini <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-amber-400 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Wajib diisi untuk memverifikasi identitas Anda"
                    value={saCurrentPassword}
                    onChange={(e) => setSaCurrentPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-amber-600/40 rounded-xl text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Untuk keamanan sistem, perubahan kredensial memerlukan kata sandi Super Admin yang sah.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saFormLoading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md transition-all disabled:opacity-50"
                >
                  {saFormLoading ? 'Menyimpan...' : 'Perbarui Kredensial Super Admin'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Activity Logs */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" />
                  <span>Audit Trail Log Aktivitas Super Admin</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Rekaman seluruh aksi penting (penambahan sekolah, reset password, pengubahan username & status)
                </p>
              </div>
              <button
                onClick={loadData}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Refresh logs"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[600px] overflow-y-auto">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada log aktivitas tercatat.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-800/40 transition-colors flex items-start gap-3.5">
                    <div className="mt-0.5">
                      {log.action === 'create_school' && (
                        <div className="w-7 h-7 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center justify-center">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {log.action === 'edit_username' && (
                        <div className="w-7 h-7 rounded-lg bg-blue-950/80 text-blue-400 border border-blue-800/60 flex items-center justify-center">
                          <Edit2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {log.action === 'reset_password' && (
                        <div className="w-7 h-7 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/60 flex items-center justify-center">
                          <KeyRound className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {log.action === 'toggle_status' && (
                        <div className="w-7 h-7 rounded-lg bg-purple-950/80 text-purple-400 border border-purple-800/60 flex items-center justify-center">
                          <Power className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {log.action === 'delete_school' && (
                        <div className="w-7 h-7 rounded-lg bg-red-950/80 text-red-400 border border-red-800/60 flex items-center justify-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {log.action === 'update_superadmin' && (
                        <div className="w-7 h-7 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 flex items-center justify-center">
                          <Sliders className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
                        {log.description}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                        <span>
                          {new Date(log.timestamp).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        {log.schoolName && (
                          <span className="text-slate-400 font-semibold truncate">
                            Sekolah: {log.schoolName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AddSchoolModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          showToast('success', 'Akun sekolah baru berhasil didaftarkan!');
          loadData();
        }}
      />

      <EditSchoolModal
        isOpen={!!editingFullSchool}
        school={editingFullSchool}
        onClose={() => setEditingFullSchool(null)}
        onSuccess={() => {
          showToast('success', 'Data akun sekolah berhasil diperbarui!');
          loadData();
        }}
      />

      <EditUsernameModal
        isOpen={!!editingSchool}
        school={editingSchool}
        onClose={() => setEditingSchool(null)}
        onSuccess={() => {
          showToast('success', 'Username akun sekolah berhasil diperbarui!');
          loadData();
        }}
      />

      <ResetPasswordModal
        isOpen={!!resettingSchool}
        school={resettingSchool}
        onClose={() => setResettingSchool(null)}
        onSuccess={() => {
          showToast('success', 'Kata sandi sekolah berhasil direset!');
          loadData();
        }}
      />

      {/* Confirmation Modal for Toggle Status */}
      {confirmToggleSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 text-slate-100 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">
              {confirmToggleSchool.status === 'aktif'
                ? 'Nonaktifkan Akun Sekolah?'
                : 'Aktifkan Kembali Akun Sekolah?'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              {confirmToggleSchool.status === 'aktif' ? (
                <>
                  Sekolah <strong className="text-white">{confirmToggleSchool.namaSekolah}</strong> tidak akan dapat masuk ke sistem dashboard hingga diaktifkan kembali.
                </>
              ) : (
                <>
                  Sekolah <strong className="text-white">{confirmToggleSchool.namaSekolah}</strong> akan dapat login kembali menggunakan username & password yang terdaftar.
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmToggleSchool(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleToggleStatus(confirmToggleSchool)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all ${
                  confirmToggleSchool.status === 'aktif'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmToggleSchool.status === 'aktif' ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete School */}
      {confirmDeleteSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 text-slate-100 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">
              Hapus Akun Sekolah?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Apakah Anda yakin ingin menghapus akun <strong className="text-white">{confirmDeleteSchool.namaSekolah}</strong>? Tindakan ini permanen.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteSchool(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSchool(confirmDeleteSchool)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-all"
              >
                Ya, Hapus Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
