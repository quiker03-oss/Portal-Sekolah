import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/database';
import { Siswa, Kelas } from '../../types';
import { exportToExcel, exportToCsv } from '../../utils/exportHelper';
import { ConfirmModal } from '../common/ConfirmModal';
import { compressImage } from '../../utils/imageCompressor';
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
  User,
  Loader2,
  Camera,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DataSiswaViewProps {
  onNavigateToImport: (currentFilterKelas?: string) => void;
  onNavigateToQr: (siswaId?: string) => void;
  initialFilterKelas?: string;
}

export const DataSiswaView: React.FC<DataSiswaViewProps> = ({
  onNavigateToImport,
  onNavigateToQr,
  initialFilterKelas,
}) => {
  const [siswaList, setSiswaList] = useState<Siswa[]>(db.getSiswaList());
  const [kelasList, setKelasList] = useState<Kelas[]>(db.getKelasList());
  const [search, setSearch] = useState('');
  const [filterKelas, setFilterKelas] = useState(initialFilterKelas || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sync if initialFilterKelas changes
  useEffect(() => {
    if (initialFilterKelas !== undefined) {
      setFilterKelas(initialFilterKelas);
    }
  }, [initialFilterKelas]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);
  const [deleteTargetSiswa, setDeleteTargetSiswa] = useState<Siswa | null>(null);
  const [formError, setFormError] = useState('');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form fields
  const [nomorInduk, setNomorInduk] = useState('');
  const [nisn, setNisn] = useState('');
  const [namaLengkap, setNamaLengkap] = useState('');
  const [tempatLahir, setTempatLahir] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<'L' | 'P'>('L');
  const [alamat, setAlamat] = useState('');
  const [kelas, setKelas] = useState(initialFilterKelas || 'Kelas 1A');
  const [namaOrangTua, setNamaOrangTua] = useState('');
  const [foto, setFoto] = useState('');
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  const refreshData = () => {
    setSiswaList(db.getSiswaList());
    setKelasList(db.getKelasList());
  };

  const currentUser = db.getCurrentUser();
  const isGuru = currentUser?.role === 'guru';

  useEffect(() => {
    const handleClassUpdate = () => {
      setKelasList(db.getKelasList());
    };
    window.addEventListener('data_siswa_changed', refreshData);
    window.addEventListener('data_kelas_changed', handleClassUpdate);
    return () => {
      window.removeEventListener('data_siswa_changed', refreshData);
      window.removeEventListener('data_kelas_changed', handleClassUpdate);
    };
  }, []);

  // Class counts map
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    siswaList.forEach((s) => {
      if (s.kelas) {
        counts[s.kelas] = (counts[s.kelas] || 0) + 1;
      }
    });
    return counts;
  }, [siswaList]);

  // Dynamic class master combined with students' assigned classes
  const dynamicClasses = useMemo(() => {
    const map = new Map<string, { id: string; nama: string; count: number }>();
    kelasList.forEach((k) => {
      map.set(k.nama, { id: k.id, nama: k.nama, count: classCounts[k.nama] || 0 });
    });
    siswaList.forEach((s) => {
      if (s.kelas && !map.has(s.kelas)) {
        map.set(s.kelas, {
          id: `auto-${s.kelas}`,
          nama: s.kelas,
          count: classCounts[s.kelas] || 0,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [kelasList, siswaList, classCounts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterKelas, pageSize]);

  const openAddModal = () => {
    setEditingSiswa(null);
    setNomorInduk('');
    setNisn('');
    setNamaLengkap('');
    setTempatLahir('Bandung');
    setTanggalLahir('2017-01-01');
    setJenisKelamin('L');
    setAlamat('');
    setKelas(filterKelas || kelasList[0]?.nama || 'Kelas 1A');
    setNamaOrangTua('');
    setFoto('');
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
    setFoto(siswa.foto || '');
    setIsModalOpen(true);
  };

  const handleDelete = (siswa: Siswa) => {
    setDeleteTargetSiswa(siswa);
  };

  const confirmDeleteSiswa = () => {
    if (!deleteTargetSiswa) return;
    const deletedName = deleteTargetSiswa.namaLengkap;
    db.deleteSiswa(deleteTargetSiswa.id);
    setDeleteTargetSiswa(null);
    refreshData();
    setToastMsg({
      type: 'success',
      text: `Data siswa "${deletedName}" berhasil dihapus.`,
    });
    setTimeout(() => setToastMsg(null), 4000);
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
        foto,
      };
      db.saveSiswa(updated);
      setToastMsg({
        type: 'success',
        text: `Data siswa "${namaLengkap}" berhasil diperbarui.`,
      });
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
        foto,
        createdAt: new Date().toISOString().split('T')[0],
      };
      db.saveSiswa(newSiswa);
      setToastMsg({
        type: 'success',
        text: `Siswa baru "${namaLengkap}" berhasil ditambahkan.`,
      });
    }

    setIsModalOpen(false);
    refreshData();
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Filter & Search
  const filtered = siswaList.filter((s) => {
    const matchSearch =
      s.namaLengkap.toLowerCase().includes(search.toLowerCase()) ||
      s.nisn.includes(search) ||
      s.nomorInduk.includes(search) ||
      s.qrId.toLowerCase().includes(search.toLowerCase());
    
    const matchKelas = filterKelas ? s.kelas === filterKelas : true;
    
    return matchSearch && matchKelas;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedSiswa = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

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
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold shadow-xs animate-in fade-in duration-200 ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>Import Data</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-all border border-emerald-200 shadow-[0_1px_2px_rgba(16,185,129,0.05)] cursor-pointer"
            title="Export ke format Microsoft Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export XLS</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>CSV</span>
          </button>

          <button
            id="btn-tambah-siswa"
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_2px_8px_-2px_rgba(37,99,235,0.4)] transition-all cursor-pointer border border-transparent"
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-extrabold text-[10px] tracking-[0.05em]">
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
              {paginatedSiswa.map((siswa, idx) => (
                <tr key={siswa.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 text-center text-slate-400 font-medium">
                    {(currentPage - 1) * pageSize + idx + 1}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                      {siswa.qrId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                        {siswa.foto ? (
                          <img src={siswa.foto} alt={siswa.namaLengkap} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 bg-blue-50 text-[11px] font-bold">
                            {siswa.namaLengkap.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block text-xs">{siswa.namaLengkap}</span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[200px] block">
                          {siswa.alamat}
                        </span>
                      </div>
                    </div>
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

        {/* Pagination Bar */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <span>
                Menampilkan{' '}
                <span className="font-semibold text-slate-800">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                -{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(currentPage * pageSize, filtered.length)}
                </span>{' '}
                dari{' '}
                <span className="font-semibold text-slate-800">{filtered.length}</span> siswa
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">|</span>
                <span className="text-slate-500">Per halaman:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
                  currentPage === 1
                    ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </button>

              <span className="px-2.5 py-1 font-semibold text-slate-700">
                Hal {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
                  currentPage === totalPages
                    ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <span className="hidden sm:inline">Selanjutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
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
                  Foto Siswa (Unggah Foto atau URL)
                </label>
                <div className="flex gap-3 items-center">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 flex-shrink-0 border-2 border-blue-600 shadow-xs relative">
                    {foto ? (
                      <img 
                        src={foto} 
                        alt="Preview Siswa" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <User className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                    {isUploadingFoto && (
                      <div className="absolute inset-0 bg-blue-900/60 flex items-center justify-center text-white">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        id="input-foto-siswa"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIsUploadingFoto(true);
                            try {
                              const compressed = await compressImage(file, 400, 400, 0.82);
                              if (compressed) {
                                setFoto(compressed);
                              }
                            } catch (err) {
                              console.error('Foto siswa compression error:', err);
                              alert('Gagal memproses foto.');
                            } finally {
                              setIsUploadingFoto(false);
                              e.target.value = '';
                            }
                          }
                        }}
                        className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                      {foto && (
                        <button
                          type="button"
                          onClick={() => setFoto('')}
                          className="text-[11px] text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 flex-shrink-0"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
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

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5">
                {editingSiswa ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingSiswa;
                      setIsModalOpen(false);
                      setDeleteTargetSiswa(target);
                    }}
                    className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Siswa Ini</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
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
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTargetSiswa)}
        title="Hapus Data Siswa"
        message={`Apakah Anda yakin ingin menghapus data siswa "${deleteTargetSiswa?.namaLengkap}" (${deleteTargetSiswa?.kelas} - NISN: ${deleteTargetSiswa?.nisn})? Data yang sudah dihapus tidak dapat dipulihkan kembali.`}
        confirmText="Hapus Siswa"
        cancelText="Batal"
        onConfirm={confirmDeleteSiswa}
        onCancel={() => setDeleteTargetSiswa(null)}
      />
    </div>
  );
};
