import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { Siswa, Kelas } from '../../types';
import { exportToExcel, exportToCsv } from '../../utils/exportHelper';
import { ConfirmModal } from '../common/ConfirmModal';
import {
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit2,
  Trash2,
  QrCode,
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface DataSiswaViewProps {
  onNavigateToImport: () => void;
  onNavigateToQr: (siswaId?: string) => void;
}

export const DataSiswaView: React.FC<DataSiswaViewProps> = ({
  onNavigateToImport,
  onNavigateToQr,
}) => {
  const [siswaList, setSiswaList] = useState<Siswa[]>(db.getSiswaList());
  const [kelasList] = useState<Kelas[]>(db.getKelasList());
  const [search, setSearch] = useState('');
  const [filterKelas, setFilterKelas] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);
  const [deleteTargetSiswa, setDeleteTargetSiswa] = useState<Siswa | null>(null);
  const [formError, setFormError] = useState('');

  // Form fields
  const [nomorInduk, setNomorInduk] = useState('');
  const [nisn, setNisn] = useState('');
  const [namaLengkap, setNamaLengkap] = useState('');
  const [tempatLahir, setTempatLahir] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<'L' | 'P'>('L');
  const [alamat, setAlamat] = useState('');
  const [kelas, setKelas] = useState('Kelas 1A');
  const [namaOrangTua, setNamaOrangTua] = useState('');

  const refreshData = () => {
    setSiswaList(db.getSiswaList());
  };

  const currentUser = db.getCurrentUser();
  const isGuru = currentUser?.role === 'guru';
  const guruKelas = isGuru ? kelasList.find(k => k.waliKelasId === currentUser?.guruId) : null;
  const enforcedKelasFilter = isGuru ? (guruKelas?.nama || 'NONE') : '';

  useEffect(() => {
    window.addEventListener('data_siswa_changed', refreshData);
    return () => window.removeEventListener('data_siswa_changed', refreshData);
  }, []);

  const openAddModal = () => {
    setEditingSiswa(null);
    setNomorInduk('');
    setNisn('');
    setNamaLengkap('');
    setTempatLahir('Bandung');
    setTanggalLahir('2017-01-01');
    setJenisKelamin('L');
    setAlamat('');
    setKelas(kelasList[0]?.nama || 'Kelas 1A');
    setNamaOrangTua('');
    setIsModalOpen(true);
  };

  const openEditModal = (siswa: Siswa) => {
    setEditingSiswa(siswa);
    setNomorInduk(siswa.nomorInduk);
    setNisn(siswa.nisn);
    setNamaLengkap(siswa.namaLengkap);
    setTempatLahir(siswa.tempatLahir);
    setTanggalLahir(siswa.tanggalLahir);
    setJenisKelamin(siswa.jenisKelamin);
    setAlamat(siswa.alamat);
    setKelas(siswa.kelas);
    setNamaOrangTua(siswa.namaOrangTua);
    setIsModalOpen(true);
  };

  const handleDelete = (siswa: Siswa) => {
    setDeleteTargetSiswa(siswa);
  };

  const confirmDeleteSiswa = () => {
    if (!deleteTargetSiswa) return;
    db.deleteSiswa(deleteTargetSiswa.id);
    setDeleteTargetSiswa(null);
    refreshData();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!namaLengkap.trim() || !nisn.trim()) {
      setFormError('Nama lengkap dan NISN wajib diisi!');
      return;
    }
    setFormError('');

    if (editingSiswa) {
      const updated: Siswa = {
        ...editingSiswa,
        nomorInduk,
        nisn,
        namaLengkap,
        tempatLahir,
        tanggalLahir,
        jenisKelamin,
        alamat,
        kelas,
        namaOrangTua,
      };
      db.saveSiswa(updated);
    } else {
      const newSiswa: Siswa = {
        id: `stu-${Date.now()}`,
        qrId: db.generateNextSiswaQrId(),
        nomorInduk: nomorInduk || `NI-${Math.floor(1000 + Math.random() * 9000)}`,
        nisn,
        namaLengkap,
        tempatLahir,
        tanggalLahir,
        jenisKelamin,
        alamat,
        kelas,
        namaOrangTua,
        createdAt: new Date().toISOString().split('T')[0],
      };
      db.saveSiswa(newSiswa);
    }

    setIsModalOpen(false);
    refreshData();
  };

  // Filter & Search
  const filtered = siswaList.filter((s) => {
    const matchSearch =
      s.namaLengkap.toLowerCase().includes(search.toLowerCase()) ||
      s.nisn.includes(search) ||
      s.nomorInduk.includes(search) ||
      s.qrId.toLowerCase().includes(search.toLowerCase());
    
    const activeFilterKelas = isGuru ? enforcedKelasFilter : filterKelas;
    const matchKelas = activeFilterKelas ? s.kelas === activeFilterKelas : true;
    
    return matchSearch && matchKelas;
  });

  const handleExportExcel = () => {
    const data = filtered.map((s, idx) => ({
      No: idx + 1,
      'ID QR': s.qrId,
      'No. Induk': s.nomorInduk,
      NISN: s.nisn,
      'Nama Lengkap': s.namaLengkap,
      'Jenis Kelamin': s.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
      Kelas: s.kelas,
      'Tempat Lahir': s.tempatLahir,
      'Tanggal Lahir': s.tanggalLahir,
      'Orang Tua / Wali': s.namaOrangTua,
      Alamat: s.alamat,
    }));
    exportToExcel(data, `Data_Siswa_Sekolah_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportCsv = () => {
    const data = filtered.map((s, idx) => ({
      No: idx + 1,
      'ID QR': s.qrId,
      'No. Induk': s.nomorInduk,
      NISN: s.nisn,
      'Nama Lengkap': s.namaLengkap,
      'Jenis Kelamin': s.jenisKelamin,
      Kelas: s.kelas,
      'Tempat Lahir': s.tempatLahir,
      'Tanggal Lahir': s.tanggalLahir,
      'Orang Tua / Wali': s.namaOrangTua,
      Alamat: s.alamat,
    }));
    exportToCsv(data, `Data_Siswa_Sekolah_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Data Peserta Didik (Siswa)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola data pokok siswa, generasi ID QR Code unik, dan sinkronisasi kelas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-nav-import-siswa"
            onClick={onNavigateToImport}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-blue-700" />
            <span>Import Excel / CSV</span>
          </button>

          <div className="relative inline-block">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-emerald-200"
              title="Export ke format Microsoft Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            id="btn-tambah-siswa"
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Siswa</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-cari-siswa"
            type="text"
            placeholder="Cari nama, NISN, No Induk, atau ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {!isGuru && (
            <div className="flex items-center gap-2 text-xs text-slate-600 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="font-semibold text-xs whitespace-nowrap">Filter Kelas:</span>
              <select
                id="select-filter-kelas"
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Semua Kelas ({siswaList.length})</option>
                {kelasList.map((k) => (
                  <option key={k.id} value={k.nama}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
            {filtered.length} Siswa Ditemukan
          </span>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="px-4 py-3.5 text-center w-12">No</th>
                <th className="px-4 py-3.5">ID Siswa (QR)</th>
                <th className="px-4 py-3.5">Nama Lengkap</th>
                <th className="px-4 py-3.5">NISN / No Induk</th>
                <th className="px-4 py-3.5">Kelas</th>
                <th className="px-4 py-3.5">L/P</th>
                <th className="px-4 py-3.5">Tempat, Tgl Lahir</th>
                <th className="px-4 py-3.5">Nama Orang Tua</th>
                <th className="px-4 py-3.5 text-center w-36">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((siswa, idx) => (
                <tr key={siswa.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                      {siswa.qrId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 block text-xs">{siswa.namaLengkap}</span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[200px] block">
                      {siswa.alamat}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{siswa.nisn}</span>
                    <span className="block text-[11px] text-slate-400">NI: {siswa.nomorInduk}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px]">
                      {siswa.kelas}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                        siswa.jenisKelamin === 'L'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {siswa.jenisKelamin}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {siswa.tempatLahir}, {siswa.tanggalLahir}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{siswa.namaOrangTua || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onNavigateToQr(siswa.id)}
                        className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        title="Lihat & Unduh QR Siswa"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(siswa)}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Edit Data Siswa"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(siswa)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                        title="Hapus Siswa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Tidak ada data siswa yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM TAMBAH / EDIT SISWA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-base">
                {editingSiswa ? `Edit Data Siswa: ${editingSiswa.namaLengkap}` : 'Tambah Siswa Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-blue-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap Siswa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Muhammad Rizki"
                    value={namaLengkap}
                    onChange={(e) => setNamaLengkap(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NISN (10 Digit) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 0165432109"
                    value={nisn}
                    onChange={(e) => setNisn(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Induk Siswa (Buku Induk)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 23240101"
                    value={nomorInduk}
                    onChange={(e) => setNomorInduk(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelas / Rombel *
                  </label>
                  <select
                    value={kelas}
                    onChange={(e) => setKelas(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  >
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.nama}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Kelamin
                  </label>
                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={jenisKelamin === 'L'}
                        onChange={() => setJenisKelamin('L')}
                        className="text-blue-600"
                      />
                      Laki-laki (L)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={jenisKelamin === 'P'}
                        onChange={() => setJenisKelamin('P')}
                        className="text-blue-600"
                      />
                      Perempuan (P)
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Orang Tua / Wali
                  </label>
                  <input
                    type="text"
                    placeholder="Nama ayah / ibu / wali"
                    value={namaOrangTua}
                    onChange={(e) => setNamaOrangTua(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tempat Lahir
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Bandung"
                    value={tempatLahir}
                    onChange={(e) => setTempatLahir(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    value={tanggalLahir}
                    onChange={(e) => setTanggalLahir(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Tempat Tinggal
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Kp. Giriharja RT 02 RW 04, Ciparay"
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 shadow-xs"
                >
                  {editingSiswa ? 'Simpan Perubahan' : 'Tambahkan Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
