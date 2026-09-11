import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/database';
import { Kelas, MataPelajaran, Siswa, NilaiHarianItem } from '../../types';
import { ConfirmModal } from '../common/ConfirmModal';
import {
  FileSpreadsheet,
  Plus,
  Save,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  Layers,
  Printer,
  Sparkles,
} from 'lucide-react';

export const NilaiHarianView: React.FC = () => {
  const [kelasList, setKelasList] = useState<Kelas[]>(db.getKelasList());
  const [mapelList, setMapelList] = useState<MataPelajaran[]>(db.getMapelList());
  const [siswaList, setSiswaList] = useState<Siswa[]>(db.getSiswaList());
  const [nilaiHarianList, setNilaiHarianList] = useState<NilaiHarianItem[]>(db.getNilaiHarianList());

  // Filter selections
  const [selectedKelasId, setSelectedKelasId] = useState<string>(kelasList[0]?.id || '');
  const [selectedMapelId, setSelectedMapelId] = useState<string>(mapelList[0]?.id || '');

  // Assessment Info
  const [jenisPenilaian, setJenisPenilaian] = useState<'Tugas' | 'Ulangan Harian' | 'Formatif' | 'Kuis' | 'Praktik'>('Ulangan Harian');
  const [materi, setMateri] = useState<string>('Bab 1: Capaian Pembelajaran Utama');
  const [tanggal, setTanggal] = useState<string>(new Date().toISOString().split('T')[0]);

  // Scores state: studentId -> { nilai: number, catatan: string }
  const [scores, setScores] = useState<Record<string, { nilai: number; catatan: string }>>({});
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'input' | 'riwayat'>('input');

  // Confirmation Modal state
  const [itemToDelete, setItemToDelete] = useState<NilaiHarianItem | null>(null);

  // Reload data
  const refreshData = () => {
    setKelasList(db.getKelasList());
    setMapelList(db.getMapelList());
    setSiswaList(db.getSiswaList());
    setNilaiHarianList(db.getNilaiHarianList());
  };

  useEffect(() => {
    window.addEventListener('nilai_harian_updated', refreshData);
    window.addEventListener('data_kelas_changed', refreshData);
    return () => {
      window.removeEventListener('nilai_harian_updated', refreshData);
      window.removeEventListener('data_kelas_changed', refreshData);
    };
  }, []);

  const activeKelas = useMemo(() => {
    return kelasList.find((k) => k.id === selectedKelasId) || kelasList[0];
  }, [kelasList, selectedKelasId]);

  const activeMapel = useMemo(() => {
    return mapelList.find((m) => m.id === selectedMapelId) || mapelList[0];
  }, [mapelList, selectedMapelId]);

  const studentsInClass = useMemo(() => {
    if (!activeKelas) return [];
    return siswaList.filter((s) => s.kelas === activeKelas.nama);
  }, [siswaList, activeKelas]);

  // Load existing scores when selecting class, mapel, materi, or jenis
  useEffect(() => {
    if (!activeKelas || !activeMapel) return;

    const existingEntries = nilaiHarianList.filter(
      (n) =>
        n.kelasId === activeKelas.id &&
        n.mapelId === activeMapel.id &&
        n.materi === materi &&
        n.jenisPenilaian === jenisPenilaian
    );

    const initialScores: Record<string, { nilai: number; catatan: string }> = {};
    studentsInClass.forEach((s) => {
      const found = existingEntries.find((e) => e.siswaId === s.id);
      initialScores[s.id] = {
        nilai: found ? found.nilai : 0,
        catatan: found?.catatan || '',
      };
    });

    setScores(initialScores);
  }, [activeKelas, activeMapel, materi, jenisPenilaian, nilaiHarianList, studentsInClass]);

  const handleScoreChange = (siswaId: string, value: string) => {
    const num = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
    setScores((prev) => ({
      ...prev,
      [siswaId]: {
        ...prev[siswaId],
        nilai: num,
      },
    }));
  };

  const handleCatatanChange = (siswaId: string, catatan: string) => {
    setScores((prev) => ({
      ...prev,
      [siswaId]: {
        ...prev[siswaId],
        catatan,
      },
    }));
  };

  // Bulk Save all scores for current assessment
  const handleSaveAllScores = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeKelas || !activeMapel) return;

    const itemsToSave: NilaiHarianItem[] = studentsInClass.map((siswa) => {
      const studentScore = scores[siswa.id] || { nilai: 0, catatan: '' };
      // Check if item already exists
      const existing = nilaiHarianList.find(
        (n) =>
          n.siswaId === siswa.id &&
          n.kelasId === activeKelas.id &&
          n.mapelId === activeMapel.id &&
          n.materi === materi &&
          n.jenisPenilaian === jenisPenilaian
      );

      return {
        id: existing ? existing.id : `nh-${Date.now()}-${siswa.id.slice(-4)}-${Math.random().toString(36).slice(2, 6)}`,
        siswaId: siswa.id,
        namaSiswa: siswa.namaLengkap,
        kelasId: activeKelas.id,
        namaKelas: activeKelas.nama,
        mapelId: activeMapel.id,
        namaMapel: activeMapel.nama,
        jenisPenilaian,
        materi: materi.trim() || 'Penilaian Harian',
        tanggal,
        nilai: studentScore.nilai,
        catatan: studentScore.catatan,
      };
    });

    db.saveBulkNilaiHarian(itemsToSave);
    setSuccessMsg(`Nilai harian ${activeKelas.nama} - ${activeMapel.nama} (${materi}) berhasil disimpan!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Quick fill all scores
  const handleQuickFill = () => {
    const val = prompt('Masukkan nilai serentak untuk semua siswa (0 - 100):', '80');
    if (val === null) return;
    const num = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
    const newScores: Record<string, { nilai: number; catatan: string }> = {};
    studentsInClass.forEach((s) => {
      newScores[s.id] = {
        nilai: num,
        catatan: scores[s.id]?.catatan || '',
      };
    });
    setScores(newScores);
  };

  // Delete an assessment record from history
  const confirmDeleteNilai = () => {
    if (!itemToDelete) return;
    db.deleteNilaiHarian(itemToDelete.id);
    setItemToDelete(null);
    setSuccessMsg('Rekaman penilaian berhasil dihapus.');
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  // Stats calculation
  const kkm = activeMapel?.kkm || 75;
  const scoreEntries = studentsInClass.map((s) => scores[s.id]?.nilai || 0);
  const totalStudents = studentsInClass.length;
  const avgScore = totalStudents > 0 ? (scoreEntries.reduce((a, b) => a + b, 0) / totalStudents).toFixed(1) : '0';
  const tuntasCount = scoreEntries.filter((s) => s >= kkm).length;
  const remedialCount = totalStudents - tuntasCount;

  // History list for active class and mapel
  const historyList = useMemo(() => {
    if (!activeKelas) return [];
    return nilaiHarianList.filter((n) => n.kelasId === activeKelas.id);
  }, [nilaiHarianList, activeKelas]);

  if (!activeKelas || !activeMapel) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
        Silakan daftarkan Kelas dan Mata Pelajaran terlebih dahulu di menu <strong>Kelas & Mapel</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-700 font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pengelolaan Nilai Harian</h2>
              <p className="text-xs text-slate-500">
                Pencatatan ulangan harian, tugas, kuis, dan penilaian formatif per kompetensi materi
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('input')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'input'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Form Input Nilai
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'riwayat'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Riwayat ({historyList.length})</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: FORM INPUT NILAI */}
      {activeTab === 'input' && (
        <div className="space-y-6">
          {/* Class, Mapel, & Topic Selection Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-blue-700" />
                Parameter Penilaian Harian
              </span>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                KKM {activeMapel.nama}: {kkm}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Kelas Selector */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Pilih Kelas</label>
                <select
                  value={selectedKelasId}
                  onChange={(e) => setSelectedKelasId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 bg-white"
                >
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama} (Tingkat {k.tingkat})
                    </option>
                  ))}
                </select>
              </div>

              {/* Mapel Selector */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Mata Pelajaran</label>
                <select
                  value={selectedMapelId}
                  onChange={(e) => setSelectedMapelId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 bg-white"
                >
                  {mapelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.kode} - {m.nama} (KKM {m.kkm})
                    </option>
                  ))}
                </select>
              </div>

              {/* Jenis Penilaian */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Jenis Penilaian</label>
                <select
                  value={jenisPenilaian}
                  onChange={(e) => setJenisPenilaian(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 bg-white"
                >
                  <option value="Ulangan Harian">Ulangan Harian (Sumatif Bab)</option>
                  <option value="Tugas">Tugas Terstruktur</option>
                  <option value="Formatif">Asesmen Formatif</option>
                  <option value="Kuis">Kuis Interaktif</option>
                  <option value="Praktik">Unjuk Kerja / Praktik</option>
                </select>
              </div>

              {/* Tanggal */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Tanggal Pelaksanaan</label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            {/* Materi / Bab Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Materi / Capaian Pembelajaran / Judul Bab
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  placeholder="Contoh: Bab 1: Bilangan Cacah s.d. 1.000 atau Subtema 2: Tubuhku"
                  value={materi}
                  onChange={(e) => setMateri(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
                <button
                  type="button"
                  onClick={handleQuickFill}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Isi Serentak</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Siswa
              </span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalStudents}</div>
              <span className="text-[11px] text-blue-600 font-medium">{activeKelas.nama}</span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Rata-rata Kelas
              </span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{avgScore}</div>
              <span className="text-[11px] text-slate-500 font-medium">Standar KKM {kkm}</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 shadow-xs">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
                Tuntas (≥ KKM)
              </span>
              <div className="text-2xl font-extrabold text-emerald-800 mt-1">{tuntasCount}</div>
              <span className="text-[11px] text-emerald-700 font-medium">
                {totalStudents > 0 ? ((tuntasCount / totalStudents) * 100).toFixed(0) : 0}% dari kelas
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 shadow-xs">
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
                Remedial (&lt; KKM)
              </span>
              <div className="text-2xl font-extrabold text-rose-800 mt-1">{remedialCount}</div>
              <span className="text-[11px] text-rose-700 font-medium">Perlu bimbingan lanjutan</span>
            </div>
          </div>

          {/* Student Grading Table */}
          <form onSubmit={handleSaveAllScores} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Daftar Peserta Didik: {activeKelas.nama} ({studentsInClass.length} Siswa)
                </h3>
                <p className="text-xs text-slate-500">
                  Ketik nilai (skala 0 - 100) dan catatan deskripsi singkat jika diperlukan
                </p>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Semua Nilai</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-bold text-slate-700 text-center w-12">No</th>
                    <th className="px-4 py-3 font-bold text-slate-700">Nama Siswa</th>
                    <th className="px-3 py-3 font-bold text-slate-700 text-center w-28">NISN</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-center w-36">Nilai (0 - 100)</th>
                    <th className="px-3 py-3 font-bold text-slate-700 text-center w-28">Status</th>
                    <th className="px-4 py-3 font-bold text-slate-700">Catatan Guru / Tindak Lanjut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentsInClass.map((siswa, idx) => {
                    const studentScore = scores[siswa.id] || { nilai: 0, catatan: '' };
                    const isTuntas = studentScore.nilai >= kkm;

                    return (
                      <tr key={siswa.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{siswa.namaLengkap}</div>
                          <div className="text-[10px] text-slate-500 font-mono">No. Induk: {siswa.nomorInduk}</div>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-500 font-mono">
                          {siswa.nisn || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={studentScore.nilai || ''}
                            onChange={(e) => handleScoreChange(siswa.id, e.target.value)}
                            placeholder="0"
                            className={`w-24 text-center font-bold px-2 py-1.5 rounded-xl border text-sm transition-all focus:ring-2 ${
                              isTuntas
                                ? 'border-emerald-300 bg-emerald-50/40 text-emerald-900 focus:ring-emerald-500/20'
                                : 'border-rose-300 bg-rose-50/40 text-rose-900 focus:ring-rose-500/20'
                            }`}
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                              isTuntas
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {isTuntas ? 'Tuntas' : 'Remedial'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={studentScore.catatan || ''}
                            onChange={(e) => handleCatatanChange(siswa.id, e.target.value)}
                            placeholder="Catatan perkembangan belajar atau tugas remedial..."
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-600/20"
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {studentsInClass.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Belum ada siswa terdaftar di {activeKelas.nama}. Silakan tambahkan siswa di menu{' '}
                        <strong>Data Siswa</strong>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {studentsInClass.length > 0 && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Semua Nilai ({studentsInClass.length} Siswa)</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* TAB 2: RIWAYAT PENILAIAN */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Riwayat Rekapan Nilai Harian: {activeKelas.nama}
              </h3>
              <p className="text-xs text-slate-500">
                Semua nilai yang telah diinput oleh guru untuk kelas ini
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Rekap</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-bold text-center w-12">No</th>
                  <th className="px-4 py-3 font-bold">Tanggal</th>
                  <th className="px-4 py-3 font-bold">Mata Pelajaran</th>
                  <th className="px-3 py-3 font-bold">Jenis</th>
                  <th className="px-4 py-3 font-bold">Materi / Bab</th>
                  <th className="px-4 py-3 font-bold">Nama Siswa</th>
                  <th className="px-3 py-3 font-bold text-center w-20">Nilai</th>
                  <th className="px-4 py-3 font-bold">Catatan</th>
                  <th className="px-3 py-3 font-bold text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyList.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{item.tanggal}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{item.namaMapel}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                        {item.jenisPenilaian}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{item.materi}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-900">{item.namaSiswa}</td>
                    <td className="px-3 py-2.5 text-center font-bold font-mono">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          item.nilai >= 75
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.nilai}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 italic">{item.catatan || '-'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setItemToDelete(item)}
                        className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Hapus rekaman nilai ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}

                {historyList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Belum ada rekaman nilai harian tersimpan untuk {activeKelas.nama}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete */}
      <ConfirmModal
        isOpen={!!itemToDelete}
        title="Hapus Rekaman Nilai"
        message={`Apakah Anda yakin ingin menghapus nilai ${itemToDelete?.jenisPenilaian} atas nama "${itemToDelete?.namaSiswa}"?`}
        confirmLabel="Hapus Nilai"
        onConfirm={confirmDeleteNilai}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};
