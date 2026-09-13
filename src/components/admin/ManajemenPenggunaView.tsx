import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { User, UserRole, Guru } from '../../types';
import {
  Shield,
  Edit2,
  Users,
  CheckCircle,
  Trash2,
  Search,
  UserPlus,
  Eye,
  EyeOff,
  GraduationCap,
  Sparkles,
  Lock,
  Copy,
  Check,
  RefreshCw,
  Info,
  ShieldCheck,
  KeyRound,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

interface ManajemenPenggunaViewProps {
  currentUser?: User;
}

export const ManajemenPenggunaView: React.FC<ManajemenPenggunaViewProps> = ({ currentUser: propUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [activeTab, setActiveTab] = useState<'daftar' | 'pendaftaran'>('pendaftaran');

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('guru');
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Form Pendaftaran Pengguna Baru
  const [selectedGuruId, setSelectedGuruId] = useState<string>('');
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('guru123');
  const [regNip, setRegNip] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('guru');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Table filters & state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'guru'>('all');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Delete modal state
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Notifications
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Active current user resolution
  const activeUser =
    propUser ||
    db.getCurrentUser() || {
      id: 'usr-admin',
      name: 'Operator Sekolah',
      username: 'operator',
      role: 'admin' as UserRole,
    };

  const refreshData = () => {
    setUsers(db.getUsers());
    setGuruList(db.getGuruList());
  };

  useEffect(() => {
    refreshData();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePasswordReveal = (userId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  // Auto-generate username from name or NIP
  const generateUsernameFromName = (nameStr: string, nipStr: string) => {
    if (nipStr && nipStr.trim().length > 3) {
      return nipStr.replace(/[^0-9]/g, '').slice(0, 18);
    }
    const clean = nameStr
      .toLowerCase()
      .replace(/^(h\.|dr\.|drs\.|dra\.|ir\.)\s*/i, '')
      .replace(/,\s*[a-z.\s]+$/i, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 15);
    return clean || 'pengguna_baru';
  };

  // Handle selection from data guru
  const handleSelectGuruForAdd = (guruId: string) => {
    setSelectedGuruId(guruId);
    if (!guruId) {
      setRegName('');
      setRegNip('');
      setRegUsername('');
      setRegPassword('guru123');
      setRegRole('guru');
      return;
    }

    const foundGuru = guruList.find((g) => g.id === guruId);
    if (foundGuru) {
      setRegName(foundGuru.nama);
      setRegNip(foundGuru.nip || '');
      setRegRole('guru');
      const suggested = generateUsernameFromName(foundGuru.nama, foundGuru.nip || '');
      setRegUsername(suggested);
      setRegPassword(foundGuru.nip ? foundGuru.nip.replace(/\D/g, '') || 'guru123' : 'guru123');
    }
  };

  // Generate random password
  const generateRandomPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRegPassword(res);
  };

  // Submit new registration
  const handleRegisterUser = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!regName.trim() || !regUsername.trim() || !regPassword.trim()) {
      setErrorMsg('Nama Lengkap, Username, dan Kata Sandi wajib diisi!');
      return;
    }

    const cleanUsername = regUsername.trim().toLowerCase();
    const existing = users.find((u) => u.username.toLowerCase() === cleanUsername);
    if (existing) {
      setErrorMsg(`Username "${cleanUsername}" sudah digunakan oleh ${existing.name}. Gunakan username lain.`);
      return;
    }

    const newUser: User = {
      id: `usr-${Date.now()}`,
      username: cleanUsername,
      password: regPassword.trim(),
      name: regName.trim(),
      role: regRole,
      nip: regNip.trim() || undefined,
      guruId: selectedGuruId || undefined,
    };

    db.saveUser(newUser);
    refreshData();

    setSuccessMsg(`Akun ${newUser.name} (${newUser.role === 'admin' ? 'Operator' : 'Guru'}) berhasil didaftarkan!`);
    
    // Reset registration form
    setSelectedGuruId('');
    setRegName('');
    setRegUsername('');
    setRegPassword('guru123');
    setRegNip('');
    setRegRole('guru');

    setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
  };

  // Open edit modal
  const openEditUser = (user: User) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditPassword(user.password || (user.role === 'admin' ? 'operator123' : 'guru123'));
    setEditName(user.name);
    setEditRole(user.role);
    setShowEditPassword(false);
    setErrorMsg('');
  };

  // Save edit user
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editUsername.trim() || !editName.trim()) {
      setErrorMsg('Nama dan username tidak boleh kosong!');
      return;
    }

    const existing = users.find(
      (u) =>
        u.username.toLowerCase() === editUsername.trim().toLowerCase() &&
        u.id !== editingUser.id
    );
    if (existing) {
      setErrorMsg(`Username "${editUsername}" sudah digunakan oleh akun lain!`);
      return;
    }

    const updated: User = {
      ...editingUser,
      username: editUsername.trim().toLowerCase(),
      name: editName.trim(),
      password: editPassword.trim() || (editingUser.role === 'admin' ? 'operator123' : 'guru123'),
      role: editRole,
    };

    db.saveUser(updated);
    refreshData();
    setEditingUser(null);
    setSuccessMsg(`Akun "${updated.name}" berhasil diperbarui!`);

    setTimeout(() => {
      setSuccessMsg('');
    }, 3500);
  };

  // Confirm delete user
  const confirmDeleteUser = () => {
    if (!deletingUser) return;

    if (activeUser?.id === deletingUser.id || activeUser?.username === deletingUser.username) {
      setErrorMsg('Anda tidak dapat menghapus akun yang sedang Anda gunakan saat ini!');
      setDeletingUser(null);
      return;
    }

    db.deleteUser(deletingUser.id);
    refreshData();
    setSuccessMsg(`Akun ${deletingUser.name} berhasil dihapus.`);
    setDeletingUser(null);

    setTimeout(() => {
      setSuccessMsg('');
    }, 3000);
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.nip && u.nip.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalAdmin = users.filter((u) => u.role === 'admin').length;
  const totalGuru = users.filter((u) => u.role === 'guru').length;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Pendaftaran & Manajemen Pengguna
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftarkan akun login guru & operator baru, serta kelola username dan kata sandi pengguna sekolah.
            </p>
          </div>
        </div>

        {/* Top Actions & Active User */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              Login: <strong>{activeUser.name}</strong>
            </span>
          </div>

          <button
            onClick={() => setActiveTab('pendaftaran')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pendaftaran'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Pendaftaran Akun Baru</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('pendaftaran')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'pendaftaran'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Form Pendaftaran Pengguna Baru</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              activeTab === 'pendaftaran' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            Form
          </span>
        </button>

        <button
          onClick={() => setActiveTab('daftar')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'daftar'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Daftar Semua Pengguna</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === 'daftar' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {users.length}
          </span>
        </button>
      </div>

      {/* Summary Mini Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Pengguna</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">{users.length}</p>
          <span className="text-[10px] text-slate-400">Akun terdaftar di sistem</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Akun Guru</span>
            <GraduationCap className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-1">{totalGuru}</p>
          <span className="text-[10px] text-slate-400">Dewan Guru (Wali Kelas)</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700">Akun Operator</span>
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-700 mt-1">{totalAdmin}</p>
          <span className="text-[10px] text-slate-400">Administrator Sekolah</span>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <Info className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: FORMULIR PENDAFTARAN PENGGUNA BARU */}
      {activeTab === 'pendaftaran' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
          {/* Left: Registration Form */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Formulir Pendaftaran Pengguna Baru</h3>
                  <p className="text-xs text-slate-500">
                    Lengkapi data di bawah ini untuk membuat akun login guru atau operator sekolah.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleRegisterUser} className="space-y-4">
              {/* Option 1: Auto Fill from Existing Data Guru */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Isi Cepat dari Data Dewan Guru Terdaftar:</span>
                </label>
                <select
                  value={selectedGuruId}
                  onChange={(e) => handleSelectGuruForAdd(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600 outline-hidden cursor-pointer"
                >
                  <option value="">-- Pilih Nama Guru untuk Pengisian Otomatis --</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama} {g.nip ? `(NIP: ${g.nip})` : ''} - {g.mataPelajaran || 'Guru'}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-blue-700">
                  Memilih guru akan mengisi otomatis Nama, NIP, serta saran username & password. Atau Anda dapat mengetik manual di bawah.
                </p>
              </div>

              {/* Nama Lengkap */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nama Lengkap Pengguna <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Dra. Hj. Siti Rahmawati, M.Pd"
                  value={regName}
                  onChange={(e) => {
                    setRegName(e.target.value);
                    if (!regUsername) {
                      setRegUsername(generateUsernameFromName(e.target.value, regNip));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-hidden"
                />
              </div>

              {/* NIP / Nomor Identitas & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">NIP / Nomor Identitas (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Contoh: 198501012010011001"
                    value={regNip}
                    onChange={(e) => setRegNip(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Peran / Hak Akses <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-hidden cursor-pointer"
                  >
                    <option value="guru">👨‍🏫 Dewan Guru (Wali Kelas)</option>
                    <option value="admin">🛡️ Admin / Operator Sekolah</option>
                  </select>
                </div>
              </div>

              {/* Username & Auto Generate */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Username Login <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRegUsername(generateUsernameFromName(regName, regNip))}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Buat Username Otomatis</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Contoh: sitirahmawati atau 19850101..."
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-blue-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-hidden"
                />
                <span className="text-[10px] text-slate-400">
                  Username digunakan guru/operator untuk masuk ke aplikasi. Tanpa spasi.
                </span>
              </div>

              {/* Kata Sandi / Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Kata Sandi (Password) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Acak Sandi Baru</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    placeholder="Masukkan kata sandi..."
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400">Saran Cepat:</span>
                  <button
                    type="button"
                    onClick={() => setRegPassword('guru123')}
                    className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  >
                    guru123
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegPassword('operator123')}
                    className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  >
                    operator123
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRegName('');
                    setRegNip('');
                    setRegUsername('');
                    setRegPassword('guru123');
                    setSelectedGuruId('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                >
                  Reset Form
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Daftarkan & Simpan Akun</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right: Realtime Account Preview & Guide */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Pratinjau Kartu Akun yang Didaftarkan
              </h4>

              {/* Account Card Badge */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 text-white shadow-md relative overflow-hidden space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-white/20 text-white tracking-wide">
                    {regRole === 'admin' ? 'Operator / Admin' : 'Dewan Guru'}
                  </span>
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {regName.trim() || 'Nama Calon Pengguna'}
                  </h3>
                  <p className="text-[11px] text-blue-200">
                    {regNip ? `NIP: ${regNip}` : 'NIP Belum Diisi'}
                  </p>
                </div>

                <div className="p-2.5 bg-white/10 rounded-xl space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between text-blue-100">
                    <span className="text-[10px] text-slate-300">Username:</span>
                    <strong className="text-white font-bold">{regUsername || '-'}</strong>
                  </div>
                  <div className="flex items-center justify-between text-blue-100">
                    <span className="text-[10px] text-slate-300">Kata Sandi:</span>
                    <strong className="text-amber-300 font-bold">{regPassword || '-'}</strong>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Status: Siap diaktifkan langsung setelah didaftarkan</span>
                </div>
              </div>

              {/* Info Guide */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs text-slate-600">
                <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-600" />
                  Petunjuk Penggunaan:
                </h5>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed">
                  <li>
                    Akun yang didaftarkan dapat langsung digunakan untuk login di halaman utama aplikasi.
                  </li>
                  <li>
                    <strong>Dewan Guru</strong> memiliki hak akses mengelola presensi siswa, menginput nilai harian, rapor, dan kas kelas.
                  </li>
                  <li>
                    <strong>Operator Sekolah</strong> memiliki hak akses penuh ke data master kesiswaan, profil sekolah, dan pengaturan.
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('daftar')}
                  className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Users className="w-4 h-4 text-slate-500" />
                  <span>Lihat Semua Akun Pengguna ({users.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DAFTAR SEMUA PENGGUNA TERDAFTAR */}
      {activeTab === 'daftar' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Daftar Akun Pengguna Terdaftar</h3>
              <p className="text-xs text-slate-500">
                Semua akun login dewan guru dan operator yang aktif di sekolah ini.
              </p>
            </div>

            <button
              onClick={() => setActiveTab('pendaftaran')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Daftarkan Pengguna Baru</span>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama, NIP, atau username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filter Peran:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white outline-hidden cursor-pointer"
              >
                <option value="all">Semua Peran ({users.length})</option>
                <option value="guru">Dewan Guru ({totalGuru})</option>
                <option value="admin">Operator / Admin ({totalAdmin})</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Nama & NIP Pengguna</th>
                  <th className="p-3.5">Peran / Hak Akses</th>
                  <th className="p-3.5">Username</th>
                  <th className="p-3.5">Kata Sandi (Password)</th>
                  <th className="p-3.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isUserAdmin = u.role === 'admin' || u.role === 'superadmin';
                  const isSelf = activeUser?.id === u.id || activeUser?.username === u.username;
                  const isPasswordRevealed = revealedPasswords[u.id];
                  const effectivePassword = u.password || (u.role === 'admin' ? 'operator123' : 'guru123');

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & NIP */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                              isUserAdmin ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[9px] font-bold">
                                  Anda
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {u.nip ? `NIP: ${u.nip}` : 'NIP Tidak Ada'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="p-3.5">
                        {isUserAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Shield className="w-3 h-3" />
                            <span>Operator / Admin</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <GraduationCap className="w-3 h-3" />
                            <span>Dewan Guru</span>
                          </span>
                        )}
                      </td>

                      {/* Username */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                          <span>{u.username}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(u.username, `user-${u.id}`)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            title="Salin Username"
                          >
                            {copiedId === `user-${u.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Password */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold px-2 py-1 bg-slate-100 rounded-lg text-slate-700">
                            {isPasswordRevealed ? effectivePassword : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordReveal(u.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            title={isPasswordRevealed ? 'Sembunyikan Sandi' : 'Lihat Sandi'}
                          >
                            {isPasswordRevealed ? (
                              <EyeOff className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(effectivePassword, `pwd-${u.id}`)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            title="Salin Kata Sandi"
                          >
                            {copiedId === `pwd-${u.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
                            title="Ubah Data & Sandi"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingUser(u)}
                            disabled={isSelf}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isSelf
                                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                            }`}
                            title={isSelf ? 'Tidak dapat menghapus akun Anda sendiri' : 'Hapus Akun'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                      Tidak ada pengguna yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Ubah Akun Pengguna</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Username</label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Peran / Hak Akses</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 outline-hidden cursor-pointer"
                >
                  <option value="guru">Dewan Guru</option>
                  <option value="admin">Operator / Admin</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Kata Sandi Baru</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    required
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingUser && (
        <ConfirmModal
          isOpen={true}
          title="Hapus Akun Pengguna"
          message={`Apakah Anda yakin ingin menghapus akun "${deletingUser.name}" (${deletingUser.username})? Pengguna ini tidak akan dapat login lagi ke sistem.`}
          confirmText="Ya, Hapus Akun"
          cancelText="Batal"
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeletingUser(null)}
          isDanger={true}
        />
      )}
    </div>
  );
};
