import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { Siswa, Kelas, MataPelajaran, NilaiSiswa, Settings } from '../../types';
import { printElement, exportToExcel, openPrintWindow } from '../../utils/exportHelper';
import {
  FileText,
  Printer,
  Edit2,
  Save,
  CheckCircle,
  Search,
  Filter,
  Award,
  Calendar,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

export const ERaporView: React.FC = () => {
  const [kelasList] = useState<Kelas[]>(db.getKelasList());
  const [mapelList] = useState<MataPelajaran[]>(db.getMapelList());
  const [selectedKelas, setSelectedKelas] = useState(kelasList[0]?.nama || 'Kelas 1A');
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null);
  const [nilaiList, setNilaiList] = useState<NilaiSiswa[]>([]);
  const [settings, setSettings] = useState<Settings>(db.getSettings());

  // Input grades modal or inline editing state
  const [isEditNilaiOpen, setIsEditNilaiOpen] = useState(false);
  const [editingMapelId, setEditingMapelId] = useState<string>('');
  const [valTugas, setValTugas] = useState<number>(80);
  const [valUts, setValUts] = useState<number>(80);
  const [valUas, setValUas] = useState<number>(80);
  const [valCatatan, setValCatatan] = useState<string>('');

  useEffect(() => {
    const studentsInClass = db.getSiswaList().filter((s) => s.kelas === selectedKelas);
    setSiswaList(studentsInClass);
    if (studentsInClass.length > 0) {
      setSelectedSiswa(studentsInClass[0]);
    } else {
      setSelectedSiswa(null);
    }
  }, [selectedKelas]);

  useEffect(() => {
    if (selectedSiswa) {
      setNilaiList(db.getNilaiBySiswa(selectedSiswa.id));
    } else {
      setNilaiList([]);
    }
  }, [selectedSiswa]);

  // Helper calculation for Nilai Akhir & Predikat
  const calculateGrade = (tugas: number, uts: number, uas: number) => {
    // Standard elementary school weighting: 30% Tugas + 30% UTS + 40% UAS
    const akhir = Math.round(tugas * 0.3 + uts * 0.3 + uas * 0.4);
    let predikat: 'A' | 'B' | 'C' | 'D' = 'C';
    if (akhir >= 90) predikat = 'A';
    else if (akhir >= 80) predikat = 'B';
    else if (akhir >= 70) predikat = 'C';
    else predikat = 'D';

    return { akhir, predikat };
  };

  const handleOpenEditNilai = (mapel: MataPelajaran) => {
    setEditingMapelId(mapel.id);
    const existing = nilaiList.find((n) => n.mapelId === mapel.id);
    if (existing) {
      setValTugas(existing.tugas);
      setValUts(existing.uts);
      setValUas(existing.uas);
      setValCatatan(existing.catatan || '');
    } else {
      setValTugas(85);
      setValUts(85);
      setValUas(85);
      setValCatatan('Mencapai kompetensi dengan sangat baik.');
    }
    setIsEditNilaiOpen(true);
  };

  const handleSaveNilai = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSiswa || !editingMapelId) return;

    const mapel = mapelList.find((m) => m.id === editingMapelId);
    if (!mapel) return;

    const { akhir, predikat } = calculateGrade(Number(valTugas), Number(valUts), Number(valUas));

    const rec: NilaiSiswa = {
      id: `nil-${selectedSiswa.id}-${editingMapelId}`,
      siswaId: selectedSiswa.id,
      mapelId: mapel.id,
      namaMapel: mapel.nama,
      tugas: Number(valTugas),
      uts: Number(valUts),
      uas: Number(valUas),
      nilaiAkhir: akhir,
      predikat,
      catatan: valCatatan,
      semester: settings.semesterAktif,
      tahunAjaran: settings.tahunAjaranAktif,
    };

    db.saveNilai(rec);
    setNilaiList(db.getNilaiBySiswa(selectedSiswa.id));
    setIsEditNilaiOpen(false);
  };

  // Quick autofill grades for students who don't have grades yet
  const handleAutoGenerateGrades = () => {
    if (!selectedSiswa) return;
    mapelList.forEach((m, idx) => {
      const baseScore = 80 + ((idx * 3 + selectedSiswa.namaLengkap.length) % 15);
      const tugas = Math.min(98, baseScore);
      const uts = Math.min(96, baseScore - 2);
      const uas = Math.min(97, baseScore + 2);
      const { akhir, predikat } = calculateGrade(tugas, uts, uas);

      db.saveNilai({
        id: `nil-${selectedSiswa.id}-${m.id}`,
        siswaId: selectedSiswa.id,
        mapelId: m.id,
        namaMapel: m.nama,
        tugas,
        uts,
        uas,
        nilaiAkhir: akhir,
        predikat,
        catatan:
          predikat === 'A'
            ? 'Menunjukkan penguasaan materi sangat baik pada seluruh indikator capaian pembelajaran.'
            : 'Mampu memahami materi dengan baik dan aktif mengikuti kegiatan pembelajaran.',
        semester: settings.semesterAktif,
        tahunAjaran: settings.tahunAjaranAktif,
      });
    });
    setNilaiList(db.getNilaiBySiswa(selectedSiswa.id));
  };

  // Attendance counts for this student
  const studentAbsensi = selectedSiswa
    ? db.getAbsensiSiswaList().filter((a) => a.siswaId === selectedSiswa.id)
    : [];
  const sakitCount = studentAbsensi.filter((a) => a.status === 'Sakit').length;
  const izinCount = studentAbsensi.filter((a) => a.status === 'Izin').length;
  const alpaCount = studentAbsensi.filter((a) => a.status === 'Alpa').length;

  // Average Score
  const totalScore = nilaiList.reduce((acc, curr) => acc + curr.nilaiAkhir, 0);
  const avgScore = nilaiList.length > 0 ? (totalScore / nilaiList.length).toFixed(1) : '0';

  // Wali Kelas of currently selected class
  const currentKelasObj = kelasList.find((k) => k.nama === selectedKelas);
  const waliKelasName = currentKelasObj?.waliKelas || 'Ibu Guru Kelas, S.Pd.';

  const handlePrintRapor = () => {
    printElement('printable-rapor-container', `Rapor_${selectedSiswa?.namaLengkap.replace(/\s+/g, '_')}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            e-Rapor Digital
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pengelolaan nilai kompetensi siswa, perhitungan Nilai Akhir otomatis, predikat, dan cetak lembar rapor resmi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoGenerateGrades}
            className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-blue-200 cursor-pointer"
            title="Isi otomatis nilai standar untuk siswa ini"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Isi Nilai Cepat</span>
          </button>

          <button
            onClick={handlePrintRapor}
            disabled={!selectedSiswa}
            className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Cetak rapor siswa langsung"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Rapor</span>
          </button>

          <button
            onClick={() => {
              if (selectedSiswa) {
                openPrintWindow('printable-rapor-container', `Rapor_${selectedSiswa.namaLengkap.replace(/\s+/g, '_')}`);
              }
            }}
            disabled={!selectedSiswa}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Buka di tab baru untuk mencetak atau simpan PDF (sangat dianjurkan untuk HP)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buka di Tab Baru / PDF</span>
            <span className="sm:hidden">PDF / Tab Baru</span>
          </button>
        </div>
      </div>

      {/* Class and Student selection bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Pilih Rombel / Kelas
            </label>
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white"
            >
              {kelasList.map((k) => (
                <option key={k.id} value={k.nama}>
                  {k.nama} ({db.getSiswaList().filter((s) => s.kelas === k.nama).length} Siswa)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Pilih Peserta Didik
            </label>
            <select
              value={selectedSiswa?.id || ''}
              onChange={(e) => {
                const s = siswaList.find((item) => item.id === e.target.value);
                if (s) setSelectedSiswa(s);
              }}
              className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white min-w-[220px]"
            >
              {siswaList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.namaLengkap} ({s.qrId})
                </option>
              ))}
              {siswaList.length === 0 && <option value="">Tidak ada siswa di kelas ini</option>}
            </select>
          </div>
        </div>

        {selectedSiswa && (
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <span className="text-slate-400 block text-[11px]">Rata-rata Nilai</span>
              <span className="text-base font-extrabold text-blue-700">{avgScore}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-right">
              <span className="text-slate-400 block text-[11px]">Kehadiran (S/I/A)</span>
              <span className="font-bold text-slate-800">
                {sakitCount} / {izinCount} / {alpaCount}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Grade Table & Form */}
      {selectedSiswa ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Daftar Capaian Nilai Pembelajaran: {selectedSiswa.namaLengkap}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Rumus Nilai Akhir: (30% Tugas + 30% UTS + 40% UAS). Predikat: A (≥90), B (≥80), C (≥70), D (&lt;70).
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-blue-800 bg-blue-100/70 px-2.5 py-1 rounded-lg">
              NISN: {selectedSiswa.nisn}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center w-12">No</th>
                  <th className="px-4 py-3">Mata Pelajaran</th>
                  <th className="px-4 py-3 text-center w-16">KKM</th>
                  <th className="px-4 py-3 text-center w-20">Tugas (30%)</th>
                  <th className="px-4 py-3 text-center w-20">UTS (30%)</th>
                  <th className="px-4 py-3 text-center w-20">UAS (40%)</th>
                  <th className="px-4 py-3 text-center w-24">Nilai Akhir</th>
                  <th className="px-4 py-3 text-center w-20">Predikat</th>
                  <th className="px-4 py-3">Catatan Capaian Kompetensi Guru</th>
                  <th className="px-4 py-3 text-center w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {mapelList.map((mapel, idx) => {
                  const nilaiItem = nilaiList.find((n) => n.mapelId === mapel.id);
                  return (
                    <tr key={mapel.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 block">{mapel.nama}</span>
                        <span className="text-[11px] text-slate-400">Guru: {mapel.guruPengampu || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-600">{mapel.kkm}</td>
                      <td className="px-4 py-3 text-center font-mono font-medium">
                        {nilaiItem ? nilaiItem.tugas : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-medium">
                        {nilaiItem ? nilaiItem.uts : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-medium">
                        {nilaiItem ? nilaiItem.uas : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {nilaiItem ? (
                          <span
                            className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded ${
                              nilaiItem.nilaiAkhir >= mapel.kkm
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-rose-50 text-rose-800'
                            }`}
                          >
                            {nilaiItem.nilaiAkhir}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {nilaiItem ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              nilaiItem.predikat === 'A'
                                ? 'bg-emerald-100 text-emerald-800'
                                : nilaiItem.predikat === 'B'
                                ? 'bg-blue-100 text-blue-800'
                                : nilaiItem.predikat === 'C'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {nilaiItem.predikat}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600 max-w-xs">
                        {nilaiItem?.catatan || (
                          <span className="text-slate-400 italic">Belum ada catatan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleOpenEditNilai(mapel)}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold text-[11px] transition-colors"
                        >
                          Input Nilai
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
          Belum ada siswa yang dipilih atau tidak ada siswa dalam kelas ini.
        </div>
      )}

      {/* MODAL INPUT NILAI PER MAPEL */}
      {isEditNilaiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">Input Nilai Mata Pelajaran</h3>
                <p className="text-xs text-blue-200">
                  {mapelList.find((m) => m.id === editingMapelId)?.nama} - {selectedSiswa?.namaLengkap}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveNilai} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tugas (30%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={valTugas}
                    onChange={(e) => setValTugas(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white text-center font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UTS (30%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={valUts}
                    onChange={(e) => setValUts(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white text-center font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UAS (40%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={valUas}
                    onChange={(e) => setValUas(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white text-center font-bold"
                  />
                </div>
              </div>

              {/* Live Preview of Nilai Akhir & Predikat */}
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between text-xs">
                <span className="text-blue-900 font-semibold">Simulasi Nilai Akhir:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-blue-900 text-sm">
                    {calculateGrade(Number(valTugas), Number(valUts), Number(valUas)).akhir}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-700 text-white font-bold text-[11px]">
                    Predikat {calculateGrade(Number(valTugas), Number(valUts), Number(valUas)).predikat}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Guru / Deskripsi Kemajuan
                </label>
                <textarea
                  rows={3}
                  value={valCatatan}
                  onChange={(e) => setValCatatan(e.target.value)}
                  placeholder="Deskripsi pencapaian kompetensi siswa..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditNilaiOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Simpan Nilai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HIDDEN PRINTABLE RAPOR TEMPLATE (Format Standar Sekolah Dasar Indonesia) */}
      <div id="printable-rapor-container" className="hidden">
        {selectedSiswa && (
          <div
            style={{
              padding: '30px',
              fontFamily: 'serif',
              color: '#000000',
              maxWidth: '850px',
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            {/* Header Kop Surat Rapor */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: '3px double #000000',
                paddingBottom: '12px',
                marginBottom: '16px',
              }}
            >
              <img
                src={settings.logoUrl}
                alt="Logo Sekolah"
                style={{ width: '70px', height: '70px', objectFit: 'contain', marginRight: '20px' }}
              />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '12px', letterSpacing: '1px' }}>
                  PEMERINTAH {settings.kabupaten?.toUpperCase().startsWith('KABUPATEN') ? settings.kabupaten.toUpperCase() : `KABUPATEN ${settings.kabupaten?.toUpperCase() || 'DAERAH'}`}
                </h4>
                <h4 style={{ margin: '2px 0', fontSize: '13px' }}>
                  DINAS PENDIDIKAN DAN KEBUDAYAAN
                </h4>
                <h2 style={{ margin: '2px 0', fontSize: '18px', fontWeight: 'bold' }}>
                  {settings.namaSekolah}
                </h2>
                <p style={{ margin: 0, fontSize: '11px', fontFamily: 'sans-serif' }}>
                  {settings.alamat} | NPSN: {settings.npsn} | Email: {settings.email}
                </p>
              </div>
            </div>

            {/* Judul Dokumen */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', textDecoration: 'underline' }}>
                LAPORAN HASIL BELAJAR PESERTA DIDIK (RAPOR)
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', fontFamily: 'sans-serif' }}>
                Tahun Ajaran {settings.tahunAjaranAktif} - Semester {settings.semesterAktif}
              </p>
            </div>

            {/* Identitas Siswa */}
            <table
              style={{
                width: '100%',
                fontSize: '12px',
                marginBottom: '16px',
                fontFamily: 'sans-serif',
              }}
            >
              <tbody>
                <tr>
                  <td style={{ width: '18%' }}>Nama Peserta Didik</td>
                  <td style={{ width: '2%' }}>:</td>
                  <td style={{ width: '40%', fontWeight: 'bold' }}>{selectedSiswa.namaLengkap}</td>
                  <td style={{ width: '18%' }}>Kelas / Rombel</td>
                  <td style={{ width: '2%' }}>:</td>
                  <td style={{ width: '20%' }}>{selectedSiswa.kelas}</td>
                </tr>
                <tr>
                  <td>NISN / No. Induk</td>
                  <td>:</td>
                  <td>
                    {selectedSiswa.nisn} / {selectedSiswa.nomorInduk}
                  </td>
                  <td>Semester</td>
                  <td>:</td>
                  <td>{settings.semesterAktif}</td>
                </tr>
              </tbody>
            </table>

            {/* Tabel Nilai */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '11px',
                marginBottom: '20px',
                fontFamily: 'sans-serif',
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    No
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>
                    Mata Pelajaran
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    KKM
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    Tugas
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    UTS
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    UAS
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    Nilai Akhir
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                    Predikat
                  </th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>
                    Capaian Kompetensi
                  </th>
                </tr>
              </thead>
              <tbody>
                {mapelList.map((mapel, idx) => {
                  const item = nilaiList.find((n) => n.mapelId === mapel.id);
                  return (
                    <tr key={mapel.id}>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                        {idx + 1}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '6px' }}>{mapel.nama}</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                        {mapel.kkm}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                        {item?.tugas ?? '-'}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                        {item?.uts ?? '-'}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>
                        {item?.uas ?? '-'}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '6px',
                          textAlign: 'center',
                          fontWeight: 'bold',
                        }}
                      >
                        {item?.nilaiAkhir ?? '-'}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '6px',
                          textAlign: 'center',
                          fontWeight: 'bold',
                        }}
                      >
                        {item?.predikat ?? '-'}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '6px', fontSize: '10px' }}>
                        {item?.catatan ?? 'Mencapai kompetensi dasar dengan baik.'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Kehadiran & Catatan Wali */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', fontSize: '11px', fontFamily: 'sans-serif' }}>
              <div style={{ flex: 1, border: '1px solid #000', padding: '10px', borderRadius: '4px' }}>
                <strong style={{ display: 'block', marginBottom: '6px' }}>
                  Ketidakhadiran (Presensi)
                </strong>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '60%' }}>1. Sakit</td>
                      <td>: {sakitCount} hari</td>
                    </tr>
                    <tr>
                      <td>2. Izin</td>
                      <td>: {izinCount} hari</td>
                    </tr>
                    <tr>
                      <td>3. Tanpa Keterangan (Alpa)</td>
                      <td>: {alpaCount} hari</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ flex: 2, border: '1px solid #000', padding: '10px', borderRadius: '4px' }}>
                <strong style={{ display: 'block', marginBottom: '6px' }}>
                  Catatan & Motivasi Wali Kelas
                </strong>
                <p style={{ margin: 0, fontStyle: 'italic' }}>
                  "Pertahankan prestasi belajarmu, tetap rajin membaca buku perpustakaan dan tingkatkan semangat dalam kegiatan kepramukaan serta budi pekerti."
                </p>
              </div>
            </div>

            {/* Tanda Tangan */}
            <table
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                marginTop: '40px',
              }}
            >
              <tbody>
                <tr>
                  <td style={{ width: '33%' }}>
                    Mengetahui,
                    <br />
                    Orang Tua / Wali
                    <br />
                    <br />
                    <br />
                    <br />
                    ........................................
                  </td>
                  <td style={{ width: '33%' }}>
                    <br />
                    Wali Kelas {selectedSiswa.kelas}
                    <br />
                    <br />
                    <br />
                    <br />
                    <strong>{waliKelasName}</strong>
                  </td>
                  <td style={{ width: '33%' }}>
                    {settings.kecamatan || settings.kabupaten || 'Daerah'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    <br />
                    Kepala Sekolah
                    <br />
                    <br />
                    <br />
                    <br />
                    <strong>{settings.namaKepalaSekolah}</strong>
                    <br />
                    NIP. {settings.nipKepalaSekolah}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
