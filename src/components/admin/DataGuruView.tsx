import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { Guru } from '../../types';
import { exportToExcel, exportToCsv } from '../../utils/exportHelper';
import { ConfirmModal } from '../common/ConfirmModal';
import {
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  QrCode,
  X,
  FileSpreadsheet,
  Phone,
  MapPin,
  Briefcase,
} from 'lucide-react';

interface DataGuruViewProps {
  onNavigateToQr: (guruId?: string) => void;
}

export const DataGuruView: React.FC<DataGuruViewProps> = ({ onNavigateToQr }) => {
  const [guruList, setGuruList] = useState<Guru[]>(db.getGuruList());
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuru, setEditingGuru] = useState<Guru | null>(null);
  
  // Current User Context (to check for admin)
  const currentUser = db.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Form
  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [jabatan, setJabatan] = useState('');
  const [mataPelajaran, setMataPelajaran] = useState('');
  const [alamat, setAlamat] = useState('');
  const [nomorHp, setNomorHp] = useState('');
  const [foto, setFoto] = useState('');
  
  // Account Form
  const [accountUsername, setAccountUsername] = useState('');
  const [accountPassword, setAccountPassword] = useState('');

  // Delete Confirm
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deletingGuru, setDeletingGuru] = useState<Guru | null>(null);

  const refreshData = () => {
    setGuruList(db.getGuruList());
  };

  useEffect(() => {
    window.addEventListener('data_guru_changed', refreshData);
    return () => window.removeEventListener('data_guru_changed', refreshData);
  }, []);

  const openAddModal = () => {
    setEditingGuru(null);
    setNama('');
    setNip('');
    setJabatan('Wali Kelas');
    setMataPelajaran('Guru Kelas');
    setAlamat('');
    setNomorHp('');
    setFoto('');
    setAccountUsername('');
    setAccountPassword('');
    setIsModalOpen(true);
  };

  const openEditModal = (guru: Guru) => {
    setEditingGuru(guru);
    setNama(guru.nama);
    setNip(guru.nip);
    setJabatan(guru.jabatan);
    setMataPelajaran(guru.mataPelajaran);
    setAlamat(guru.alamat);
    setNomorHp(guru.nomorHp);
    setFoto(guru.foto || '');
    
    if (isAdmin) {
      const users = db.getUsers();
      const linkedUser = users.find(u => u.guruId === guru.id);
      setAccountUsername(linkedUser?.username || '');
      setAccountPassword(linkedUser?.password || '');
    }
    
    setIsModalOpen(true);
  };

  const handleDelete = (guru: Guru) => {
    setDeletingGuru(guru);
    setIsConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (deletingGuru) {
      db.deleteGuru(deletingGuru.id);
      refreshData();
      setIsConfirmOpen(false);
      setDeletingGuru(null);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nama.trim()) {
      alert('Nama guru wajib diisi!');
      return;
    }
    
    const accountData = isAdmin && (accountUsername || accountPassword) ? {
      ...(accountUsername ? { username: accountUsername } : {}),
      ...(accountPassword ? { password: accountPassword } : {})
    } : undefined;

    if (editingGuru) {
      const updated: Guru = {
        ...editingGuru,
        nama,
        nip,
        jabatan,
        mataPelajaran,
        alamat,
        nomorHp,
        foto: foto || editingGuru.foto,
      };
      db.saveGuru(updated, accountData);
    } else {
      const newGuru: Guru = {
        id: `tch-${Date.now()}`,
        qrId: db.generateNextGuruQrId(),
        nama,
        nip,
        jabatan,
        mataPelajaran,
        alamat,
        nomorHp,
        foto:
          foto ||
          'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
        createdAt: new Date().toISOString().split('T')[0],
      };
      db.saveGuru(newGuru, accountData);
    }

    setIsModalOpen(false);
    refreshData();
  };

  const filtered = guruList.filter(
    (g) =>
      g.nama.toLowerCase().includes(search.toLowerCase()) ||
      g.nip.includes(search) ||
      g.jabatan.toLowerCase().includes(search.toLowerCase()) ||
      g.qrId.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportExcel = () => {
    const data = filtered.map((g, idx) => ({
      No: idx + 1,
      'ID QR': g.qrId,
      'Nama Guru': g.nama,
      'NIP / NUPTK': g.nip,
      Jabatan: g.jabatan,
      'Mata Pelajaran': g.mataPelajaran,
      'Nomor HP': g.nomorHp,
      Alamat: g.alamat,
    }));
    exportToExcel(data, `Data_Guru_Sekolah_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportCsv = () => {
    const data = filtered.map((g, idx) => ({
      No: idx + 1,
      'ID QR': g.qrId,
      'Nama Guru': g.nama,
      'NIP / NUPTK': g.nip,
      Jabatan: g.jabatan,
      'Mata Pelajaran': g.mataPelajaran,
      'Nomor HP': g.nomorHp,
      Alamat: g.alamat,
    }));
    exportToCsv(data, `Data_Guru_Sekolah_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Data Tenaga Pendidik & Guru
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manajemen pendidik, tugas jabatan, dan ID QR presensi mandiri (TCH-xxxxx)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-emerald-200"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Guru</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama guru, NIP, jabatan, atau ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {filtered.length} Guru Terdata
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="px-4 py-3.5 text-center w-12">No</th>
                <th className="px-4 py-3.5">ID QR</th>
                <th className="px-4 py-3.5">Nama Guru & Foto</th>
                <th className="px-4 py-3.5">NIP / NUPTK</th>
                <th className="px-4 py-3.5">Jabatan / Mapel</th>
                <th className="px-4 py-3.5">Nomor HP</th>
                <th className="px-4 py-3.5">Alamat</th>
                <th className="px-4 py-3.5 text-center w-36">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((guru, idx) => (
                <tr key={guru.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                      {guru.qrId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                        <img
                          src={
                            guru.foto ||
                            'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80'
                          }
                          alt={guru.nama}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="font-bold text-slate-900">{guru.nama}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{guru.nip || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900 block">{guru.jabatan}</span>
                    <span className="text-[11px] text-slate-500">{guru.mataPelajaran}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-medium">{guru.nomorHp || '-'}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                    {guru.alamat || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onNavigateToQr(guru.id)}
                        className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        title="Lihat & Cetak Kartu QR Guru"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(guru)}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Edit Data Guru"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(guru)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                        title="Hapus Guru"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH / EDIT GURU */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full flex flex-col shadow-2xl border border-slate-200 my-auto max-h-[90vh]">
            <div className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center flex-shrink-0 rounded-t-2xl">
              <h3 className="font-bold text-base">
                {editingGuru ? `Edit Data: ${editingGuru.nama}` : 'Tambah Guru Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-blue-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap & Gelar *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Dra. Hj. Maryani, M.Pd."
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIP / NUPTK
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 19840214 2008..."
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="text"
                    placeholder="0812..."
                    value={nomorHp}
                    onChange={(e) => setNomorHp(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jabatan Struktural
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Wali Kelas 2 / Guru Mapel"
                    value={jabatan}
                    onChange={(e) => setJabatan(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran Diampu
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Guru Kelas / PAI / PJOK"
                    value={mataPelajaran}
                    onChange={(e) => setMataPelajaran(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Rumah
                </label>
                <textarea
                  rows={2}
                  placeholder="Alamat domisili guru..."
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Foto Guru (Upload atau URL)
                </label>
                <div className="flex gap-2 items-center">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                    <img 
                      src={foto || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80'} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setFoto(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <input
                      type="text"
                      placeholder="Atau masukkan URL gambar https://..."
                      value={foto}
                      onChange={(e) => setFoto(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              {isAdmin && (
                <>
                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-800 mb-2">Akses Login Guru (Opsional)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          placeholder="Bawaan: NIP (tanpa spasi)"
                          value={accountUsername}
                          onChange={(e) => setAccountUsername(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Password
                        </label>
                        <input
                          type="text"
                          placeholder="Bawaan: NIP (tanpa spasi)"
                          value={accountPassword}
                          onChange={(e) => setAccountPassword(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  <span className="font-bold block mb-0.5">Info Akun Otomatis:</span>
                  Saat Anda menyimpan data ini, sistem akan otomatis membuatkan (atau memperbarui) akun login untuk guru ini. 
                  {!isAdmin ? (
                    <>Username & Password default adalah <strong>NIP</strong> (tanpa spasi). Jika NIP kosong, gunakan ID Guru.</>
                  ) : (
                    <>Jika Anda tidak mengisi form di atas, Username & Password default adalah <strong>NIP</strong> (tanpa spasi).</>
                  )}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Hapus Data Guru"
        message={`Apakah Anda yakin ingin menghapus data guru "${deletingGuru?.nama}"? Data yang sudah dihapus tidak dapat dikembalikan.`}
        confirmText="Hapus"
        cancelText="Batal"
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsConfirmOpen(false);
          setDeletingGuru(null);
        }}
      />
    </div>
  );
};
