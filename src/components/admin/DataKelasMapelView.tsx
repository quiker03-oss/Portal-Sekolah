import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { Kelas, MataPelajaran, Guru } from '../../types';
import { ConfirmModal } from '../common/ConfirmModal';
import {
  Building2,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle,
  Users,
} from 'lucide-react';

export const DataKelasMapelView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kelas' | 'mapel'>('kelas');
  const [kelasList, setKelasList] = useState<Kelas[]>(db.getKelasList());
  const [mapelList, setMapelList] = useState<MataPelajaran[]>(db.getMapelList());
  const [guruList] = useState<Guru[]>(db.getGuruList());

  // Confirm delete states
  const [deleteTargetKelas, setDeleteTargetKelas] = useState<Kelas | null>(null);
  const [deleteTargetMapel, setDeleteTargetMapel] = useState<MataPelajaran | null>(null);

  // Modal Kelas
  const [isKelasModalOpen, setIsKelasModalOpen] = useState(false);
  const [editingKelas, setEditingKelas] = useState<Kelas | null>(null);
  const [namaKelas, setNamaKelas] = useState('');
  const [tingkat, setTingkat] = useState(1);
  const [waliKelas, setWaliKelas] = useState('');

  // Modal Mapel
  const [isMapelModalOpen, setIsMapelModalOpen] = useState(false);
  const [editingMapel, setEditingMapel] = useState<MataPelajaran | null>(null);
  const [kodeMapel, setKodeMapel] = useState('');
  const [namaMapel, setNamaMapel] = useState('');
  const [kkm, setKkm] = useState(75);
  const [guruPengampu, setGuruPengampu] = useState('');

  const refreshData = () => {
    setKelasList(db.getKelasList());
    setMapelList(db.getMapelList());
  };

  useEffect(() => {
    window.addEventListener('data_kelas_changed', refreshData);
    window.addEventListener('data_mapel_changed', refreshData);
    return () => {
      window.removeEventListener('data_kelas_changed', refreshData);
      window.removeEventListener('data_mapel_changed', refreshData);
    };
  }, []);

  // KELAS HANDLERS
  const openAddKelas = () => {
    setEditingKelas(null);
    setNamaKelas('');
    setTingkat(1);
    setWaliKelas(guruList[0]?.nama || '');
    setIsKelasModalOpen(true);
  };

  const openEditKelas = (k: Kelas) => {
    setEditingKelas(k);
    setNamaKelas(k.nama);
    setTingkat(k.tingkat);
    setWaliKelas(k.waliKelas || '');
    setIsKelasModalOpen(true);
  };

  const handleDeleteKelas = (k: Kelas) => {
    setDeleteTargetKelas(k);
  };

  const confirmDeleteKelas = () => {
    if (!deleteTargetKelas) return;
    db.deleteKelas(deleteTargetKelas.id);
    setDeleteTargetKelas(null);
    refreshData();
  };

  const handleSaveKelas = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKelas.trim()) return;

    if (editingKelas) {
      db.saveKelas({
        ...editingKelas,
        nama: namaKelas,
        tingkat: Number(tingkat),
        waliKelas,
      });
    } else {
      db.saveKelas({
        id: `cls-${Date.now()}`,
        nama: namaKelas,
        tingkat: Number(tingkat),
        waliKelas,
      });
    }
    setIsKelasModalOpen(false);
    refreshData();
  };

  // MAPEL HANDLERS
  const openAddMapel = () => {
    setEditingMapel(null);
    setKodeMapel(`MP-${Math.floor(100 + Math.random() * 900)}`);
    setNamaMapel('');
    setKkm(75);
    setGuruPengampu(guruList[0]?.nama || '');
    setIsMapelModalOpen(true);
  };

  const openEditMapel = (m: MataPelajaran) => {
    setEditingMapel(m);
    setKodeMapel(m.kode);
    setNamaMapel(m.nama);
    setKkm(m.kkm);
    setGuruPengampu(m.guruPengampu || '');
    setIsMapelModalOpen(true);
  };

  const handleDeleteMapel = (m: MataPelajaran) => {
    setDeleteTargetMapel(m);
  };

  const confirmDeleteMapel = () => {
    if (!deleteTargetMapel) return;
    db.deleteMapel(deleteTargetMapel.id);
    setDeleteTargetMapel(null);
    refreshData();
  };

  const handleSaveMapel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaMapel.trim()) return;

    if (editingMapel) {
      db.saveMapel({
        ...editingMapel,
        kode: kodeMapel,
        nama: namaMapel,
        kkm: Number(kkm),
        guruPengampu,
      });
    } else {
      db.saveMapel({
        id: `mapel-${Date.now()}`,
        kode: kodeMapel,
        nama: namaMapel,
        kkm: Number(kkm),
        guruPengampu,
      });
    }
    setIsMapelModalOpen(false);
    refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Data Rombel Kelas & Mata Pelajaran
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Konfigurasi rombongan belajar, penugasan wali kelas, struktur kurikulum mata pelajaran dan KKM
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('kelas')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'kelas'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Data Kelas ({kelasList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('mapel')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'mapel'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Mata Pelajaran ({mapelList.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: KELAS */}
      {activeTab === 'kelas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-700">
              Daftar Rombel Satuan Pendidikan
            </span>
            <button
              onClick={openAddKelas}
              className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kelas</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kelasList.map((k) => {
              const studentsInClass = db.getSiswaList().filter((s) => s.kelas === k.nama).length;
              return (
                <div
                  key={k.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                        Tingkat {k.tingkat}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditKelas(k)}
                          className="p-1 rounded-lg text-blue-700 hover:bg-blue-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteKelas(k)}
                          className="p-1 rounded-lg text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-lg font-extrabold text-slate-900">{k.nama}</h3>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        <strong>Wali Kelas:</strong> {k.waliKelas || <span className="text-slate-400 italic">Belum ditentukan</span>}
                      </p>
                      <p className="flex items-center gap-1 text-slate-500">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        <span>{studentsInClass} Peserta Didik</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MAPEL */}
      {activeTab === 'mapel' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-700">
              Struktur Kurikulum & Kriteria Ketuntasan Minimal (KKM)
            </span>
            <button
              onClick={openAddMapel}
              className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Mata Pelajaran</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="px-4 py-3 text-center w-12">No</th>
                  <th className="px-4 py-3">Kode Mapel</th>
                  <th className="px-4 py-3">Nama Mata Pelajaran</th>
                  <th className="px-4 py-3 text-center">Standar KKM</th>
                  <th className="px-4 py-3">Guru Pengampu</th>
                  <th className="px-4 py-3 text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {mapelList.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">{m.kode}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{m.nama}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono">
                        {m.kkm}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.guruPengampu || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditMapel(m)}
                          className="p-1 rounded-lg text-blue-700 hover:bg-blue-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMapel(m)}
                          className="p-1 rounded-lg text-rose-600 hover:bg-rose-50"
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
      )}

      {/* MODAL KELAS */}
      {isKelasModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-base">
                {editingKelas ? `Edit Kelas: ${editingKelas.nama}` : 'Tambah Rombel Kelas'}
              </h3>
              <button onClick={() => setIsKelasModalOpen(false)} className="text-blue-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveKelas} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Rombel / Kelas *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kelas 1A"
                  value={namaKelas}
                  onChange={(e) => setNamaKelas(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tingkat Kelas (1 - 6)
                </label>
                <select
                  value={tingkat}
                  onChange={(e) => setTingkat(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                >
                  {[1, 2, 3, 4, 5, 6].map((t) => (
                    <option key={t} value={t}>
                      Kelas {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Wali Kelas Ditugaskan
                </label>
                <select
                  value={waliKelas}
                  onChange={(e) => setWaliKelas(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                >
                  <option value="">-- Pilih Guru Wali Kelas --</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.nama}>
                      {g.nama} ({g.jabatan})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsKelasModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MAPEL */}
      {isMapelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-base">
                {editingMapel ? `Edit Mapel: ${editingMapel.nama}` : 'Tambah Mata Pelajaran'}
              </h3>
              <button onClick={() => setIsMapelModalOpen(false)} className="text-blue-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveMapel} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Mata Pelajaran
                </label>
                <input
                  type="text"
                  required
                  value={kodeMapel}
                  onChange={(e) => setKodeMapel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Mata Pelajaran *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Matematika"
                  value={namaMapel}
                  onChange={(e) => setNamaMapel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nilai KKM (Ketuntasan Minimal)
                </label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={kkm}
                  onChange={(e) => setKkm(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Guru Pengampu
                </label>
                <select
                  value={guruPengampu}
                  onChange={(e) => setGuruPengampu(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                >
                  <option value="">-- Pilih Guru Pengampu --</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.nama}>
                      {g.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMapelModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Simpan Mapel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Konfirmasi Hapus Kelas */}
      <ConfirmModal
        isOpen={!!deleteTargetKelas}
        title="Hapus Data Kelas"
        message={`Apakah Anda yakin ingin menghapus kelas "${deleteTargetKelas?.nama}"? Siswa di rombel ini tetap tersimpan.`}
        confirmLabel="Hapus Kelas"
        onConfirm={confirmDeleteKelas}
        onCancel={() => setDeleteTargetKelas(null)}
      />

      {/* Modal Konfirmasi Hapus Mapel */}
      <ConfirmModal
        isOpen={!!deleteTargetMapel}
        title="Hapus Mata Pelajaran"
        message={`Apakah Anda yakin ingin menghapus mata pelajaran "${deleteTargetMapel?.nama}" (${deleteTargetMapel?.kode})?`}
        confirmLabel="Hapus Mapel"
        onConfirm={confirmDeleteMapel}
        onCancel={() => setDeleteTargetMapel(null)}
      />
    </div>
  );
};
